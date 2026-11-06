"""Replaceable inference layer for the bundled species and disease classifiers."""

import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]


class FishInferenceService:
    """Loads bundled image classifiers when the runtime and checkpoints are usable.

    Fish detection and physical measurement require separate trained models and
    camera calibration. Those values are deliberately returned as unavailable.
    """

    def __init__(self):
        self.device = "CPU"
        self.species_model = None
        self.disease_model = None
        self.torch = None
        self.preprocess = None
        self.labels = {"species": [], "disease": []}
        self.errors = {}
        try:
            import torch
            from torchvision import transforms
            from .model_factory import build_disease_model, build_species_model

            dataset_dir = BASE_DIR / "server" / "dataset"
            with (dataset_dir / "labels.json").open(encoding="utf-8-sig") as handle:
                self.labels = json.load(handle)
            self.torch = torch
            self.preprocess = transforms.Compose([
                transforms.Resize((128, 128)),
                transforms.ToTensor(),
                transforms.Normalize(
                    mean=[0.485, 0.456, 0.406],
                    std=[0.229, 0.224, 0.225],
                ),
            ])
            self.device = "GPU" if torch.cuda.is_available() else "CPU"
            self.species_model = self._load(
                build_species_model, self.labels["species"],
                dataset_dir / "species/best_fish_efficientnet_b0.pth",
            )
            self.disease_model = self._load(
                build_disease_model, self.labels["disease"],
                dataset_dir / "disease/best_fish_disease_efficientnet_b0.pth",
            )
        except Exception as exc:
            self.errors["runtime"] = f"{type(exc).__name__}: {exc}"

    def _load(self, builder, labels, path):
        try:
            if not path.is_file():
                raise FileNotFoundError(f"Checkpoint not found: {path.name}")
            model = builder(len(labels))
            checkpoint = self.torch.load(path, map_location="cpu", weights_only=True)
            model.load_state_dict(checkpoint)
            return model.to("cpu").eval()
        except Exception as exc:
            self.errors[path.parent.name] = f"{type(exc).__name__}: {exc}"
            return None

    @property
    def status(self):
        return {
            "species_classifier": self.species_model is not None,
            "disease_classifier": self.disease_model is not None,
            "fish_detector": False,
            "length_calibration": False,
            "weight_estimator": False,
            "device": self.device,
            "errors": self.errors,
        }

    def _classify(self, model, labels, image):
        if model is None or self.torch is None:
            return {
                "available": False,
                "label": None,
                "confidence": None,
                "top_predictions": [],
            }
        tensor = self.preprocess(image).unsqueeze(0)
        with self.torch.inference_mode():
            probabilities = self.torch.nn.functional.softmax(model(tensor), dim=1)[0]
        count = min(3, len(labels))
        scores, indices = self.torch.topk(probabilities, count)
        predictions = [
            {
                "label": labels[index.item()],
                "confidence": round(score.item(), 4),
            }
            for score, index in zip(scores, indices)
        ]
        top = predictions[0]
        return {
            "available": True,
            "label": top["label"],
            "confidence": top["confidence"],
            "top_predictions": predictions,
        }

    def analyze_image(self, image):
        species = self._classify(self.species_model, self.labels["species"], image)
        health = self._classify(self.disease_model, self.labels["disease"], image)
        is_healthy = (
            health["label"] == "Healthy_Fish" if health["available"] else None
        )
        return {
            "species": species,
            "health": {**health, "is_healthy": is_healthy},
            "fish_count": None,
            "detections": [],
            "estimated_length_cm": None,
            "estimated_height_cm": None,
            "estimated_weight_g": None,
            "device": self.device,
            "limitations": [
                "Fish counting is unavailable until a trained object-detection model is configured.",
                "Length and weight require camera calibration and a validated measurement model.",
                "Disease predictions are preliminary and must be reviewed by an aquaculture expert.",
            ],
        }


inference = FishInferenceService()