"""
event_hasher.py
---------------
OmniVision Cryptographic Hasher for Security Events & Evidence Photos.

Computes immutable SHA-256 checksums over event attributes, timestamps,
previous hashes, and raw JPEG evidence bytes.
"""

import json
import hashlib


def calculate_evidence_hash(image_bytes: bytes | None) -> str:
    """Calculates SHA-256 checksum over raw image evidence file bytes."""
    if not image_bytes:
        return "0" * 64
    return hashlib.sha256(image_bytes).hexdigest()


def calculate_event_hash(
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
    """
    Computes SHA-256 proof hash over security event attributes.
    Matches OmniVision Smart Contract EventRecord structure.
    """
    payload_dict = {
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
    }
    
    payload_json = json.dumps(payload_dict, sort_keys=True)
    return hashlib.sha256(payload_json.encode("utf-8")).hexdigest()
