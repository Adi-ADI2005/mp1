"""Application-facing analysis service built on the ML inference package."""

from ml.inference import inference


class AnalysisService:
    @property
    def status(self):
        return inference.status

    def analyze_image(self, image):
        return inference.analyze_image(image)

    def analyze_frames(self, frames):
        results = [self.analyze_image(frame) for frame in frames]
        return {
            **results[0],
            "frames_analyzed": len(results),
            "frame_results": results,
        }


analysis_service = AnalysisService()