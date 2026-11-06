"""Configuration that belongs to the inference pipeline."""

FISH_DETECTION_CONFIDENCE = 0.40
SPECIES_CONFIDENCE = 0.50
DISEASE_CONFIDENCE = 0.50
IOU_THRESHOLD = 0.45
IMAGE_SIZE = 640
VIDEO_FRAME_INTERVAL = 8
MAX_DETECTIONS = 100
TRACKING_MAX_AGE = 30
SUPPORTED_SPECIES = ["Rohu", "Catla", "Mrigal", "Tilapia", "Common Carp", "Grass Carp", "Silver Carp", "Other"]
SUPPORTED_DISEASES = ["Healthy", "Ich", "Fin Rot", "Fungal Infection", "Bacterial Infection", "Ulcer", "Parasite Infection", "Unknown"]
MEASUREMENT_REFERENCE_LENGTH_CM = 0
MODEL_DIRECTORY = "models"
PROVIDER_NOTE = "Demo measurements are illustrative only; calibrate each camera before using measurements operationally."