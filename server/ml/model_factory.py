"""Model definitions matching the saved EfficientNet-B0 checkpoints."""

from torch import nn
from torchvision import models


def build_species_model(num_classes: int):
    model = models.efficientnet_b0(weights=None)
    model.classifier[1] = nn.Linear(model.classifier[1].in_features, num_classes)
    return model


def build_disease_model(num_classes: int):
    model = models.efficientnet_b0(weights=None)
    model.classifier[1] = nn.Linear(model.classifier[1].in_features, num_classes)
    return model
