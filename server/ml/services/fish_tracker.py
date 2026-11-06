"""Replaceable tracking boundary; real trackers can implement the same interface."""

class FishTracker:
    def __init__(self) -> None:
        self._next_id = 1

    def assign_ids(self, detections: list[dict]) -> list[dict]:
        for detection in detections:
            detection.setdefault("fish_id", f"F-{self._next_id:04d}")
            self._next_id += 1
        return detections

    def reset(self) -> None:
        self._next_id = 1