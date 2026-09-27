"""
main.py
-------
FastAPI application — AI CCTV Video Analytics backend.

Endpoints:
  POST   /api/source          — set video source (webcam or URL)
  DELETE /api/source          — stop current stream
  GET    /api/stream          — MJPEG stream of processed frames
  POST   /api/boundary        — set virtual boundary polygon
  DELETE /api/boundary        — clear boundary
  GET    /api/alerts          — get all alerts (JSON)
  DELETE /api/alerts          — clear alerts
  WS     /ws                  — push {summary, alerts, active_intrusion} per frame
"""

import sys
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

import asyncio
import json
import os
import threading
import time
import cv2
import numpy as np
from collections import defaultdict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from video_stream    import VideoStream
from detector        import Detector
from boundary        import BoundaryManager
from alerts          import AlertManager
from detection_log   import DetectionLog
from ocr_reader      import OCRReader
from email_notifier  import EmailNotifier
from blockchain.event_ledger import EventLedger, EVIDENCE_DIR

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(title="OmniVision AI CCTV Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve off-chain evidence photos directly
app.mount("/api/evidence", StaticFiles(directory=EVIDENCE_DIR), name="evidence")

# ---------------------------------------------------------------------------
# Shared singletons
# ---------------------------------------------------------------------------

stream         = VideoStream()
detector       = Detector()
_yolo_lock     = __import__("threading").Lock()
boundary       = BoundaryManager()
alert_mgr      = AlertManager()
detect_log     = DetectionLog()
ocr_reader     = OCRReader()
email_notifier = EmailNotifier()
blockchain     = EventLedger()

# Latest processed data (updated by the processing thread)
_state_lock = threading.Lock()
_latest: dict = {
    "detections":        [],
    "summary":           {},           # {category: {label: count}} — built from YOLO output
    "intruding_indices": set(),
    "dwell_times":       {},
    "active_intrusion":  False,
    "camera_blocked":    False,
    "ocr":               {},
    "email_status":      email_notifier.get_status(),
    "error":             None,
}

# Camera occlusion / blockage tracker
_occlusion_counter = 0
_camera_blocked_state = False
_last_blocked_alert_time = 0.0

# Number plate log deduplication tracker
_last_logged_plate = ""
_last_logged_plate_time = 0.0

# WebSocket clients
_ws_clients: set[WebSocket] = set()
_ws_lock = asyncio.Lock()

# ---------------------------------------------------------------------------
# Processing thread
# ---------------------------------------------------------------------------

PROCESS_EVERY_N = 2   # run YOLO on every Nth frame for performance
_frame_counter  = 0


def processing_loop():
    global _frame_counter, _occlusion_counter, _camera_blocked_state, _last_blocked_alert_time
    global _last_logged_plate, _last_logged_plate_time
    while True:
        time.sleep(0.02)   # ~50 fps ceiling

        if not stream.is_running:
            with _state_lock:
                _latest["error"] = stream.error
                _latest["camera_blocked"] = False
                _latest["ocr"] = {"detected": False}
                _latest["detections"] = []
                _latest["active_intrusion"] = False
            _camera_blocked_state = False
            _occlusion_counter = 0
            continue

        frame = stream.get_frame()
        if frame is None:
            continue

        _frame_counter += 1
        if _frame_counter % PROCESS_EVERY_N != 0:
            continue

        h, w = frame.shape[:2]
        boundary.update_frame_size(w, h)

        # --- Camera occlusion / blockage check ---
        # When lens is covered by hand or object: average brightness is very low
        # Or image is completely flat/blurred with near-zero contrast/variance
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        mean_b = float(np.mean(gray))
        std_b = float(np.std(gray))
        lap_v = float(cv2.Laplacian(gray, cv2.CV_64F).var())

        # Occluded if dark (<28.0) or flat/featureless (<7.0 std and <18.0 laplacian)
        is_occluded = (mean_b < 28.0) or (std_b < 7.0 and lap_v < 18.0) or (mean_b < 40.0 and std_b < 9.0)

        if is_occluded:
            _occlusion_counter += 1
        else:
            _occlusion_counter = max(0, _occlusion_counter - 1)

        is_blocked = (_occlusion_counter >= 2)

        if is_blocked:
            if not _camera_blocked_state:
                _camera_blocked_state = True
                alert_mgr.add_custom_alert(
                    title="CAMERA OCCLUSION DETECTED",
                    message="CRITICAL: Camera lens covered or visual feed obstructed!",
                    category="TAMPER",
                    emoji="🚨"
                )
                detect_log.add_custom_entry(
                    label="CAMERA OCCLUSION",
                    category="TAMPER",
                    confidence=1.0,
                    intruding=True,
                    emoji="🚨"
                )
                _last_blocked_alert_time = time.time()
            else:
                if time.time() - _last_blocked_alert_time > 10.0:
                    alert_mgr.add_custom_alert(
                        title="CAMERA STILL BLOCKED",
                        message="Ongoing camera feed occlusion detected!",
                        category="TAMPER",
                        emoji="🚨"
                    )
                    _last_blocked_alert_time = time.time()
        else:
            if _camera_blocked_state:
                _camera_blocked_state = False
                alert_mgr.add_custom_alert(
                    title="CAMERA RESTORED",
                    message="Visual feed restored — surveillance active",
                    category="SYSTEM",
                    emoji="✅"
                )
                detect_log.add_custom_entry(
                    label="CAMERA RESTORED",
                    category="SYSTEM",
                    confidence=1.0,
                    intruding=False,
                    emoji="✅"
                )

        # --- YOLO detection ---
        with _yolo_lock:
            detections = detector.detect(frame)

        # --- Boundary check (inside OR touching edge) ---
        intruding = set()
        if boundary.is_active():
            for i, det in enumerate(detections):
                if boundary.is_inside_or_touching(det["ref_point"]):
                    intruding.add(i)

        # --- OCR & ANPR: Scan vehicles and foreground items asynchronously ---
        latest_ocr = ocr_reader.get_latest()
        for i, det in enumerate(detections):
            is_veh = (det["category"] == "VEHICLE") or (det["label"] in {"car", "motorcycle", "bus", "truck", "van", "auto", "license plate", "number plate"})
            is_phone = (det["label"] in {"cell phone", "laptop"})
            # Automatically scan verified vehicles, license plates, phones, or high-dwell intruders
            is_target = is_veh or is_phone or (i in intruding and dwell_times.get(det.get("track_id", 0), 0) >= 4.0)

            if is_target:
                x1, y1, x2, y2 = det["bbox"]
                x1, y1 = max(0, int(x1)), max(0, int(y1))
                x2, y2 = min(w, int(x2)), min(h, int(y2))
                if (x2 - x1) > 40 and (y2 - y1) > 20:
                    ocr_reader.submit_async(frame[y1:y2, x1:x2], label=det["label"], category=det["category"], cooldown_sec=1.5)

            # If recent OCR matches or is fresh within 3.5s, enrich this detection
            if latest_ocr.get("detected") and (time.time() - latest_ocr.get("timestamp", 0) < 3.5):
                if (det["label"] == latest_ocr.get("label")) or (det["category"] == latest_ocr.get("category")) or is_veh or is_phone or (i in intruding):
                    det["ocr_text"] = latest_ocr.get("best_text", "")
                    det["is_plate"] = latest_ocr.get("is_plate", False)
                    det["plate_number"] = latest_ocr.get("plate_number", "")

        # Automatically log confirmed number plates under "NO. PLATES" category
        if latest_ocr.get("is_plate") and latest_ocr.get("plate_number"):
            p_num = latest_ocr.get("plate_number")
            if (p_num != _last_logged_plate) or (time.time() - _last_logged_plate_time > 10.0):
                detect_log.add_custom_entry(
                    label=p_num,
                    category="NO. PLATES",
                    confidence=latest_ocr.get("confidence", 0.95),
                    intruding=False,
                    emoji="🚘"
                )
                _last_logged_plate = p_num
                _last_logged_plate_time = time.time()

        # --- Alert management (5-second dwell timer) ---
        new_alerts = alert_mgr.process(detections, intruding)
        dwell_times = alert_mgr.get_dwell_times(detections, intruding)

        # Dispatch automated email alert & mine cryptographic blockchain block if breach fired
        if new_alerts:
            for alt in new_alerts:
                print(f"[MAIN] [ALERT] INTRUSION FIRED: {alt.get('message', 'Boundary breached')}")
                # Mine and record immutable block with snapshot evidence to Blockchain ledger
                try:
                    # Create annotated evidence photo with red perimeter zone overlay & intruder box
                    annotated = frame.copy()
                    pts = boundary.get_points()
                    if len(pts) >= 3:
                        poly = np.array([[int(p[0] * w), int(p[1] * h)] for p in pts], np.int32)
                        overlay = annotated.copy()
                        cv2.fillPoly(overlay, [poly], (0, 0, 200))
                        cv2.addWeighted(overlay, 0.25, annotated, 0.75, 0, annotated)
                        cv2.polylines(annotated, [poly], True, (0, 0, 255), 2)

                    # Draw intruder bounding box + label
                    if alt.get("bbox"):
                        bx1, by1, bx2, by2 = [int(v) for v in alt["bbox"]]
                        conf_pct = int(alt.get("confidence", 0.9) * 100)
                        lbl_text = f"INTRUDER: {alt.get('label', '').upper()} {conf_pct}%"
                        cv2.rectangle(annotated, (bx1, by1), (bx2, by2), (0, 0, 255), 2)
                        # Label background bar
                        (tw, th), _ = cv2.getTextSize(lbl_text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
                        cv2.rectangle(annotated, (bx1, max(0, by1 - th - 8)), (bx1 + tw + 4, by1), (0, 0, 200), -1)
                        cv2.putText(annotated, lbl_text, (bx1 + 2, max(th, by1 - 4)),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

                    # Burn CCTV-style HUD overlay: timestamp + dwell + camera ID
                    cam_id = getattr(stream, "_label", None) or getattr(stream, "source_label", None) or "CAM-01"
                    ts_text  = f"OmniVision | {cam_id} | {alt.get('time', time.strftime('%H:%M:%S'))}"
                    dwl_text = f"DWELL: {alt.get('dwell_sec', 0):.1f}s  |  INTRUSION ALERT"
                    # Bottom black bar
                    cv2.rectangle(annotated, (0, h - 32), (w, h), (0, 0, 0), -1)
                    cv2.putText(annotated, ts_text,  (6, h - 18), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 128), 1)
                    cv2.putText(annotated, dwl_text, (6, h - 4),  cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 180, 255), 1)
                    # Top-right: EVIDENCE CAPTURE label
                    cv2.rectangle(annotated, (w - 200, 0), (w, 22), (0, 0, 180), -1)
                    cv2.putText(annotated, "EVIDENCE CAPTURE", (w - 196, 15), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)

                    # Compress to JPEG
                    _, img_buf = cv2.imencode('.jpg', annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
                    snap_bytes = img_buf.tobytes() if img_buf is not None else None

                    blk = blockchain.record_security_event(
                        "HUMAN_INTRUSION", alt,
                        camera_id=cam_id,
                        snapshot_bytes=snap_bytes
                    )
                    print(f"[OMNIVISION LEDGER] Anchored Event #{blk.index} ({blk.event_type}) | Hash: {blk.hash[:16]}... | Evidence: {blk.evidence_filename}")
                except Exception as e:
                    import traceback; traceback.print_exc()
                    print(f"[MAIN] [ERROR] Security event anchoring failed: {e}")


                try:
                    email_notifier.send_intrusion_alert_async(alt, frame, boundary.get_points())
                except Exception as e:
                    print(f"[MAIN] [ERROR] Email dispatch trigger failed: {e}")

        # --- Detection log (every detected object, deduplicated) ---
        detect_log.update(detections, intruding)

        # --- Summary: two-level {category → {yolo_label → count}} ---
        summary: dict[str, dict[str, int]] = {}
        for det in detections:
            cat = det["category"]           # e.g. "VEHICLE" (from JSON)
            lbl = det["label"]              # e.g. "car"    (from YOLO)
            if cat not in summary:
                summary[cat] = {}
            summary[cat][lbl] = summary[cat].get(lbl, 0) + 1

        if latest_ocr.get("is_plate") and latest_ocr.get("plate_number") and (time.time() - latest_ocr.get("timestamp", 0) < 6.0):
            if "NO. PLATES" not in summary:
                summary["NO. PLATES"] = {}
            summary["NO. PLATES"][latest_ocr.get("plate_number")] = 1

        # Broadcast OCR data if fresh (< 4.5s), otherwise clear so client HUD naturally dismisses
        is_fresh_ocr = latest_ocr.get("detected") and (time.time() - latest_ocr.get("timestamp", 0) < 4.5)
        ocr_broadcast = latest_ocr if is_fresh_ocr else {"detected": False}

        with _state_lock:
            _latest["detections"]        = detections
            _latest["summary"]           = summary
            _latest["intruding_indices"] = intruding
            _latest["dwell_times"]       = dwell_times
            _latest["camera_blocked"]    = _camera_blocked_state
            _latest["active_intrusion"]  = (len(intruding) > 0) or _camera_blocked_state
            _latest["ocr"]               = ocr_broadcast
            _latest["email_status"]      = email_notifier.get_status()
            _latest["error"]             = stream.error


_proc_thread = threading.Thread(target=processing_loop, daemon=True)
# Started in startup() to prevent multiprocessing deadlock on Windows


# ---------------------------------------------------------------------------
# MJPEG stream generator
# ---------------------------------------------------------------------------

def mjpeg_generator():
    """Yield processed frames as multipart JPEG."""
    while True:
        time.sleep(0.033)   # ~30 fps

        if not stream.is_running:
            # Send a black "no signal" frame
            blank = np.zeros((480, 640, 3), dtype=np.uint8)
            msg = stream.error or "No stream active"
            cv2.putText(
                blank, msg,
                (30, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.8,
                (0, 60, 200), 2, cv2.LINE_AA,
            )
            ret, buf = cv2.imencode(".jpg", blank)
            if ret:
                yield (
                    b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
                    + buf.tobytes()
                    + b"\r\n"
                )
            continue

        frame = stream.get_frame()
        if frame is None:
            continue

        # Draw boundary (flash when actively intruding)
        with _state_lock:
            alert_on = _latest["active_intrusion"]
            is_cam_blocked = _latest.get("camera_blocked", False)
        frame = boundary.draw(frame, alert_active=alert_on)

        # Draw detections
        with _state_lock:
            dets      = _latest["detections"]
            intruding = _latest["intruding_indices"]

        frame = detector.draw(frame, dets, intruding)

        # Flash red border on intrusion or camera occlusion
        if intruding or is_cam_blocked:
            h, w = frame.shape[:2]
            cv2.rectangle(frame, (0, 0), (w - 1, h - 1), (0, 0, 255), 6)

        if is_cam_blocked:
            h, w = frame.shape[:2]
            overlay = frame.copy()
            cv2.rectangle(overlay, (20, h // 2 - 40), (w - 20, h // 2 + 40), (10, 10, 20), -1)
            cv2.addWeighted(overlay, 0.8, frame, 0.2, 0, frame)
            cv2.putText(
                frame, "WARNING: CAMERA BLOCKED / OCCLUDED",
                (max(25, w // 2 - 250), h // 2 - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.72,
                (0, 0, 255), 2, cv2.LINE_AA,
            )
            cv2.putText(
                frame, "Lens covered - Tamper event logged in Alerts tab",
                (max(25, w // 2 - 230), h // 2 + 24), cv2.FONT_HERSHEY_SIMPLEX, 0.52,
                (0, 215, 255), 1, cv2.LINE_AA,
            )

        ret, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if ret:
            yield (
                b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
                + buf.tobytes()
                + b"\r\n"
            )


# ---------------------------------------------------------------------------
# WebSocket broadcaster
# ---------------------------------------------------------------------------

async def broadcast_loop():
    """Send detection state to all WS clients every 200 ms."""
    while True:
        await asyncio.sleep(0.2)
        if not _ws_clients:
            continue

        with _state_lock:
            summary        = _latest["summary"]
            cam1_summary   = _latest.get("cam1_summary", None)
            intrusion      = _latest["active_intrusion"]
            camera_blocked = _latest.get("camera_blocked", False)
            ocr_data       = _latest.get("ocr", {})
            error          = _latest["error"]

        recent_alerts = alert_mgr.get_all()[:20]
        recent_log    = detect_log.get_all()[:60]

        with _state_lock:
            dwell_times  = _latest.get("dwell_times", {})
            email_status = _latest.get("email_status", {})

        # Convert set keys to strings for JSON serialisation
        dwell_serialisable = {str(k): round(v, 1) for k, v in dwell_times.items()}

        # Include blockchain state in WS payload for live real-time sync
        chain_data = blockchain.get_chain()
        is_chain_valid, chain_msg = blockchain.validate_chain()

        payload = {
            "summary":          summary,
            "cam1_summary":     cam1_summary,
            "active_intrusion": intrusion,
            "camera_blocked":   camera_blocked,
            "alerts":           recent_alerts,
            "dwell_times":      dwell_serialisable,
            "detection_log":    recent_log,
            "detection_mode":   detector.mode,
            "ocr":              ocr_data,
            "email_status":     email_status,
            "blockchain": {
                "valid": is_chain_valid,
                "message": chain_msg,
                "length": len(chain_data),
                "chain": chain_data,
                "model_security": _ai_model_status,
            },
            "model_security":   _ai_model_status,
            "error":            error,
        }

        dead = set()
        async with _ws_lock:
            for ws in _ws_clients:
                try:
                    await ws.send_json(payload)
                except Exception:
                    dead.add(ws)
            _ws_clients.difference_update(dead)


APPROVED_MODEL_HASH_FILE = os.path.join(os.path.dirname(__file__), "approved_model_hash.txt")
MODEL_PATH = "yolov8s-worldv2.pt"

_ai_model_status = {
    "is_tampered": False,
    "status": "VERIFIED",
    "expected_hash": "",
    "current_hash": "",
    "message": "AI Model Integrity Verified.",
    "last_checked": ""
}

def get_actual_model_hash() -> str | None:
    if not os.path.exists(MODEL_PATH):
        return None
    import hashlib
    m = hashlib.sha256()
    with open(MODEL_PATH, "rb") as f:
        while chunk := f.read(8192):
            m.update(chunk)
    return m.hexdigest()

def get_approved_model_hash() -> str:
    if os.path.exists(APPROVED_MODEL_HASH_FILE):
        try:
            with open(APPROVED_MODEL_HASH_FILE, "r", encoding="utf-8") as f:
                h = f.read().strip()
                if len(h) == 64:
                    return h
        except Exception:
            pass
    actual = get_actual_model_hash()
    if actual:
        save_approved_model_hash(actual)
        return actual
    return "7e30b1bbcc04203c1b3f03d8353f27b6210f9863d6c6855f264ee0251160f036"

def save_approved_model_hash(hash_val: str):
    try:
        with open(APPROVED_MODEL_HASH_FILE, "w", encoding="utf-8") as f:
            f.write(hash_val)
    except Exception as e:
        print(f"[SECURITY] Warning: Could not save approved model hash: {e}")

def verify_ai_model_integrity(record_blockchain: bool = True):
    global _ai_model_status
    if not os.path.exists(MODEL_PATH):
        _ai_model_status = {
            "is_tampered": False,
            "status": "NOT_FOUND",
            "expected_hash": "N/A",
            "current_hash": "N/A",
            "message": "Model file yolov8s-worldv2.pt not found on disk.",
            "last_checked": time.strftime("%H:%M:%S")
        }
        return _ai_model_status

    approved_hash = get_approved_model_hash()
    current_hash = get_actual_model_hash()

    if current_hash != approved_hash:
        msg = f"[SECURITY] AI Model Tampering Detected! Expected {approved_hash[:8]}, Got {current_hash[:8]}"
        print(f"\033[91m{msg}\033[0m")
        _ai_model_status = {
            "is_tampered": True,
            "status": "TAMPERED",
            "expected_hash": approved_hash,
            "current_hash": current_hash,
            "message": msg,
            "last_checked": time.strftime("%H:%M:%S")
        }
        if record_blockchain:
            latest_events = blockchain.get_chain()
            last_evt = latest_events[-1] if latest_events else {}
            last_type = last_evt.get("event_type") if isinstance(last_evt, dict) else getattr(last_evt, "event_type", None)
            last_label = str(last_evt.get("label", "")) if isinstance(last_evt, dict) else str(getattr(last_evt, "label", ""))

            if not (latest_events and last_type in ("MODEL_TAMPER", "CAMERA_TAMPER") and approved_hash[:8] in last_label):
                blockchain.record_security_event(
                    event_type="MODEL_TAMPER",
                    alert_data={
                        "label": f"AI_MODEL_TAMPERED (Expected {approved_hash[:8]}, Got {current_hash[:8]})",
                        "category": "SECURITY_ALERT",
                        "confidence": 1.0,
                        "dwell_sec": 0.0,
                        "boundary": [],
                    },
                    camera_id="SYSTEM_AUDIT",
                    snapshot_bytes=None
                )
    else:
        msg = f"[SECURITY] AI Model Integrity Verified (SHA-256 Match: {current_hash[:8]})."
        print(f"\033[92m{msg}\033[0m")
        _ai_model_status = {
            "is_tampered": False,
            "status": "VERIFIED",
            "expected_hash": approved_hash,
            "current_hash": current_hash,
            "message": msg,
            "last_checked": time.strftime("%H:%M:%S")
        }
    return _ai_model_status

@app.on_event("startup")
async def startup():
    verify_ai_model_integrity()
    asyncio.create_task(broadcast_loop())
    _proc_thread.start()
    ocr_reader.start_engine()


# ---------------------------------------------------------------------------
# REST Endpoints
# ---------------------------------------------------------------------------

@app.get("/")
@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "service": "SIHCCTV Analytics",
        "active_stream": stream.is_running,
        "mode": detector.mode
    }


class SourceRequest(BaseModel):
    type: str          # "webcam" | "url"
    url:  str = ""


@app.post("/api/source")
async def set_source(req: SourceRequest):
    if req.type == "webcam":
        ok = stream.start(0)
    elif req.type == "url":
        if not req.url:
            return JSONResponse({"ok": False, "error": "URL is required"}, status_code=400)
        ok = stream.start(req.url)
    else:
        return JSONResponse({"ok": False, "error": "Unknown source type"}, status_code=400)

    if not ok:
        return JSONResponse({"ok": False, "error": stream.error}, status_code=400)

    alert_mgr.clear()
    detect_log.clear()
    boundary.clear()
    return {"ok": True}


@app.delete("/api/source")
async def stop_source():
    stream.stop()
    alert_mgr.clear()
    detect_log.clear()
    return {"ok": True}


@app.get("/api/stream")
async def video_stream():
    return StreamingResponse(
        mjpeg_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


class BoundaryRequest(BaseModel):
    points: list[list[float]]   # [[x,y], ...] normalised 0..1


@app.post("/api/boundary")
async def set_boundary(req: BoundaryRequest):
    if len(req.points) < 3:
        return JSONResponse({"ok": False, "error": "Need at least 3 points"}, status_code=400)
    boundary.set_boundary(req.points)
    return {"ok": True, "points": len(req.points)}


@app.delete("/api/boundary")
async def clear_boundary():
    boundary.clear()
    return {"ok": True}


@app.get("/api/alerts")
async def get_alerts():
    return {"alerts": alert_mgr.get_all()}


@app.delete("/api/alerts")
async def clear_alerts():
    alert_mgr.clear()
    return {"ok": True}


@app.get("/api/detection-log")
async def get_detection_log():
    """Return the full rolling detection log (newest first)."""
    return {"log": detect_log.get_all()}


@app.delete("/api/detection-log")
async def clear_detection_log():
    detect_log.clear()
    return {"ok": True}


@app.delete("/api/logs")
async def clear_all_logs():
    """Clear both incident alerts and detection logs simultaneously."""
    alert_mgr.clear()
    detect_log.clear()
    with _state_lock:
        _latest["active_intrusion"] = False
    return {"ok": True}


# ---------------------------------------------------------------------------
# Cryptographic Blockchain Audit Ledger Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/blockchain/chain")
def get_blockchain_chain():
    """Returns full cryptographic blockchain ledger of intrusion blocks."""
    chain_data = blockchain.get_chain()
    is_valid, msg = blockchain.validate_chain()
    if _ai_model_status.get("is_tampered"):
        is_valid = False
        exp_h = _ai_model_status.get("expected_hash", "")[:8]
        got_h = _ai_model_status.get("current_hash", "")[:8]
        msg = f"🚨 AI MODEL TAMPERED! Expected {exp_h}, Got {got_h}. Access Denied."
    return {
        "ok": True,
        "valid": is_valid,
        "message": msg,
        "length": len(chain_data),
        "chain": chain_data,
        "model_security": _ai_model_status
    }


@app.get("/api/blockchain/verify")
def verify_blockchain_integrity():
    """Runs a 1-click cryptographic integrity audit across all linked blocks."""
    is_valid, msg = blockchain.validate_chain()
    chain_data = blockchain.get_chain()
    if _ai_model_status.get("is_tampered"):
        is_valid = False
        exp_h = _ai_model_status.get("expected_hash", "")[:8]
        got_h = _ai_model_status.get("current_hash", "")[:8]
        msg = f"🚨 SECURITY DENIAL: AI Model weights altered! Expected {exp_h}, Got {got_h}. Audit Failed."
    return {
        "ok": True,
        "valid": is_valid,
        "message": msg,
        "length": len(chain_data),
        "latest_hash": chain_data[-1]["hash"] if chain_data else None,
        "model_security": _ai_model_status
    }


@app.post("/api/blockchain/mine-test-block")
def mine_test_blockchain_block():
    """Mines a real test intrusion block with camera snapshot (or generated target evidence frame)."""
    try:
        frame = stream.get_frame()
        snap_bytes = None
        if frame is not None:
            h, w = frame.shape[:2]
            annotated = frame.copy()
            pts = boundary.get_points()
            if len(pts) >= 3:
                poly = np.array([[int(p[0] * w), int(p[1] * h)] for p in pts], np.int32)
                overlay = annotated.copy()
                cv2.fillPoly(overlay, [poly], (0, 0, 230))
                cv2.addWeighted(overlay, 0.3, annotated, 0.7, 0, annotated)
                cv2.polylines(annotated, [poly], True, (0, 0, 255), 2)
            _, img_buf = cv2.imencode('.jpg', annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
            snap_bytes = img_buf.tobytes() if img_buf is not None else None
        else:
            # Generate synthetic evidence photo canvas (400x300 dark surveillance frame)
            canvas = np.zeros((300, 400, 3), dtype=np.uint8)
            canvas[:, :] = (20, 25, 35)
            cv2.rectangle(canvas, (40, 40), (360, 260), (0, 0, 200), 2)
            cv2.rectangle(canvas, (140, 80), (260, 230), (0, 0, 255), 2)
            cv2.putText(canvas, "INTRUDER: PERSON 94.5%", (142, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 255), 1)
            cv2.putText(canvas, "OmniVision SHA-256 Test Beacon", (10, 290), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (100, 200, 100), 1)
            _, img_buf = cv2.imencode('.jpg', canvas, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
            snap_bytes = img_buf.tobytes() if img_buf is not None else None

        # Safe camera label — stream may not have a label attribute
        cam_label = getattr(stream, "current_source_label", None) or getattr(stream, "_label", None) or "TEST-CAM"

        test_alert = {
            "title": "PERIMETER BREACH TEST BEACON",
            "message": "Manual test breach triggered from Blockchain Command Center",
            "label": "person",
            "category": "HUMAN",
            "confidence": 0.945,
            "dwell_sec": 5.2,
            "boundary": boundary.get_points(),
            "time": time.strftime("%H:%M:%S")
        }

        blk = blockchain.record_security_event("HUMAN_INTRUSION", test_alert, camera_id=cam_label, snapshot_bytes=snap_bytes)
        return {"ok": True, "block": blk.to_dict()}

    except Exception as exc:
        import traceback
        traceback.print_exc()
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=500)


@app.post("/api/blockchain/corrupt")
def corrupt_blockchain_demo():
    """Simulates a malicious tampering attack to test tamper detection in front of judges."""
    try:
        ok, msg = blockchain.corrupt_chain()
        return {"ok": ok, "message": msg}
    except Exception as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=500)


@app.post("/api/blockchain/repair")
def repair_blockchain_demo():
    """Re-computes cryptographic proof of work across all blocks to repair chain."""
    try:
        ok, msg = blockchain.repair_chain()
        return {"ok": ok, "message": msg}
    except Exception as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=500)


@app.get("/api/model/status")
def get_model_security_status():
    """Returns the live AI Model Security & Integrity status."""
    return verify_ai_model_integrity(record_blockchain=False)

@app.post("/api/blockchain/corrupt-ai")
def corrupt_ai_model():
    """Simulates an AI model tamper by appending a corrupted byte sequence."""
    if os.path.exists(MODEL_PATH):
        with open(MODEL_PATH, "ab") as f:
            f.write(b"corrupted_byte")
        status = verify_ai_model_integrity(record_blockchain=True)
        return {"ok": True, "message": status["message"], "status": status}
    return JSONResponse({"ok": False, "error": "Model file not found"}, status_code=404)

@app.post("/api/blockchain/restore-ai")
@app.post("/api/model/repair")
def restore_ai_model():
    """Restores the AI model file & re-anchors the verified SHA-256 hash to Blockchain Ledger."""
    if os.path.exists(MODEL_PATH):
        with open(MODEL_PATH, "rb") as f:
            data = f.read()
        if data.endswith(b"corrupted_byte"):
            data = data[:-14]
            with open(MODEL_PATH, "wb") as f:
                f.write(data)

        current_hash = get_actual_model_hash()
        if current_hash:
            save_approved_model_hash(current_hash)
        
        status = verify_ai_model_integrity(record_blockchain=False)
        
        blk = blockchain.record_security_event(
            event_type="MODEL_REPAIRED",
            alert_data={
                "label": f"AI_MODEL_REPAIRED (Re-anchored SHA-256: {current_hash[:8] if current_hash else 'N/A'})",
                "category": "SECURITY_REPAIR",
                "confidence": 1.0,
                "dwell_sec": 0.0,
                "boundary": [],
            },
            camera_id="SYSTEM_AUDIT",
            snapshot_bytes=None
        )
        msg = f"[SECURITY] AI Model Restored & Cryptographically Re-anchored to SHA-256 ({current_hash[:8] if current_hash else 'N/A'})."
        print(f"\033[96m{msg}\033[0m")
        blk_dict = blk.to_dict() if hasattr(blk, "to_dict") else blk
        return {"ok": True, "message": msg, "block": blk_dict, "status": status}
    return JSONResponse({"ok": False, "error": "Model file not found"}, status_code=404)

@app.delete("/api/blockchain/reset")
def reset_blockchain_demo():
    """Resets the ledger back to Genesis Block #0."""
    try:
        ok, msg = blockchain.reset_chain()
        return {"ok": ok, "message": msg}
    except Exception as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=500)


class ModeRequest(BaseModel):
    mode: str  # "all" | "person_wearables"


@app.post("/api/detection-mode")
async def set_detection_mode(req: ModeRequest):
    if req.mode not in ("all", "person_wearables"):
        return JSONResponse({"ok": False, "error": "Invalid mode"}, status_code=400)
    current = detector.set_mode(req.mode)
    return {"ok": True, "mode": current}


@app.get("/api/detection-mode")
async def get_detection_mode():
    return {"mode": detector.mode}


# ---------------------------------------------------------------------------
# OCR & ANPR Endpoints
# ---------------------------------------------------------------------------

@app.post("/api/ocr/scan")
def trigger_ocr_scan():
    """Immediately capture current frame and run OCR/ANPR text extraction."""
    if not stream.is_running:
        return JSONResponse({"ok": False, "error": "No stream active"}, status_code=400)

    frame = stream.get_frame()
    if frame is None:
        return JSONResponse({"ok": False, "error": "No frame available from video stream"}, status_code=400)

    global _last_logged_plate, _last_logged_plate_time

    h, w = frame.shape[:2]
    # Crop out top 8% of frame to eliminate DroidCam watermark / timestamp overlay
    clean_frame = frame[int(h * 0.08):, :]

    # Prioritize vehicle, license plate, cell phone, book, or foreground objects
    target_crop = clean_frame
    best_label = ""
    best_cat = ""
    with _state_lock:
        dets = _latest.get("detections", [])
        candidates = [
            d for d in dets
            if d["category"] == "VEHICLE"
            or d["label"] in {"car", "license plate", "number plate", "motorcycle", "bus", "truck", "book", "cell phone"}
        ]
        if not candidates and dets:
            candidates = [d for d in dets if d["category"] != "HUMAN"]
        if candidates:
            best_det = max(candidates, key=lambda d: (d["bbox"][2] - d["bbox"][0]) * (d["bbox"][3] - d["bbox"][1]))
            x1, y1, x2, y2 = best_det["bbox"]
            x1, y1 = max(0, int(x1)), max(0, int(y1))
            x2, y2 = min(w, int(x2)), min(h, int(y2))
            if (x2 - x1) > 40 and (y2 - y1) > 20:
                target_crop = frame[y1:y2, x1:x2]
                best_label = best_det.get("label", "")
                best_cat = best_det.get("category", "")

    # 1. First attempt: scan the target crop (detected vehicle/phone/plate)
    res = ocr_reader.read(target_crop, label=best_label, category=best_cat)

    # 2. Second attempt: center 75% viewport (where users hold up cards, phones, documents)
    if not res.get("detected"):
        center_crop = clean_frame[int(h * 0.12):int(h * 0.88), int(w * 0.12):int(w * 0.88)]
        if center_crop.size > 0:
            res_center = ocr_reader.read(center_crop)
            if res_center.get("detected"):
                res = res_center

    # 3. Third attempt: full clean frame
    if not res.get("detected") and target_crop is not clean_frame:
        res = ocr_reader.read(clean_frame)

    if res.get("detected"):
        with _state_lock:
            _latest["ocr"] = res
            for det in _latest.get("detections", []):
                det["ocr_text"] = res.get("best_text", "")
                det["is_plate"] = res.get("is_plate", False)
                det["plate_number"] = res.get("plate_number", "")

        # Immediately log confirmed plate under "NO. PLATES" category
        if res.get("is_plate") and res.get("plate_number"):
            p_num = res["plate_number"]
            detect_log.add_custom_entry(
                label=p_num,
                category="NO. PLATES",
                confidence=res.get("confidence", 0.95),
                intruding=False,
                emoji="🚘"
            )
            _last_logged_plate = p_num
            _last_logged_plate_time = time.time()
    return {"ok": True, "result": res}


@app.get("/api/ocr/latest")
def get_latest_ocr():
    return {"ok": True, "ocr": ocr_reader.get_latest()}


# ---------------------------------------------------------------------------
# Notification Configuration & Test Dispatch Endpoints
# ---------------------------------------------------------------------------

class NotificationConfigModel(BaseModel):
    enabled: bool = False
    recipient_email: str = ""
    sender_email: str = ""
    app_password: str = ""
    smtp_server: str = "smtp.gmail.com"
    smtp_port: int = 587
    cooldown_sec: int = 45


@app.get("/api/notifications/config")
def get_notification_config():
    return {"ok": True, "config": email_notifier.get_status()}


@app.post("/api/notifications/config")
def update_notification_config(body: NotificationConfigModel):
    success = email_notifier.save_config(body.dict())
    with _state_lock:
        _latest["email_status"] = email_notifier.get_status()
    return {"ok": success, "config": email_notifier.get_status()}


class TestEmailModel(BaseModel):
    recipient_email: str = ""


@app.post("/api/notifications/test")
def trigger_test_email(body: TestEmailModel):
    frame = stream.get_frame()
    recipient = body.recipient_email or email_notifier.config.get("recipient_email")
    if not recipient:
        return JSONResponse({"ok": False, "error": "No recipient email provided"}, status_code=400)

    test_alert = {
        "title": "CCTV LIVE OPTICAL SNAPSHOT / TEST BEACON",
        "message": "Live camera snapshot captured from CCTV dashboard",
        "category": "SYSTEM",
        "label": "LIVE_FEED",
        "time": time.strftime("%H:%M:%S"),
        "confidence": 1.0,
    }
    with _state_lock:
        dets = _latest.get("detections", [])
        if dets:
            test_alert["bbox"] = dets[0].get("bbox")
            test_alert["label"] = dets[0].get("label")
            test_alert["category"] = dets[0].get("category")

    ok, msg = email_notifier.send_test_email(
        recipient,
        test_frame=frame,
        boundary_points=boundary.get_points(),
        custom_alert=test_alert
    )
    with _state_lock:
        _latest["email_status"] = email_notifier.get_status()
    if not ok:
        return JSONResponse({"ok": False, "error": msg}, status_code=500)
    return {"ok": True, "message": msg}


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    async with _ws_lock:
        _ws_clients.add(ws)
    try:
        while True:
            text = await ws.receive_text()
            try:
                msg = json.loads(text)
                cmd = msg.get("action")
                if cmd in ("clear_all", "clear_logs"):
                    alert_mgr.clear()
                    detect_log.clear()
                    with _state_lock:
                        _latest["active_intrusion"] = False
                    await ws.send_json({
                        "alerts": [],
                        "detection_log": [],
                        "active_intrusion": False,
                        "dwell_times": {},
                    })
                elif cmd == "clear_alerts":
                    alert_mgr.clear()
                    await ws.send_json({"alerts": []})
                elif cmd == "clear_detection_log":
                    detect_log.clear()
                    await ws.send_json({"detection_log": []})
            except Exception:
                pass
    except WebSocketDisconnect:
        pass
    finally:
        async with _ws_lock:
            _ws_clients.discard(ws)


# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Local video file serving (CAM-02 in Live Cameras grid)
# ---------------------------------------------------------------------------

import os as _os
from fastapi.responses import FileResponse as _FileResponse

_CAM1_VIDEO_PATH = r"C:\Users\tejj1\Videos\Screen Recordings\Screen Recording 2026-09-25 190338.mp4"
_CAM2_VIDEO_PATH = r"C:\Users\tejj1\Videos\Screen Recordings\Screen Recording 2026-09-26 151949.mp4"

@app.get("/api/cam2-video")
async def serve_cam2_video():
    """Serve the local screen-recording as an MP4 with range-request support for the browser <video> element."""
    if not _os.path.exists(_CAM2_VIDEO_PATH):
        return JSONResponse({"ok": False, "error": "Video file not found on server"}, status_code=404)
    return _FileResponse(
        _CAM2_VIDEO_PATH,
        media_type="video/mp4",
        filename="cam2.mp4",
        headers={"Accept-Ranges": "bytes"},
    )


# ---------------------------------------------------------------------------
# CAM-01 Lightweight YOLO Stream
# ---------------------------------------------------------------------------
import cv2 as _cv2

def _cam1_yolo_gen():
    cap = _cv2.VideoCapture(_CAM1_VIDEO_PATH)
    frame_skip = 4
    ctr = 0
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                cap.set(_cv2.CAP_PROP_POS_FRAMES, 0)
                continue
            
            ctr += 1
            if ctr % frame_skip != 0:
                continue
                
            # Downscale for performance
            h, w = frame.shape[:2]
            small = _cv2.resize(frame, (int(w*0.5), int(h*0.5)))
        
            with _yolo_lock:
                dets = detector.detect(small)
                
            cam1_sum = {"HUMAN": 0, "ANIMAL": 0, "VEHICLE": 0, "OBJECT": 0}
            for d in dets:
                cat = d.get("category", "OBJECT")
                if cat in cam1_sum: cam1_sum[cat] += 1
            with _state_lock:
                _latest["cam1_summary"] = cam1_sum

            # Draw basic boxes
            for d in dets:
                x1, y1, x2, y2 = d["bbox"]
                # Scale up to original
                x1, y1, x2, y2 = int(x1*2), int(y1*2), int(x2*2), int(y2*2)
                _cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                _cv2.putText(frame, d["label"], (x1, max(20, y1-10)), _cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                
            _, buf = _cv2.imencode('.jpg', frame, [_cv2.IMWRITE_JPEG_QUALITY, 70])
            yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + buf.tobytes() + b'\r\n')
    finally:
        cap.release()

@app.get("/api/cam1-yolo-stream")
async def cam1_yolo_stream():
    from fastapi.responses import StreamingResponse as _StreamingResponse
    return _StreamingResponse(_cam1_yolo_gen(), media_type="multipart/x-mixed-replace; boundary=frame")


