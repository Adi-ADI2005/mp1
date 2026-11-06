"""Validated pool configuration models shared by create and update endpoints."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


DEFAULT_FACILITY_ID = "bluewater-farms"


class DimensionInput(BaseModel):
    length: float | None = Field(default=None, gt=0, le=100_000)
    width: float | None = Field(default=None, gt=0, le=100_000)
    depth: float | None = Field(default=None, gt=0, le=100_000)
    unit: Literal["meters", "feet"] = "meters"


class CapacityInput(BaseModel):
    value: float | None = Field(default=None, ge=0, le=1_000_000_000)
    unit: Literal["liters", "cubic_meters"] = "liters"


class TemperatureRange(BaseModel):
    min: float | None = Field(default=None, ge=-10, le=60)
    max: float | None = Field(default=None, ge=-10, le=60)

    @model_validator(mode="after")
    def validate_order(self):
        if self.min is not None and self.max is not None and self.min > self.max:
            raise ValueError("Minimum temperature cannot be greater than maximum temperature.")
        return self


class PHRange(BaseModel):
    min: float | None = Field(default=None, ge=0, le=14)
    max: float | None = Field(default=None, ge=0, le=14)

    @model_validator(mode="after")
    def validate_order(self):
        if self.min is not None and self.max is not None and self.min > self.max:
            raise ValueError("Minimum pH cannot be greater than maximum pH.")
        return self


class OxygenRange(BaseModel):
    min: float | None = Field(default=None, ge=0, le=100)
    max: float | None = Field(default=None, ge=0, le=100)

    @model_validator(mode="after")
    def validate_order(self):
        if self.min is not None and self.max is not None and self.min > self.max:
            raise ValueError("Minimum dissolved oxygen cannot be greater than maximum dissolved oxygen.")
        return self


class WaterParameters(BaseModel):
    water_type: Literal["Freshwater", "Brackish Water", "Saltwater"] = "Freshwater"
    temperature: TemperatureRange = Field(default_factory=TemperatureRange)
    ph: PHRange = Field(default_factory=PHRange)
    dissolved_oxygen: OxygenRange = Field(default_factory=OxygenRange)


class FishStock(BaseModel):
    species: list[str] = Field(default_factory=list, max_length=10)
    initial_count: int | None = Field(default=None, ge=0, le=1_000_000_000)
    current_count: int | None = Field(default=None, ge=0, le=1_000_000_000)
    stocking_date: str | None = None
    initial_average_weight: float | None = Field(default=None, ge=0, le=1_000_000)
    initial_average_weight_unit: Literal["grams", "kg"] = "grams"

    @field_validator("species")
    @classmethod
    def clean_species(cls, values):
        cleaned = list(dict.fromkeys(item.strip() for item in values if item.strip()))
        if any(len(item) > 60 for item in cleaned):
            raise ValueError("Species names must be 60 characters or fewer.")
        return cleaned

    @field_validator("stocking_date")
    @classmethod
    def validate_stocking_date(cls, value):
        if value in (None, ""):
            return None
        try:
            return date.fromisoformat(value).isoformat()
        except (TypeError, ValueError):
            raise ValueError("Enter a valid stocking date.") from None


class MonitoringConfiguration(BaseModel):
    enabled: bool = True
    camera_available: bool = False
    camera_type: Literal["IP Camera", "USB Camera", "RTSP Camera", "Webcam", "Other"] = "IP Camera"
    camera_position: Literal["Top View", "Side View", "Underwater", "Entrance", "Exit", "Other"] = "Top View"


class AIConfiguration(BaseModel):
    fish_detection: bool = True
    species_detection: bool = True
    disease_detection: bool = True
    size_estimation: bool = True
    weight_estimation: bool = True


class AlertConfiguration(BaseModel):
    health_enabled: bool = True
    disease_threshold: float | None = Field(default=None, ge=0, le=100)
    mortality_threshold: float | None = Field(default=None, ge=0, le=100)
    population_change_threshold: float | None = Field(default=None, ge=0, le=100)


class FarmingConfiguration(BaseModel):
    purpose: Literal[
        "Grow-out", "Nursery", "Breeding", "Quarantine", "Treatment",
        "Research", "Mixed", "Other",
    ] = "Grow-out"
    stocking_density: float | None = Field(default=None, ge=0, le=1_000_000)
    feeding_schedule: str | None = Field(default=None, max_length=200)


class LocationDetails(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
