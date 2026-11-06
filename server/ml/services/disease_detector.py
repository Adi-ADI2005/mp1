"""Disease screening contract; unknown is safer than an ungrounded diagnosis."""

from ..config import SUPPORTED_DISEASES


class DiseaseDetector:
    def classify(self, crop) -> dict:
        return {
            "disease": "Unknown",
            "confidence": 0.0,
            "severity": "UNKNOWN",
            "supported_diseases": SUPPORTED_DISEASES,
            "note": "AI results are preliminary and should be reviewed by a qualified aquaculture or marine expert.",
        }