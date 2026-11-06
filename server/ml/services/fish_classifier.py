"""Classifier contract for future trained species models."""

from ..config import SUPPORTED_SPECIES


class FishClassifier:
    def classify(self, crop) -> dict:
        """Return Unknown until a trained classifier is explicitly configured."""
        return {"species": "Unknown", "confidence": 0.0, "supported_species": SUPPORTED_SPECIES}