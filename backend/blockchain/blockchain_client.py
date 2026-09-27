"""
blockchain_client.py
--------------------
Unified client interface connecting FastAPI backend and Event Engine
to the OmniVision Event Ledger.
"""

from .event_ledger import EventLedger, EventState


class BlockchainClient:
    def __init__(self):
        self.ledger = EventLedger()

    def record_event(self, event_type: str, alert_data: dict, camera_id: str = "CAM-01", snapshot_bytes: bytes | None = None):
        return self.ledger.record_security_event(event_type, alert_data, camera_id, snapshot_bytes)

    def get_chain(self):
        return self.ledger.get_chain()

    def validate(self):
        return self.ledger.validate_chain()

    def corrupt(self):
        return self.ledger.corrupt_chain()

    def repair(self):
        return self.ledger.repair_chain()

    def reset(self):
        return self.ledger.reset_chain()
