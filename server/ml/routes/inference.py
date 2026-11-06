from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from PIL import Image, UnidentifiedImageError

from ...utils.security import get_current_user
from ..services.inference_service import get_inference_service

router = APIRouter(prefix="/api/ml", tags=["machine learning"])
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


@router.post("/inference")
@router.post("/detection")
@router.post("/classification")
@router.post("/disease")
@router.post("/tracking")
@router.post("/measurement")
async def run_inference(
    request: Request, image: UploadFile = File(...), user: dict = Depends(get_current_user),
):
    extension = Path(image.filename or "").suffix.lower()
    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Upload a JPG, PNG, or WEBP image.")
    data = await image.read(request.app.state.settings.max_upload_size + 1)
    if len(data) > request.app.state.settings.max_upload_size:
        raise HTTPException(status_code=413, detail="Image exceeds the configured upload limit.")
    from io import BytesIO
    try:
        parsed = Image.open(BytesIO(data)).convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(status_code=415, detail="The selected file is not a supported image.") from None
    path = request.app.state.settings.upload_dir / "frames" / f"{uuid4().hex}{extension}"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return {
        **get_inference_service().analyze(path, parsed.size),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }