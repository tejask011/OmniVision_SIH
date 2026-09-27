"""
event_ledger.py
---------------
OmniVision Event Ledger & State Machine.

Manages confirmed security events, state transitions:
  DETECTED → TRACKING → VERIFIED → ANCHORED

Saves off-chain JPEG evidence photos to /backend/evidence/ and anchors
cryptographic SHA-256 proofs to an immutable event chain.
"""

from __future__ import annotations

import os
import json
import time
import threading
from enum import Enum
from datetime import datetime
from dataclasses import dataclass, asdict

from .event_hasher import calculate_evidence_hash, calculate_event_hash


BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
EVIDENCE_DIR = os.path.join(BACKEND_DIR, "evidence")
LEDGER_FILE = os.path.join(BACKEND_DIR, "blockchain_ledger.json")

os.makedirs(EVIDENCE_DIR, exist_ok=True)


class EventState(str, Enum):
    DETECTED = "DETECTED"
    TRACKING = "TRACKING"
    VERIFIED = "VERIFIED"
    ANCHORED = "ANCHORED"


@dataclass
class SecurityEvent:
    index: int
    timestamp: str
    camera_id: str
    event_type: str            # "HUMAN_INTRUSION" | "VEHICLE_ANPR" | "CAMERA_TAMPER" | "SYSTEM_GENESIS"
    label: str                 # e.g., "person", "car", "camera blocked"
    category: str              # e.g., "HUMAN", "VEHICLE", "TAMPER"
    confidence: float
    dwell_sec: float
    boundary_points: list
    evidence_hash: str         # SHA-256 hash of JPEG photo
    evidence_filename: str     # Filename inside /evidence/ folder
    previous_hash: str
    hash: str
    state: str = EventState.ANCHORED.value
    nonce: int = 0

    def to_dict(self) -> dict:
        return asdict(self)


