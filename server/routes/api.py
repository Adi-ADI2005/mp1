"""FastAPI backend for the FishCheck monitoring dashboard."""

from contextlib import asynccontextmanager
import io
import logging
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
from typing import Optional
from uuid import uuid4

from fastapi import (
    Depends, FastAPI, File, Form, HTTPException, Request, UploadFile, WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from PIL import Image, UnidentifiedImageError
from pymongo.errors import DuplicateKeyError
from pydantic import BaseModel, Field, field_validator
from config import settings
from routes.auth import router as auth_router
from schemas.pools import (
    AIConfiguration, AlertConfiguration, CapacityInput, DEFAULT_FACILITY_ID,
    DimensionInput, FarmingConfiguration, FishStock, LocationDetails,
    MonitoringConfiguration, WaterParameters,
)
from security import (
    decode_access_token, get_current_user, hash_password, normalize_role,
    require_roles, user_is_active,
)
from services.auth_service import seed_initial_admin
from services.analysis import analysis_service
from services.reporting import reporting_service
from schemas.auth import EMAIL_PATTERN
from storage import DatabaseUnavailable, now_iso, store


logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("fishcheck")
MAX_IMAGE_BYTES = settings.max_upload_size
MAX_VIDEO_BYTES = 50 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_VIDEO_SUFFIXES = {".mp4", ".mov", ".avi", ".webm", ".mkv"}

@asynccontextmanager
async def lifespan(app: FastAPI):
    if store.initialize():
        if store.mode == "mongodb":
            logger.info("Database: %s", settings.database_name)
        try:
            seed_initial_admin()
        except DuplicateKeyError:
            logger.info("Initial administrator already exists.")
        except Exception as exc:
            store._mark_unavailable(exc)
            logger.error("Database initialization failed: %s", store.connection_error)
    else:
        logger.error("Database is unavailable: %s", store.connection_error)
    try:
        yield
    finally:
        store.close()


app = FastAPI(
    title="FishCheck Monitoring API",
    description="Pool, camera, analysis, reporting, and farm monitoring services.",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)


@app.exception_handler(HTTPException)
async def handle_http_error(request: Request, exc: HTTPException):
    detail = exc.detail
    message = detail if isinstance(detail, str) else "The request could not be completed."
    error_codes = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
        422: "VALIDATION_ERROR",
        429: "RATE_LIMITED",
    }
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "message": message,
            "error_code": error_codes.get(exc.status_code, "REQUEST_FAILED"),
            "detail": detail,
        },
        headers=exc.headers,
    )


@app.exception_handler(DatabaseUnavailable)
async def handle_database_unavailable(request: Request, exc: DatabaseUnavailable):
    return JSONResponse(
        status_code=503,
        content={
            "success": False,
            "error": "Database unavailable",
            "message": str(exc),
        },
    )


@app.exception_handler(RequestValidationError)
async def handle_validation_error(request: Request, exc: RequestValidationError):
    errors = [
        {
            "field": ".".join(str(part) for part in error.get("loc", ())),
            "message": error.get("msg", "Invalid value."),
        }
        for error in exc.errors()
    ]
    message = errors[0]["message"] if errors else "Please check the submitted details."
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "message": message,
            "error_code": "VALIDATION_ERROR",
            "details": errors,
        },
    )


