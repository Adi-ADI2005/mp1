"""Public import location for the configured detector."""

from .inference_service import RealModelInferenceService, get_inference_service

__all__ = ["RealModelInferenceService", "get_inference_service"]