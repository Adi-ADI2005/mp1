"""Transparent camera-calibration and length/weight measurement helpers."""

SPECIES_FACTORS = {
    "Rohu": 0.012, "Catla": 0.011, "Mrigal": 0.013, "Tilapia": 0.014,
    "Common Carp": 0.012, "Grass Carp": 0.010, "Silver Carp": 0.011,
}


def estimate_length(bbox: list[float], reference_length_cm: float = 0) -> tuple[float | None, float]:
    width_px = max(0, bbox[2] - bbox[0])
    if reference_length_cm <= 0:
        return None, 0.0
    return round(width_px * reference_length_cm, 1), 0.55


def estimate_weight(species: str, length_cm: float | None) -> tuple[float | None, float]:
    if not length_cm or species not in SPECIES_FACTORS:
        return None, 0.0
    # Length-weight relationship; coefficients are demo defaults pending farm calibration.
    return round(SPECIES_FACTORS[species] * length_cm ** 3, 1), 0.45