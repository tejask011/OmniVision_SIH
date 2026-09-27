"""
blockchain.py
-------------
Self-contained, lightweight Cryptographic Blockchain Ledger for CCTV Intrusion Logs.

Features:
  - Immutable chain of blocks storing intrusion evidence.
  - Cryptographic linking (SHA-256 hashes linking block N to block N-1).
  - Evidence hash validation (SHA-256 payload checksum).
  - Automated chain verification engine (detects log tampering/modifications).
  - JSON persistence to local disk (blockchain_ledger.json).
"""

from __future__ import annotations

import base64
import os
import json
import time
import hashlib
import threading
from datetime import datetime
from dataclasses import dataclass, asdict


LEDGER_FILE = os.path.join(os.path.dirname(__file__), "blockchain_ledger.json")


@dataclass
class Block:
    index: int
    timestamp: str
    camera_id: str
    event_type: str          # e.g., "INTRUSION_ALERT"
    label: str               # e.g., "person", "car"
    category: str            # e.g., "HUMAN", "VEHICLE"
    confidence: float
    dwell_sec: float
    boundary_points: list
    evidence_hash: str       # SHA-256 of payload / screenshot
    previous_hash: str
    hash: str
    nonce: int = 0
    snapshot_base64: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


def calculate_block_hash(
    index: int,
    timestamp: str,
    camera_id: str,
    event_type: str,
    label: str,
    category: str,
    confidence: float,
    dwell_sec: float,
    boundary_points: list,
    evidence_hash: str,
    previous_hash: str,
    nonce: int
) -> str:
    """Calculates SHA-256 checksum over block headers and payload."""
    payload_str = json.dumps({
        "index": index,
        "timestamp": timestamp,
        "camera_id": camera_id,
        "event_type": event_type,
        "label": label,
        "category": category,
        "confidence": round(confidence, 4),
        "dwell_sec": round(dwell_sec, 2),
        "boundary_points": boundary_points,
        "evidence_hash": evidence_hash,
        "previous_hash": previous_hash,
        "nonce": nonce
    }, sort_keys=True)
    
    return hashlib.sha256(payload_str.encode("utf-8")).hexdigest()