class PoolPayload(BaseModel):
    pool_id: Optional[str] = None
    pool_code: Optional[str] = Field(default=None, min_length=1, max_length=32)
    facility_id: str = Field(default=DEFAULT_FACILITY_ID, min_length=1, max_length=100)
    name: str = Field(min_length=2, max_length=100)
    location: str = Field(default="", max_length=120)
    pool_type: str = Field(default="Grow-out", max_length=50)
    capacity_l: Optional[int] = Field(default=None, ge=0, le=100_000_000)
    water_capacity: CapacityInput = Field(default_factory=CapacityInput)
    dimensions: DimensionInput = Field(default_factory=DimensionInput)
    water_parameters: WaterParameters = Field(default_factory=WaterParameters)
    fish_stock: FishStock = Field(default_factory=FishStock)
    monitoring: MonitoringConfiguration = Field(default_factory=MonitoringConfiguration)
    ai_configuration: AIConfiguration = Field(default_factory=AIConfiguration)
    alerts: AlertConfiguration = Field(default_factory=AlertConfiguration)
    farming: FarmingConfiguration = Field(default_factory=FarmingConfiguration)
    location_details: LocationDetails = Field(default_factory=LocationDetails)
    notes: str = Field(default="", max_length=2000)
    description: str = Field(default="", max_length=500)
    species: str = Field(default="Unspecified", max_length=80)
    fish_count: Optional[int] = Field(default=None, ge=0, le=1_000_000_000)
    camera_id: Optional[str] = None
    status: str = Field(default="active", pattern="^(active|inactive|maintenance)$")
    temperature_c: Optional[float] = None
    ph: Optional[float] = Field(default=None, ge=0, le=14)
    oxygen_mg_l: Optional[float] = Field(default=None, ge=0)

    @field_validator("pool_code")
    @classmethod
    def normalize_pool_code(cls, value):
        if value is None:
            return None
        value = value.strip().upper()
        if not re.fullmatch(r"[A-Z0-9][A-Z0-9_-]{0,31}", value):
            raise ValueError("Use letters, numbers, hyphens, or underscores for the pool code.")
        return value

    @field_validator("facility_id")
    @classmethod
    def normalize_facility_id(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Choose a facility.")
        return value

    @field_validator("pool_type")
    @classmethod
    def valid_pool_type(cls, value):
        supported = {
            "Circular", "Rectangular", "Raceway", "Tank", "Pond",
            "Aquaculture Cage", "Other", "Nursery", "Grow-out",
            "Production", "Hatchery", "Quarantine",
        }
        if value not in supported:
            raise ValueError("Choose a supported pool type.")
        return value


class CameraPayload(BaseModel):
    camera_id: Optional[str] = None
    name: str = Field(min_length=2, max_length=100)
    pool_id: Optional[str] = None
    type: str = Field(default="simulated", pattern="^(ip|rtsp|webcam|browser|simulated)$")
    url: Optional[str] = Field(default=None, max_length=500)
    location: str = Field(default="Farm", max_length=120)
    resolution: str = Field(default="1920 × 1080", max_length=40)
    fps: int = Field(default=30, ge=1, le=240)
    status: str = Field(default="offline", pattern="^(online|offline|unstable)$")


class UserPayload(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(pattern="^(admin|expert|farmer)$")
    assigned_pools: list[str] = Field(default_factory=list)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not EMAIL_PATTERN.fullmatch(value):
            raise ValueError("Enter a valid email address.")
        return value

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        if (
            not any(char.islower() for char in value)
            or not any(char.isupper() for char in value)
            or not any(char.isdigit() for char in value)
        ):
            raise ValueError("Password must include uppercase, lowercase, and numeric characters.")
        return value


class ReportRequest(BaseModel):
    report_type: str = Field(default="Farm overview", max_length=80)
    format: str = Field(default="csv", pattern="^(csv|pdf)$")
    pool_id: Optional[str] = None


def _public_user(user):
    return {
        key: user.get(key)
        for key in ("id", "name", "email", "role", "status", "assigned_pools")
    }


def _require_pool_access(user, pool_id):
    if (
        pool_id
        and user.get("role") != "admin"
        and pool_id not in (user.get("assigned_pools") or [])
    ):
        raise HTTPException(403, "This pool is not assigned to your account.")


def _public_camera(camera, include_url=False):
    if not camera:
        return None
    result = dict(camera)
    if not include_url:
        result.pop("url", None)
    return result


def _require_camera_access(user, camera):
    if user.get("role") != "admin" and (
        not camera.get("pool_id")
        or camera.get("pool_id") not in (user.get("assigned_pools") or [])
    ):
        raise HTTPException(403, "This camera is not assigned to your account.")


def _validate_analysis_context(user, pool_id, camera_id):
    if pool_id:
        if not store.find_one("pools", {"id": pool_id}):
            raise HTTPException(404, "The selected pool does not exist.")
        _require_pool_access(user, pool_id)
    if camera_id:
        camera = store.find_one("cameras", {"id": camera_id})
        if not camera:
            raise HTTPException(404, "The selected camera does not exist.")
        _require_camera_access(user, camera)
        camera_pool_id = camera.get("pool_id")
        if not camera_pool_id:
            raise HTTPException(400, "Associate this camera with a pool before using it.")
        if pool_id and camera_pool_id != pool_id:
            raise HTTPException(400, "Choose a camera assigned to the selected pool.")
        pool_id = camera_pool_id
        _require_pool_access(user, pool_id)
    return pool_id


def _audit(user, action, pool_id=None, camera_id=None, details=None):
    store.insert("audit_logs", {
        "id": str(uuid4()), "user_id": user.get("id"), "user_name": user.get("name"),
        "action": action, "pool_id": pool_id, "camera_id": camera_id,
        "details": details or {}, "timestamp": now_iso(),
    })


def _next_id(collection, prefix):
    existing = {row.get("id") for row in store.find(collection)}
    number = 1
    while f"{prefix}-{number:03d}" in existing:
        number += 1
    return f"{prefix}-{number:03d}"


def _validate_image(data, content_type):
    if not data:
        raise HTTPException(400, "Choose an image to analyze.")
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Image is too large. Maximum upload size is 10 MB.")
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(415, "Use a JPEG, PNG, or WebP image.")
    try:
        image = Image.open(io.BytesIO(data)).convert("RGB")
        image.load()
        return image
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(400, "The uploaded file could not be read as an image.")


def _save_analysis(result, user, pool_id=None, source="image", camera_id=None):
    pool = store.find_one("pools", {"id": pool_id}) if pool_id else None
    record = {
        "id": str(uuid4()), "pool_id": pool_id, "camera_id": camera_id, "source": source,
        "facility_id": (pool or {}).get("facility_id", DEFAULT_FACILITY_ID) if pool_id else None,
        "monitoring_session_id": None,
        "result": result, "created_by": user.get("id"), "created_at": now_iso(),
    }
    store.insert("analysis_results", record)
    _audit(
        user,
        "ANALYSIS_COMPLETED",
        pool_id=pool_id,
        camera_id=camera_id,
        details={"source": source},
    )
    return record


def _pool_analysis_configuration(pool_id):
    default = {
        "fish_detection": True,
        "species_detection": True,
        "disease_detection": True,
        "size_estimation": True,
        "weight_estimation": True,
    }
    if not pool_id:
        return default
    pool = store.find_one("pools", {"id": pool_id})
    if not pool:
        raise HTTPException(404, "The selected pool does not exist.")
    if not (pool.get("monitoring") or {}).get("enabled", True):
        raise HTTPException(409, "Monitoring is disabled for this pool.")
    return {**default, **(pool.get("ai_configuration") or {})}


def _apply_ai_configuration_to_result(result, configuration):
    result = dict(result)
    limitations = list(result.get("limitations") or [])
    if not configuration.get("species_detection", True):
        result["species"] = {
            "available": False, "label": None, "confidence": None, "top_predictions": [],
        }
        limitations.append("Species detection is disabled for this pool.")
    if not configuration.get("disease_detection", True):
        result["health"] = {
            "available": False, "label": None, "confidence": None,
            "top_predictions": [], "is_healthy": None,
        }
        limitations.append("Disease detection is disabled for this pool.")
    if not configuration.get("fish_detection", True):
        result["fish_count"] = None
        result["detections"] = []
        limitations.append("Fish detection is disabled for this pool.")
    if not configuration.get("size_estimation", True):
        result["estimated_length_cm"] = None
        result["estimated_height_cm"] = None
        limitations.append("Size estimation is disabled for this pool.")
    if not configuration.get("weight_estimation", True):
        result["estimated_weight_g"] = None
        limitations.append("Weight estimation is disabled for this pool.")
    result["limitations"] = list(dict.fromkeys(limitations))
    if result.get("frame_results"):
        result["frame_results"] = [
            _apply_ai_configuration_to_result(frame, configuration)
            for frame in result["frame_results"]
        ]
    return result


@app.get("/api/health")
def health():
    database_status = (
        "connected" if store.mode == "mongodb"
        else "demo" if store.mode == "demo"
        else "disconnected"
    )
    degraded = store.configured_mongodb and not store.ready
    return {
        "status": "degraded" if degraded else "ok",
        "backend": "online",
        "database": database_status,
        "database_name": settings.database_name if database_status == "connected" else None,
        "database_reason": store.connection_error,
        "environment": settings.environment,
        "demo_auth_enabled": settings.allow_demo_auth,
        "storage": store.mode,
        "storage_persistent": store.mode == "mongodb",
        "ai": analysis_service.status,
    }


@app.get("/api/pools")
def list_pools(user=Depends(get_current_user)):
    pools = store.find("pools")
    assigned = user.get("assigned_pools") or []
    if user.get("role") != "admin":
        pools = [pool for pool in pools if pool.get("id") in assigned]
    cameras = {camera.get("id"): camera for camera in store.find("cameras")}
    return [
        {
            **pool,
            "camera": _public_camera(
                cameras.get(pool.get("camera_id")),
                include_url=user.get("role") == "admin",
            ),
            "camera_status": (cameras.get(pool.get("camera_id")) or {}).get("status", "offline"),
        }
        for pool in pools
    ]


@app.post("/api/pools", status_code=201)
def create_pool(payload: PoolPayload, user=Depends(require_roles("admin"))):
    values = payload.model_dump()
    facility_id = values.pop("facility_id") or DEFAULT_FACILITY_ID
    pool_id = (
        values.pop("pool_code")
        or values.pop("pool_id")
        or _next_id("pools", "P")
    ).strip().upper()
    values.pop("pool_id", None)
    if store.find_one("pools", {"facility_id": facility_id, "pool_code": pool_id}):
        raise HTTPException(409, f"Pool code {pool_id} already exists in this facility.")
    if store.find_one("pools", {"id": pool_id}):
        raise HTTPException(409, f"Pool code {pool_id} already exists in this facility.")
    camera_id = values.get("camera_id")
    if camera_id and not store.find_one("cameras", {"id": camera_id}):
        raise HTTPException(404, "The selected camera does not exist.")
    values["pool_id"] = pool_id
    values["pool_code"] = pool_id
    values["facility_id"] = facility_id
    if values.get("species") == "Unspecified" and values["fish_stock"]["species"]:
        values["species"] = ", ".join(values["fish_stock"]["species"])
    if not values.get("description") and values.get("notes"):
        values["description"] = values["notes"][:500]
    if not values.get("notes") and values.get("description"):
        values["notes"] = values["description"]
    values["location"] = (
        values.get("location_details", {}).get("name") or values.get("location") or ""
    )
    try:
        row = store.insert("pools", {
            **values, "id": pool_id, "pool_id": pool_id,
            "last_monitoring": None, "health": "unknown", "created_at": now_iso(),
        })
    except DuplicateKeyError:
        raise HTTPException(409, f"Pool code {pool_id} already exists in this facility.") from None
    if camera_id:
        store.update("cameras", camera_id, {"pool_id": pool_id})
    _audit(user, "POOL_CREATED", pool_id=pool_id)
    return row


@app.get("/api/pools/{pool_id}")
def get_pool(pool_id: str, user=Depends(get_current_user)):
    pool = store.find_one("pools", {"id": pool_id.upper()})
    if not pool:
        raise HTTPException(404, "Pool not found.")
    _require_pool_access(user, pool["id"])
    camera = store.find_one("cameras", {"id": pool.get("camera_id")}) if pool.get("camera_id") else None
    analyses = store.find("analysis_results", {"pool_id": pool["id"]})
    return {
        **pool,
        "camera": _public_camera(camera, include_url=user.get("role") == "admin"),
        "recent_analyses": analyses[:10],
    }


@app.put("/api/pools/{pool_id}")
def update_pool(pool_id: str, payload: PoolPayload, user=Depends(require_roles("admin"))):
    pool_id = pool_id.upper()
    existing = store.find_one("pools", {"id": pool_id})
    if not existing:
        raise HTTPException(404, "Pool not found.")
    values = payload.model_dump(exclude={"pool_id"}, exclude_unset=True)
    requested_code = values.pop("pool_code", existing.get("pool_code") or existing.get("id"))
    requested_facility = values.pop("facility_id", existing.get("facility_id", DEFAULT_FACILITY_ID))
    if requested_code != (existing.get("pool_code") or existing.get("id")) or requested_facility != existing.get("facility_id", DEFAULT_FACILITY_ID):
        raise HTTPException(409, "Pool code and facility cannot be changed.")
    camera_id = values.get("camera_id")
    if camera_id and not store.find_one("cameras", {"id": camera_id}):
        raise HTTPException(404, "The selected camera does not exist.")
    if "location_details" in values and values["location_details"]:
        values["location"] = values["location_details"].get("name") or values.get("location", existing.get("location"))
    values["updated_at"] = now_iso()
    try:
        updated = store.update("pools", pool_id, values)
    except DuplicateKeyError:
        raise HTTPException(409, "Pool code already exists in this facility.") from None
    if camera_id:
        store.update("cameras", camera_id, {"pool_id": pool_id})
    _audit(user, "POOL_UPDATED", pool_id=pool_id)
    return updated


@app.delete("/api/pools/{pool_id}")
def delete_pool(pool_id: str, user=Depends(require_roles("admin"))):
    pool_id = pool_id.upper()
    if not store.delete("pools", pool_id):
        raise HTTPException(404, "Pool not found.")
    for camera in store.find("cameras", {"pool_id": pool_id}):
        store.update("cameras", camera["id"], {"pool_id": None})
    _audit(user, "POOL_DELETED", pool_id=pool_id)
    return {"deleted": True, "pool_id": pool_id}


@app.get("/api/cameras")
def list_cameras(user=Depends(get_current_user)):
    cameras = store.find("cameras")
    if user.get("role") != "admin":
        assigned = set(user.get("assigned_pools") or [])
        cameras = [camera for camera in cameras if camera.get("pool_id") in assigned]
    pools = {pool["id"]: pool.get("name") for pool in store.find("pools")}
    return [
        {
            **_public_camera(camera, include_url=user.get("role") == "admin"),
            "pool_name": pools.get(camera.get("pool_id")),
        }
        for camera in cameras
    ]


@app.post("/api/cameras", status_code=201)
def create_camera(payload: CameraPayload, user=Depends(require_roles("admin"))):
    values = payload.model_dump()
    camera_id = (values.pop("camera_id") or _next_id("cameras", "CAM")).strip().upper()
    if store.find_one("cameras", {"id": camera_id}):
        raise HTTPException(409, "That camera ID is already in use.")
    pool_id = values.get("pool_id")
    if pool_id and not store.find_one("pools", {"id": pool_id}):
        raise HTTPException(404, "The selected pool does not exist.")
    row = store.insert("cameras", {
        **values, "id": camera_id, "camera_id": camera_id,
        "last_active": now_iso() if values["status"] == "online" else None,
    })
    if pool_id:
        store.update("pools", pool_id, {"camera_id": camera_id})
    _audit(user, "CAMERA_ADDED", pool_id=pool_id, camera_id=camera_id)
    return row


@app.get("/api/cameras/{camera_id}")
def get_camera(camera_id: str, user=Depends(get_current_user)):
    camera = store.find_one("cameras", {"id": camera_id.upper()})
    if not camera:
        raise HTTPException(404, "Camera not found.")
    _require_camera_access(user, camera)
    return _public_camera(camera, include_url=user.get("role") == "admin")


@app.put("/api/cameras/{camera_id}")
def update_camera(camera_id: str, payload: CameraPayload, user=Depends(require_roles("admin"))):
    camera_id = camera_id.upper()
    camera = store.find_one("cameras", {"id": camera_id})
    if not camera:
        raise HTTPException(404, "Camera not found.")
    values = payload.model_dump(exclude={"camera_id"}, exclude_unset=True)
    pool_id = values.get("pool_id")
    if pool_id and not store.find_one("pools", {"id": pool_id}):
        raise HTTPException(404, "The selected pool does not exist.")
    updated = store.update("cameras", camera_id, {**values, "updated_at": now_iso()})
    if "pool_id" in values:
        if camera.get("pool_id") and camera.get("pool_id") != pool_id:
            store.update("pools", camera["pool_id"], {"camera_id": None})
        if pool_id:
            store.update("pools", pool_id, {"camera_id": camera_id})
    _audit(user, "CAMERA_UPDATED", pool_id=pool_id, camera_id=camera_id)
    return updated


@app.delete("/api/cameras/{camera_id}")
def delete_camera(camera_id: str, user=Depends(require_roles("admin"))):
    camera_id = camera_id.upper()
    camera = store.find_one("cameras", {"id": camera_id})
    if not camera or not store.delete("cameras", camera_id):
        raise HTTPException(404, "Camera not found.")
    if camera.get("pool_id"):
        store.update("pools", camera["pool_id"], {"camera_id": None})
    _audit(user, "CAMERA_REMOVED", pool_id=camera.get("pool_id"), camera_id=camera_id)
    return {"deleted": True, "camera_id": camera_id}


async def _analyze_image_data(image_data, content_type, user, pool_id, source, camera_id=None):
    image = _validate_image(image_data, content_type)
    configuration = _pool_analysis_configuration(pool_id)
    if not any(configuration.values()):
        raise HTTPException(409, "No AI analysis modules are enabled for this pool.")
    started = time.perf_counter()
    result = _apply_ai_configuration_to_result(
        analysis_service.analyze_image(image), configuration
    )
    if not result["species"]["available"] and not result["health"]["available"]:
        raise HTTPException(
            status_code=503,
            detail="No trained image classifier is available on this server.",
        )
    result["latency_ms"] = round((time.perf_counter() - started) * 1000, 1)
    record = _save_analysis(result, user, pool_id, source, camera_id)
    return {"analysis_id": record["id"], **result, "created_at": record["created_at"]}


@app.post("/api/analysis/image")
@app.post("/api/analysis/webcam")
@app.post("/api/analysis/count-fish")
@app.post("/api/analysis/species")
@app.post("/api/analysis/disease")
async def analyze_image(
    image: UploadFile = File(...),
    pool_id: Optional[str] = Form(default=None),
    camera_id: Optional[str] = Form(default=None),
    user=Depends(get_current_user),
):
    pool_id = _validate_analysis_context(user, pool_id, camera_id)
    content = await image.read(MAX_IMAGE_BYTES + 1)
    return await _analyze_image_data(
        content, image.content_type or "", user, pool_id, source="image", camera_id=camera_id
    )


def _jpeg_frames(buffer):
    frames = []
    cursor = 0
    while True:
        start = buffer.find(b"\xff\xd8", cursor)
        if start < 0:
            break
        end = buffer.find(b"\xff\xd9", start + 2)
        if end < 0:
            break
        frames.append(Image.open(io.BytesIO(buffer[start:end + 2])).convert("RGB"))
        cursor = end + 2
    return frames


@app.post("/api/analysis/video")
async def analyze_video(
    video: UploadFile = File(...),
    pool_id: Optional[str] = Form(default=None),
    camera_id: Optional[str] = Form(default=None),
    user=Depends(get_current_user),
):
    suffix = Path(video.filename or "").suffix.lower()
    if suffix not in ALLOWED_VIDEO_SUFFIXES:
        raise HTTPException(415, "Use an MP4, MOV, AVI, WebM, or MKV video.")
    pool_id = _validate_analysis_context(user, pool_id, camera_id)
    content = await video.read(MAX_VIDEO_BYTES + 1)
    if not content:
        raise HTTPException(400, "Choose a video to analyze.")
    if len(content) > MAX_VIDEO_BYTES:
        raise HTTPException(413, "Video is too large. Maximum upload size is 50 MB.")

    frames = []
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix) as temporary:
            temporary.write(content)
            temporary.flush()
            completed = subprocess.run(
                [
                    "ffmpeg", "-v", "error", "-i", temporary.name,
                    "-vf", "fps=1/3,scale='min(1280,iw)':-2",
                    "-frames:v", "8", "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1",
                ],
                capture_output=True, timeout=60, check=False,
            )
        if completed.returncode != 0:
            logger.warning("ffmpeg could not decode uploaded video: %s", completed.stderr[-500:])
            raise HTTPException(400, "The uploaded video could not be decoded.")
        frames = _jpeg_frames(completed.stdout)
    except subprocess.TimeoutExpired:
        raise HTTPException(408, "Video analysis took too long. Try a shorter clip.")
    except FileNotFoundError:
        raise HTTPException(503, "Video frame extraction is not available on this server.")
    if not frames:
        raise HTTPException(400, "No readable frames were found in the video.")

    started = time.perf_counter()
    configuration = _pool_analysis_configuration(pool_id)
    if not any(configuration.values()):
        raise HTTPException(409, "No AI analysis modules are enabled for this pool.")
    frame_results = _apply_ai_configuration_to_result(
        analysis_service.analyze_frames(frames), configuration
    )
    if not frame_results["species"]["available"] and not frame_results["health"]["available"]:
        raise HTTPException(503, "No enabled trained image classifier is available on this server.")
    result = {
        **frame_results,
        "latency_ms": round((time.perf_counter() - started) * 1000, 1),
    }
    record = _save_analysis(result, user, pool_id, source="video", camera_id=camera_id)
    return {"analysis_id": record["id"], **result, "created_at": record["created_at"]}


@app.get("/api/analysis")
def list_analyses(pool_id: Optional[str] = None, user=Depends(get_current_user)):
    _require_pool_access(user, pool_id)
    query = {"pool_id": pool_id} if pool_id else {}
    rows = store.find("analysis_results", query)
    if user.get("role") != "admin" and not pool_id:
        assigned = set(user.get("assigned_pools") or [])
        rows = [row for row in rows if row.get("pool_id") in assigned]
    return sorted(rows, key=lambda row: row.get("created_at", ""), reverse=True)


@app.get("/api/fish")
def list_fish(pool_id: Optional[str] = None, user=Depends(get_current_user)):
    _require_pool_access(user, pool_id)
    query = {"pool_id": pool_id} if pool_id else {}
    rows = store.find("fish", query)
    if user.get("role") != "admin" and not pool_id:
        assigned = set(user.get("assigned_pools") or [])
        rows = [row for row in rows if row.get("pool_id") in assigned]
    return rows


@app.get("/api/fish/{fish_id}")
def get_fish(fish_id: str, user=Depends(get_current_user)):
    fish = store.find_one("fish", {"id": fish_id})
    if not fish:
        raise HTTPException(404, "Fish record not found.")
    _require_pool_access(user, fish.get("pool_id"))
    return fish


@app.get("/api/analytics/dashboard")
def dashboard_analytics(user=Depends(get_current_user)):
    pools = list_pools(user)
    cameras = store.find("cameras")
    if user.get("role") != "admin":
        assigned = set(user.get("assigned_pools") or [])
        cameras = [camera for camera in cameras if camera.get("pool_id") in assigned]
    analyses = store.find("analysis_results")
    alerts = store.find("alerts")
    audit_rows = store.find("audit_logs")
    if user.get("role") != "admin":
        assigned = set(user.get("assigned_pools") or [])
        analyses = [row for row in analyses if row.get("pool_id") in assigned]
        alerts = [row for row in alerts if row.get("pool_id") in assigned]
        audit_rows = [
            row for row in audit_rows
            if row.get("user_id") == user.get("id") or row.get("pool_id") in assigned
        ]
    fish_total = sum(int(pool.get("fish_count") or 0) for pool in pools)
    status_counts = {
        "normal": sum(pool.get("health") == "normal" for pool in pools),
        "warning": sum(pool.get("health") == "warning" for pool in pools),
        "alert": sum(pool.get("health") == "alert" for pool in pools),
        "unknown": sum(pool.get("health") == "unknown" for pool in pools),
    }
    species_counts = {}
    for pool in pools:
        species = pool.get("species") or "Unspecified"
        species_counts[species] = species_counts.get(species, 0) + int(pool.get("fish_count") or 0)
    return {
        "storage_mode": store.mode,
        "sample_data": store.mode == "demo",
        "ai": analysis_service.status,
        "summary": {
            "total_pools": len(pools),
            "total_cameras": len(cameras),
            "online_cameras": sum(camera.get("status") == "online" for camera in cameras),
            "offline_cameras": sum(camera.get("status") == "offline" for camera in cameras),
            "total_fish": fish_total,
            "healthy_fish_estimate": sum(
                int(pool.get("fish_count") or 0) for pool in pools if pool.get("health") == "normal"
            ),
            "health_alerts": len([a for a in alerts if a.get("status") != "resolved"]),
            "average_length_cm": None,
            "average_weight_g": None,
            "estimated_biomass_kg": None,
            "analyses_saved": len(analyses),
        },
        "fish_by_pool": [
            {"pool": pool.get("id"), "name": pool.get("name"), "count": pool.get("fish_count", 0)}
            for pool in pools
        ],
        "species_distribution": [
            {"name": species, "value": count}
            for species, count in sorted(species_counts.items(), key=lambda item: item[1], reverse=True)
        ],
        "health_distribution": [
            {"name": name.title(), "value": count}
            for name, count in status_counts.items() if count
        ],
        "population_history": [],
        "recent_analyses": sorted(
            analyses, key=lambda row: row.get("created_at", ""), reverse=True
        )[:5],
        "recent_activity": sorted(
            audit_rows, key=lambda row: row.get("timestamp", ""), reverse=True
        )[:5],
    }


@app.get("/api/analytics/pool/{pool_id}")
def pool_analytics(pool_id: str, user=Depends(get_current_user)):
    pool = store.find_one("pools", {"id": pool_id.upper()})
    if not pool:
        raise HTTPException(404, "Pool not found.")
    _require_pool_access(user, pool["id"])
    return {
        "pool": pool,
        "analyses": store.find("analysis_results", {"pool_id": pool_id.upper()}),
        "alerts": store.find("alerts", {"pool_id": pool_id.upper()}),
    }


@app.get("/api/analytics/species")
def species_analytics(user=Depends(get_current_user)):
    return dashboard_analytics(user)["species_distribution"]


@app.get("/api/analytics/disease")
def disease_analytics(user=Depends(get_current_user)):
    rows = store.find("disease_detections")
    if user.get("role") != "admin":
        assigned = set(user.get("assigned_pools") or [])
        rows = [row for row in rows if row.get("pool_id") in assigned]
    return rows


@app.get("/api/alerts")
def list_alerts(user=Depends(get_current_user)):
    rows = store.find("alerts")
    if user.get("role") != "admin":
        assigned = set(user.get("assigned_pools") or [])
        rows = [row for row in rows if row.get("pool_id") in assigned]
    return sorted(rows, key=lambda row: row.get("created_at", ""), reverse=True)


@app.post("/api/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: str, user=Depends(get_current_user)):
    existing = store.find_one("alerts", {"id": alert_id})
    if not existing:
        raise HTTPException(404, "Alert not found.")
    _require_pool_access(user, existing.get("pool_id"))
    alert = store.update("alerts", alert_id, {"status": "resolved", "resolved_at": now_iso()})
    if not alert:
        raise HTTPException(404, "Alert not found.")
    _audit(user, "ALERT_RESOLVED", pool_id=alert.get("pool_id"))
    return alert


@app.get("/api/users")
def list_users(user=Depends(require_roles("admin"))):
    return [_public_user(row) for row in store.find("users")]


@app.post("/api/users", status_code=201)
def create_user(payload: UserPayload, user=Depends(require_roles("admin"))):
    email = payload.email
    if store.find_one("users", {"email": email}):
        raise HTTPException(409, "An account with this email already exists.")
    assigned_pools = list(dict.fromkeys(pool_id.upper() for pool_id in payload.assigned_pools))
    missing_pools = [
        pool_id for pool_id in assigned_pools
        if not store.find_one("pools", {"id": pool_id})
    ]
    if missing_pools:
        raise HTTPException(404, f"Pool not found: {', '.join(missing_pools)}.")
    try:
        row = store.insert("users", {
            "id": str(uuid4()), "name": payload.name.strip(), "email": email,
            "password_hash": hash_password(payload.password), "role": payload.role,
            "assigned_pools": assigned_pools if payload.role != "admin" else [],
            "status": "active", "is_active": True, "created_at": now_iso(),
        })
    except DuplicateKeyError:
        raise HTTPException(409, "An account with this email already exists.") from None
    _audit(user, "USER_CREATED", details={"email": email, "role": payload.role})
    return _public_user(row)


@app.delete("/api/users/{user_id}")
def delete_user(user_id: str, user=Depends(require_roles("admin"))):
    if user_id == user.get("id"):
        raise HTTPException(400, "You cannot remove your own account.")
    if not store.delete("users", user_id):
        raise HTTPException(404, "User not found.")
    _audit(user, "USER_REMOVED", details={"user_id": user_id})
    return {"deleted": True}


@app.get("/api/reports")
def list_reports(user=Depends(get_current_user)):
    rows = store.find("reports")
    if user.get("role") != "admin":
        assigned = set(user.get("assigned_pools") or [])
        rows = [
            row for row in rows
            if row.get("created_by") == user.get("id")
            and (row.get("pool_id") is None or row.get("pool_id") in assigned)
        ]
    return [
        {key: value for key, value in row.items() if key != "snapshot"}
        for row in sorted(rows, key=lambda row: row.get("created_at", ""), reverse=True)
    ]


def _load_report_for_user(report_id, user):
    report = store.find_one("reports", {"id": report_id})
    if not report:
        raise HTTPException(404, "Report not found.")
    if user.get("role") != "admin":
        _require_pool_access(user, report.get("pool_id"))
        if report.get("created_by") != user.get("id"):
            raise HTTPException(403, "This report is not available to your account.")
    return report


@app.get("/api/reports/{report_id}")
def get_report(report_id: str, user=Depends(get_current_user)):
    report = _load_report_for_user(report_id, user)
    return {key: value for key, value in report.items() if key != "snapshot"}


@app.get("/api/reports/{report_id}/download")
def download_report(report_id: str, user=Depends(get_current_user)):
    report = _load_report_for_user(report_id, user)
    rows = report.get("snapshot", [])
    if report["format"] == "pdf":
        content = reporting_service.pdf(rows, report["report_type"])
        media_type = "application/pdf"
    else:
        content = reporting_service.csv(rows)
        media_type = "text/csv; charset=utf-8"
    return StreamingResponse(
        io.BytesIO(content), media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{report.get("filename", "fishcheck-report")}"'},
    )


@app.post("/api/reports/generate")
def generate_report(payload: ReportRequest, user=Depends(get_current_user)):
    pool_id = payload.pool_id.upper() if payload.pool_id else None
    if pool_id and not store.find_one("pools", {"id": pool_id}):
        raise HTTPException(404, "Pool not found.")
    _require_pool_access(user, pool_id)
    rows = reporting_service.rows(pool_id)
    if user.get("role") != "admin":
        assigned = set(user.get("assigned_pools") or [])
        rows = [row for row in rows if row["pool_id"] in assigned]
    if not rows:
        raise HTTPException(404, "There is no pool data to include in this report.")
    report_id = str(uuid4())
    slug = re.sub(r"[^a-z0-9]+", "-", payload.report_type.lower()).strip("-") or "report"
    safe_name = f"fishcheck-{slug}-{report_id[:8]}"
    if payload.format == "pdf":
        content = reporting_service.pdf(rows, payload.report_type)
        media_type, extension = "application/pdf", "pdf"
    else:
        content = reporting_service.csv(rows)
        media_type, extension = "text/csv; charset=utf-8", "csv"
    store.insert("reports", {
        "id": report_id, "report_type": payload.report_type,
        "format": payload.format, "created_by": user.get("id"),
        "created_at": now_iso(), "pool_id": pool_id,
        "filename": f"{safe_name}.{extension}",
        "snapshot": rows,
    })
    _audit(user, "REPORT_GENERATED", pool_id=pool_id)
    return StreamingResponse(
        io.BytesIO(content), media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.{extension}"'},
    )


@app.websocket("/ws/camera/{camera_id}")
async def camera_socket(websocket: WebSocket, camera_id: str):
    token = websocket.query_params.get("token", "")
    try:
        payload = decode_access_token(token)
    except HTTPException:
        await websocket.close(code=4401)
        return
    user_id = payload.get("sub")
    camera = store.find_one("cameras", {"id": camera_id.upper()})
    if not camera:
        await websocket.close(code=4404)
        return
    if user_id == "demo-admin" and store.mode == "demo":
        user = {"id": user_id, "role": "admin"}
    else:
        user = store.find_one("users", {"id": user_id})
        if not user or not user_is_active(user):
            await websocket.close(code=4401)
            return
    if normalize_role(user.get("role")) != "admin" and (
        not camera.get("pool_id")
        or camera.get("pool_id") not in (user.get("assigned_pools") or [])
    ):
        await websocket.close(code=4403)
        return
    await websocket.accept()
    try:
        while True:
            camera = store.find_one("cameras", {"id": camera_id.upper()})
            if not camera:
                await websocket.send_json({"type": "camera_status", "status": "offline"})
                break
            await websocket.send_json({
                "type": "camera_status", "camera_id": camera["id"],
                "status": camera.get("status", "offline"), "timestamp": now_iso(),
                "message": "Status heartbeat only; no live IP/RTSP stream is configured.",
            })
            import asyncio
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        logger.info("Camera monitoring socket closed for %s", camera_id)