class EventLedger:
    def __init__(self, ledger_filepath: str = LEDGER_FILE, evidence_dir: str = EVIDENCE_DIR):
        self._filepath = ledger_filepath
        self._evidence_dir = evidence_dir
        self._lock = threading.Lock()
        self._chain: list[SecurityEvent] = []

        os.makedirs(self._evidence_dir, exist_ok=True)
        self._load_or_initialize()

    # ------------------------------------------------------------------
    # Initialization & Persistence
    # ------------------------------------------------------------------

    def _load_or_initialize(self):
        with self._lock:
            if os.path.exists(self._filepath):
                try:
                    with open(self._filepath, "r", encoding="utf-8") as f:
                        raw_data = json.load(f)
                        self._chain = [SecurityEvent(**item) for item in raw_data]
                    is_valid, _ = self._validate_chain_unlocked()
                    if is_valid and len(self._chain) > 0:
                        return
                except Exception as e:
                    print(f"[OmniVision Ledger] Warning: Failed to load existing ledger ({e}). Initializing Genesis Block.")

            # Create Genesis Block #0
            self._chain = [self._create_genesis_event()]
            self._save_unlocked()

    def _create_genesis_event(self) -> SecurityEvent:
        timestamp = datetime.now().isoformat()
        index = 0
        camera_id = "OMNIVISION_HQ"
        event_type = "SYSTEM_GENESIS"
        label = "OMNIVISION_SYSTEM"
        category = "SYSTEM"
        confidence = 1.0
        dwell_sec = 0.0
        boundary_points = []
        evidence_hash = calculate_evidence_hash(b"OMNIVISION_GENESIS_SEED")
        evidence_filename = ""
        previous_hash = "0" * 64
        nonce = 0

        event_hash = calculate_event_hash(
            index, timestamp, camera_id, event_type, label, category,
            confidence, dwell_sec, boundary_points, evidence_hash, previous_hash, nonce
        )

        return SecurityEvent(
            index=index,
            timestamp=timestamp,
            camera_id=camera_id,
            event_type=event_type,
            label=label,
            category=category,
            confidence=confidence,
            dwell_sec=dwell_sec,
            boundary_points=boundary_points,
            evidence_hash=evidence_hash,
            evidence_filename=evidence_filename,
            previous_hash=previous_hash,
            hash=event_hash,
            state=EventState.ANCHORED.value,
            nonce=nonce
        )

    def _save_unlocked(self):
        try:
            with open(self._filepath, "w", encoding="utf-8") as f:
                json.dump([e.to_dict() for e in self._chain], f, indent=2)
        except Exception as e:
            print(f"[OmniVision Ledger] Error saving ledger to disk: {e}")

    # ------------------------------------------------------------------
    # Public API: Event Anchoring
    # ------------------------------------------------------------------

    def record_security_event(
        self,
        event_type: str,            # "HUMAN_INTRUSION" | "VEHICLE_ANPR" | "CAMERA_TAMPER"
        alert_data: dict,
        camera_id: str = "CAM-01",
        snapshot_bytes: bytes | None = None
    ) -> SecurityEvent:
        """
        Transitions event state (VERIFIED → ANCHORED), saves off-chain evidence JPEG,
        calculates SHA-256 evidence hash, and mines proof-of-work block onto event chain.
        """
        with self._lock:
            last_event = self._chain[-1]
            new_index = last_event.index + 1
            timestamp = datetime.now().isoformat()

            evidence_filename = ""
            if snapshot_bytes:
                evidence_hash = calculate_evidence_hash(snapshot_bytes)
                evidence_filename = f"ev_{new_index}_{evidence_hash[:12]}.jpg"
                filepath = os.path.join(self._evidence_dir, evidence_filename)
                try:
                    with open(filepath, "wb") as f:
                        f.write(snapshot_bytes)
                except Exception as e:
                    print(f"[OmniVision Ledger] Error saving evidence photo: {e}")
            else:
                raw_payload = f"{timestamp}:{alert_data.get('label')}:{alert_data.get('time')}".encode("utf-8")
                evidence_hash = calculate_evidence_hash(raw_payload)

            label = alert_data.get("label", "unknown")
            category = alert_data.get("category", "HUMAN")
            confidence = float(alert_data.get("confidence", 1.0))
            dwell_sec = float(alert_data.get("dwell_sec", 5.0))
            boundary_points = alert_data.get("boundary", [])
            previous_hash = last_event.hash

            nonce = 0
            # Simple proof-of-work (nonce search for hash starting with "0")
            while True:
                event_hash = calculate_event_hash(
                    new_index, timestamp, camera_id, event_type,
                    label, category, confidence, dwell_sec, boundary_points,
                    evidence_hash, previous_hash, nonce
                )
                if event_hash.startswith("0"):
                    break
                nonce += 1

            new_event = SecurityEvent(
                index=new_index,
                timestamp=timestamp,
                camera_id=camera_id,
                event_type=event_type,
                label=label,
                category=category,
                confidence=confidence,
                dwell_sec=dwell_sec,
                boundary_points=boundary_points,
                evidence_hash=evidence_hash,
                evidence_filename=evidence_filename,
                previous_hash=previous_hash,
                hash=event_hash,
                state=EventState.ANCHORED.value,
                nonce=nonce
            )

            self._chain.append(new_event)
            self._save_unlocked()
            return new_event

    def reload_from_disk(self):
        if os.path.exists(self._filepath):
            try:
                with open(self._filepath, "r", encoding="utf-8") as f:
                    raw_data = json.load(f)
                    self._chain = [SecurityEvent(**item) for item in raw_data]
            except Exception as e:
                print(f"[OmniVision Ledger] Error reloading ledger from disk: {e}")

    def get_chain(self) -> list[dict]:
        with self._lock:
            self.reload_from_disk()
            return [e.to_dict() for e in self._chain]

    # ------------------------------------------------------------------
    # Verification & Tamper Detection Engine
    # ------------------------------------------------------------------

    def validate_chain(self) -> tuple[bool, str]:
        """Recalculates cryptographic proofs and compares off-chain files."""
        with self._lock:
            return self._validate_chain_unlocked()

    def _validate_chain_unlocked(self) -> tuple[bool, str]:
        if not self._chain:
            return False, "Ledger is empty"

        genesis = self._chain[0]
        if genesis.index != 0 or genesis.previous_hash != "0" * 64:
            return False, "Genesis block corrupted"

        for i in range(1, len(self._chain)):
            prev = self._chain[i - 1]
            curr = self._chain[i]

            # 1. Check index continuity
            if curr.index != prev.index + 1:
                return False, f"Event #{curr.index}: Index continuity link broken."

            # 2. Check previous hash reference link
            if curr.previous_hash != prev.hash:
                return False, f"Event #{curr.index}: Previous hash link mismatch. Previous event altered!"

            # 3. Recalculate event proof hash
            expected_hash = calculate_event_hash(
                curr.index, curr.timestamp, curr.camera_id, curr.event_type,
                curr.label, curr.category, curr.confidence, curr.dwell_sec,
                curr.boundary_points, curr.evidence_hash, curr.previous_hash, curr.nonce
            )
            if curr.hash != expected_hash:
                return False, f"Event #{curr.index} ({curr.event_type}): Payload data altered! Expected hash mismatch."

            # 4. Verify off-chain evidence photo integrity if file exists
            if curr.evidence_filename:
                imgPath = os.path.join(self._evidence_dir, curr.evidence_filename)
                if os.path.exists(imgPath):
                    with open(imgPath, "rb") as f:
                        actual_img_hash = calculate_evidence_hash(f.read())
                    if actual_img_hash != curr.evidence_hash:
                        return False, f"Event #{curr.index}: Off-chain evidence photo tampered/modified on disk!"

        return True, "Blockchain integrity verified. All security events & off-chain evidence proofs match!"

    # ------------------------------------------------------------------
    # Hackathon Demo Manipulation Utilities
    # ------------------------------------------------------------------

    def corrupt_chain(self) -> tuple[bool, str]:
        """Simulates a malicious tampering attack for hackathon audit demonstration."""
        with self._lock:
            if len(self._chain) <= 1:
                return False, "Add at least 1 confirmed security event before testing tamper detection."

            target = self._chain[-1]
            target.label = "TAMPERED_HACKED_DATA"
            target.confidence = 0.0001
            target.hash = "deadbeef" + target.hash[8:]
            self._save_unlocked()
            return True, f"Tampering injected into Event #{target.index} ({target.event_type}). Hash proof broken!"

    def repair_chain(self) -> tuple[bool, str]:
        """Re-anchors events and re-computes cryptographic proofs."""
        with self._lock:
            if not self._chain:
                return False, "Chain empty"

            for i in range(1, len(self._chain)):
                prev = self._chain[i - 1]
                curr = self._chain[i]

                if curr.label == "TAMPERED_HACKED_DATA":
                    curr.label = "person"
                    curr.confidence = 0.95

                curr.previous_hash = prev.hash
                nonce = 0
                while True:
                    h = calculate_event_hash(
                        curr.index, curr.timestamp, curr.camera_id, curr.event_type,
                        curr.label, curr.category, curr.confidence, curr.dwell_sec,
                        curr.boundary_points, curr.evidence_hash, curr.previous_hash, nonce
                    )
                    if h.startswith("0"):
                        break
                    nonce += 1
                curr.hash = h
                curr.nonce = nonce

            self._save_unlocked()
            return True, "Re-calculated cryptographic proofs. Ledger restored and verified."

    def reset_chain(self) -> tuple[bool, str]:
        """Resets ledger back to Genesis Block #0."""
        with self._lock:
            self._chain = [self._create_genesis_event()]
            self._save_unlocked()
            return True, "OmniVision Event Ledger reset to Genesis Block #0."
