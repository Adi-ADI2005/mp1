from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from PIL import Image, UnidentifiedImageError

from ..utils.audit import record_audit
from ..utils.security import get_current_user, require_roles
from ..ml.services.inference_service import get_inference_service
from .analytics import dashboard_payload
from ..websocket.manager import manager

router = APIRouter(prefix="/api/analysis", tags=["analysis"])
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ANALYSIS_ROLES = ("ADMIN", "MARINE_EXPERT")


@router.get("/recent")
async def recent_analyses(request: Request, user: dict = Depends(get_current_user)):
    return await request.app.state.database.find_many(
        "analysis_results", sort=("created_at", -1), limit=30
    )


@router.post("/image")
async def analyze_image(
    request: Request,
    image: UploadFile = File(...),
    pool_id: str = Form(...),
    camera_id: str = Form(...),
    user: dict = Depends(require_roles(*ANALYSIS_ROLES)),
):
    database = request.app.state.database
    if not image.filename or Path(image.filename).suffix.lower() not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Upload a JPG, PNG, or WEBP image.")
    pool = await database.find_one("pools", {"pool_id": pool_id})
    if pool is None:
        raise HTTPException(status_code=404, detail="Choose an existing pool.")
    camera = await database.find_one("cameras", {"camera_id": camera_id})
    if camera is None or camera.get("pool_id") != pool_id:
        raise HTTPException(status_code=400, detail="Choose a camera assigned to this pool.")

    contents = await image.read(request.app.state.settings.max_upload_size + 1)
    if not contents:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(contents) > request.app.state.settings.max_upload_size:
        raise HTTPException(status_code=413, detail="Image exceeds the configured upload limit.")
    try:
        from io import BytesIO
        validated = Image.open(BytesIO(contents))
        validated.verify()
        parsed = Image.open(BytesIO(contents)).convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(status_code=415, detail="The selected file is not a supported image.") from None

    extension = Path(image.filename).suffix.lower()
    filename = f"{uuid4().hex}{extension}"
    image_path = request.app.state.settings.upload_dir / "images" / filename
    image_path.parent.mkdir(parents=True, exist_ok=True)
    image_path.write_bytes(contents)
    try:
        service = get_inference_service()
        result = service.analyze(
            image_path,
            parsed.size,
            float(camera.get("reference_length_cm", 0) or 0),
        )
    except RuntimeError:
        image_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=503,
            detail="Fish detection is unavailable because no trained detector is configured.",
        ) from None
    detections = result["detections"]
    record_id = str(uuid4())
    for detection in detections:
        detection["fish_id"] = f"{pool_id}-{record_id[:8]}-{detection['fish_id']}"
    species_counts = Counter(item["species"] for item in detections)
    disease_counts = Counter(item["disease"] for item in detections)
    healthy_count = disease_counts.get("Healthy", 0)
    disease_count = sum(count for name, count in disease_counts.items() if name not in {"Healthy", "Unknown"})
    known_lengths = [item["length_cm"] for item in detections if item.get("length_cm") is not None]
    average_length = round(sum(known_lengths) / len(known_lengths), 1) if known_lengths else None
    known_weights = [item["weight_g"] for item in detections if item.get("weight_g") is not None]
    average_weight = round(sum(known_weights) / len(known_weights), 1) if known_weights else None
    summary = {
        "average_length_cm": average_length,
        "average_weight_g": average_weight,
        "estimated_biomass_kg": round(sum(known_weights) / 1000, 2) if known_weights else None,
        "healthy_count": healthy_count,
        "disease_count": disease_count,
    }
    created_at = datetime.now(timezone.utc).isoformat()
    record = {
        "_id": record_id,
        "id": record_id,
        "pool_id": pool_id,
        "camera_id": camera_id,
        "created_at": created_at,
        "provider_mode": result["provider_mode"],
        "image_filename": filename,
        "fish_count": len(detections),
        "detections": detections,
        "summary": summary,
        "species_distribution": [{"name": name, "count": count} for name, count in species_counts.items()],
        "disease_distribution": [{"name": name, "count": count} for name, count in disease_counts.items()],
        "disclaimer": result["disclaimer"],
    }
    await database.insert_one("analysis_results", record)
    for detection in detections:
        await database.insert_one("fish", {
            "_id": str(uuid4()),
            "fish_id": detection["fish_id"],
            "pool_id": pool_id,
            "camera_id": camera_id,
            "analysis_id": record_id,
            "species": detection.get("species", "Unknown"),
            "species_confidence": detection.get("species_confidence", 0),
            "length_cm": detection.get("length_cm"),
            "weight_g": detection.get("weight_g"),
            "disease": detection.get("disease", "Unknown"),
            "disease_confidence": detection.get("disease_confidence", 0),
            "health_status": detection.get("disease", "Unknown"),
            "first_detected": created_at,
            "last_detected": created_at,
            "tracking_scope": "single-image-analysis",
        })
    await database.insert_one("fish_detections", {
        "_id": str(uuid4()),
        "pool_id": pool_id,
        "camera_id": camera_id,
        "analysis_id": record_id,
        "fish_count": len(detections),
        "detections": detections,
        "created_at": created_at,
    })
    if disease_count:
        alert = {
            "_id": str(uuid4()),
            "alert_id": str(uuid4()),
            "type": "DISEASE",
            "pool_id": pool_id,
            "camera_id": camera_id,
            "message": f"Demo screening flagged {disease_count} fish for expert review in {pool_id}.",
            "severity": "MEDIUM",
            "is_read": False,
            "created_at": created_at,
            "analysis_id": record_id,
        }
        await database.insert_one("health_alerts", alert)
    if detections:
        pool_update = {"last_observed_fish_count": len(detections), "updated_at": created_at}
        if average_length is not None:
            pool_update["average_length_cm"] = average_length
        if average_weight is not None:
            pool_update["average_weight_g"] = average_weight
        await database.update_one("pools", {"pool_id": pool_id}, pool_update)
    await record_audit(database, user, "ANALYSIS_COMPLETE", record_id)
    event = {
        "type": "analysis_complete",
        "pool_id": pool_id,
        "camera_id": camera_id,
        "result": record,
        **await dashboard_payload(database),
    }
    await manager.broadcast(event, f"pool:{pool_id}")
    return record