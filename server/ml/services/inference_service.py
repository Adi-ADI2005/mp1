"""API-facing service for trained fish-detection models only."""

from __future__ import annotations

from pathlib import Path

from ...config import settings
from ..config import (
    MAX_DETECTIONS,
)
from .fish_tracker import FishTracker
from .measurement import estimate_length, estimate_weight


class RealModelInferenceService:
    """YOLO-compatible adapter, loaded only when a trained detection model is configured."""

    provider_mode = "REAL_MODEL"

    def __init__(self, model_path: Path) -> None:
        if not model_path.is_file():
            raise RuntimeError(f"Configured detection model is missing: {model_path}")
        try:
            from ultralytics import YOLO
        except ImportError as exc:
            raise RuntimeError("Install the optional ultralytics package to use the real detection model.") from exc
        self.model = YOLO(str(model_path))

    def analyze(self, image_path: Path, image_size: tuple[int, int], reference_length_cm: float = 0) -> dict:
        result = self.model.predict(source=str(image_path), conf=0.4, verbose=False)[0]
        boxes = []
        if result.boxes is not None:
            for box in result.boxes[:MAX_DETECTIONS]:
                coordinates = [round(float(value), 1) for value in box.xyxy[0].tolist()]
                confidence = round(float(box.conf[0]), 4)
                length_cm, length_confidence = estimate_length(coordinates, reference_length_cm)
                boxes.append({
                    "bbox": coordinates,
                    "confidence": confidence,
                    "species": "Unknown",
                    "species_confidence": 0.0,
                    "disease": "Unknown",
                    "disease_confidence": 0.0,
                    "disease_severity": "UNKNOWN",
                    "length_cm": length_cm,
                    "length_confidence": length_confidence,
                    "weight_g": None,
                    "weight_confidence": 0.0,
                })
        tracked = FishTracker().assign_ids(boxes)
        return {
            "provider_mode": self.provider_mode,
            "detections": tracked,
            "fish_count": len(tracked),
            "disclaimer": "Detection uses the configured trained model. Species, disease, and measurements require compatible trained models and camera calibration.",
        }


def get_inference_service():
    if settings.model_provider == "real":
        return RealModelInferenceService(settings.detection_model)
    raise RuntimeError(
        "Fish detection is unavailable: configure a trained detector and set MODEL_PROVIDER=real."
    )