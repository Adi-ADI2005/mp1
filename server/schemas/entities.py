from pydantic import BaseModel, Field, field_validator


class PoolInput(BaseModel):
    pool_name: str = Field(min_length=2, max_length=80)
    location: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=500)
    capacity: int = Field(gt=0, le=10_000_000)
    water_volume: float = Field(default=0, ge=0)
    species: str = Field(default="Other", max_length=60)
    status: str = Field(default="ACTIVE")

    @field_validator("status")
    @classmethod
    def valid_pool_status(cls, value: str) -> str:
        normalized = value.upper()
        if normalized not in {"ACTIVE", "MAINTENANCE", "INACTIVE"}:
            raise ValueError("Status must be ACTIVE, MAINTENANCE, or INACTIVE.")
        return normalized


class CameraInput(BaseModel):
    camera_name: str = Field(min_length=2, max_length=80)
    pool_id: str = Field(min_length=1, max_length=32)
    camera_type: str = Field(default="Simulation")
    camera_url: str = Field(default="", max_length=500)
    resolution: str = Field(default="1920x1080", max_length=30)
    fps: int = Field(default=25, gt=0, le=240)
    location: str = Field(default="", max_length=120)

    @field_validator("camera_type")
    @classmethod
    def valid_camera_type(cls, value: str) -> str:
        normalized = value.strip()
        if normalized not in {"Webcam", "USB Camera", "IP Camera", "RTSP", "Uploaded Video", "Simulation"}:
            raise ValueError("Unsupported camera type.")
        return normalized


class RegisterInput(BaseModel):
    full_name: str = Field(min_length=2, max_length=80)
    email: str = Field(min_length=5, max_length=160)
    password: str = Field(min_length=10, max_length=128)


class LoginInput(BaseModel):
    email: str = Field(min_length=5, max_length=160)
    password: str = Field(min_length=1, max_length=128)


class ReportInput(BaseModel):
    type: str = Field(default="farm", pattern="^(farm|pool|species|disease|camera|population)$")
    format: str = Field(default="csv", pattern="^(csv|pdf)$")
    pool_id: str | None = Field(default=None, max_length=32)