class Blockchain:
    def __init__(self, ledger_filepath: str = LEDGER_FILE):
        self._filepath = ledger_filepath
        self._lock = threading.Lock()
        self._chain: list[Block] = []

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
                        self._chain = [Block(**item) for item in raw_data]
                    # Validate existing chain
                    is_valid, _ = self._validate_chain_unlocked()
                    if is_valid and len(self._chain) > 0:
                        return
                except Exception as e:
                    print(f"[Blockchain] Warning: Failed to load existing ledger ({e}). Initializing new Genesis block.")

            # Create Genesis Block
            self._chain = [self._create_genesis_block()]
            self._save_unlocked()

    def _create_genesis_block(self) -> Block:
        timestamp = datetime.now().isoformat()
        index = 0
        camera_id = "SYSTEM_GENESIS"
        event_type = "GENESIS_BLOCK"
        label = "SYSTEM"
        category = "SYSTEM"
        confidence = 1.0
        dwell_sec = 0.0
        boundary_points = []
        evidence_hash = hashlib.sha256(b"SIHCCTV_GENESIS_SEED").hexdigest()
        previous_hash = "0" * 64
        nonce = 0

        block_hash = calculate_block_hash(
            index, timestamp, camera_id, event_type, label, category,
            confidence, dwell_sec, boundary_points, evidence_hash, previous_hash, nonce
        )

        return Block(
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
            previous_hash=previous_hash,
            hash=block_hash,
            nonce=nonce
        )

    def _save_unlocked(self):
        try:
            with open(self._filepath, "w", encoding="utf-8") as f:
                json.dump([b.to_dict() for b in self._chain], f, indent=2)
        except Exception as e:
            print(f"[Blockchain] Error saving ledger to disk: {e}")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def add_intrusion_block(
        self,
        alert_data: dict,
        camera_id: str = "CAM-01",
        snapshot_bytes: bytes | None = None
    ) -> Block:
        """Mines and appends a new cryptographic block for an intrusion alert."""
        with self._lock:
            last_block = self._chain[-1]
            new_index = last_block.index + 1
            timestamp = datetime.now().isoformat()

            # Generate evidence hash & base64 snapshot image payload
            snapshot_b64 = ""
            if snapshot_bytes:
                evidence_hash = hashlib.sha256(snapshot_bytes).hexdigest()
                snapshot_b64 = "data:image/jpeg;base64," + base64.b64encode(snapshot_bytes).decode("utf-8")
            else:
                raw_payload = f"{timestamp}:{alert_data.get('label')}:{alert_data.get('time')}".encode("utf-8")
                evidence_hash = hashlib.sha256(raw_payload).hexdigest()

            label = alert_data.get("label", "unknown")
            category = alert_data.get("category", "HUMAN")
            confidence = alert_data.get("confidence", 1.0)
            dwell_sec = alert_data.get("dwell_sec", 5.0)
            boundary_points = alert_data.get("boundary", [])
            previous_hash = last_block.hash

            nonce = 0
            # Simple proof-of-work (nonce search for hash starting with "0")
            while True:
                block_hash = calculate_block_hash(
                    new_index, timestamp, camera_id, "INTRUSION_ALERT",
                    label, category, confidence, dwell_sec, boundary_points,
                    evidence_hash, previous_hash, nonce
                )
                if block_hash.startswith("0"):  # lightweight proof-of-work difficulty
                    break
                nonce += 1

            new_block = Block(
                index=new_index,
                timestamp=timestamp,
                camera_id=camera_id,
                event_type="INTRUSION_ALERT",
                label=label,
                category=category,
                confidence=confidence,
                dwell_sec=dwell_sec,
                boundary_points=boundary_points,
                evidence_hash=evidence_hash,
                previous_hash=previous_hash,
                hash=block_hash,
                nonce=nonce,
                snapshot_base64=snapshot_b64
            )

            self._chain.append(new_block)
            self._save_unlocked()
            return new_block

    def get_chain(self) -> list[dict]:
        with self._lock:
            return [b.to_dict() for b in self._chain]

    def validate_chain(self) -> tuple[bool, str]:
        """Validates chain integrity (checks hash matches and links)."""
        with self._lock:
            return self._validate_chain_unlocked()

    def _validate_chain_unlocked(self) -> tuple[bool, str]:
        if not self._chain:
            return False, "Chain is empty"

        # Check Genesis
        genesis = self._chain[0]
        if genesis.index != 0 or genesis.previous_hash != "0" * 64:
            return False, "Genesis block corrupted"

        for i in range(1, len(self._chain)):
            prev = self._chain[i - 1]
            curr = self._chain[i]

            # 1. Index link
            if curr.index != prev.index + 1:
                return False, f"Block #{curr.index} has invalid index link"

            # 2. Previous hash link
            if curr.previous_hash != prev.hash:
                return False, f"Block #{curr.index} previous_hash mismatch"

            # 3. Block hash validation
            expected_hash = calculate_block_hash(
                curr.index, curr.timestamp, curr.camera_id, curr.event_type,
                curr.label, curr.category, curr.confidence, curr.dwell_sec,
                curr.boundary_points, curr.evidence_hash, curr.previous_hash, curr.nonce
            )
            if curr.hash != expected_hash:
                return False, f"Block #{curr.index} hash integrity check failed (tampered data detected)"

        return True, "Blockchain integrity verified. All blocks valid and immutable."

    def corrupt_chain(self) -> tuple[bool, str]:
        """Simulates a malicious tampering attack on the ledger for demo audit testing."""
        with self._lock:
            if len(self._chain) <= 1:
                return False, "Add at least 1 intrusion block before testing tamper detection."

            # Intentionally alter block payload & hash of the last block
            target_block = self._chain[-1]
            target_block.label = "TAMPERED_OBJECT_HACKED"
            target_block.confidence = 0.0001
            target_block.hash = "deadbeef" + target_block.hash[8:]
            self._save_unlocked()
            return True, f"Malicious payload injected into Block #{target_block.index}. Chain integrity broken!"

    def repair_chain(self) -> tuple[bool, str]:
        """Re-computes valid proof of work and SHA-256 hashes across all blocks to repair chain."""
        with self._lock:
            if not self._chain:
                return False, "Chain empty."

            for i in range(1, len(self._chain)):
                prev = self._chain[i - 1]
                curr = self._chain[i]

                # Fix label if corrupted
                if curr.label == "TAMPERED_OBJECT_HACKED":
                    curr.label = "person"
                    curr.confidence = 0.95

                curr.previous_hash = prev.hash
                nonce = 0
                while True:
                    h = calculate_block_hash(
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
            return True, "Cryptographic proof-of-work re-calculated. Chain repaired and verified."

    def reset_chain(self) -> tuple[bool, str]:
        """Resets the ledger back to Genesis Block #0."""
        with self._lock:
            self._chain = [self._create_genesis_block()]
            self._save_unlocked()
            return True, "Blockchain ledger reset to Genesis Block #0."

