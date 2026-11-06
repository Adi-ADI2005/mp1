from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request

from ..schemas.entities import CameraInput
from ..utils.audit import record_audit
from ..utils.security import get_current_user, require_roles

router = APIRouter(prefix="/api/cameras", tags=["cameras"])


@router.get("")
async def list_cameras(request: Request, user: dict = Depends(get_current_user)):
    return await request.app.state.database.find_many("cameras", sort=("created_at", -1))


@router.post("")
async def create_camera(
    payload: CameraInput, request: Request, user: dict = Depends(require_roles("ADMIN")),
):
    database = request.app.state.database
    pool = await database.find_one("pools", {"pool_id": payload.pool_id})
    if pool is None:
        raise HTTPException(status_code=404, detail="Choose an existing pool for this camera.")
    now = datetime.now(timezone.utc).isoformat()
    camera_id = f"CAM-{uuid4().hex[:6].upper()}"
    camera = {
        **payload.model_dump(),
        "_id": str(uuid4()),
        "camera_id": camera_id,
        "status": "OFFLINE",
        "last_seen": None,
        "created_at": now,
    }
    await database.insert_one("cameras", camera)
    await database.update_one(
        "pools", {"pool_id": payload.pool_id},
        {"camera_ids": list(dict.fromkeys(pool.get("camera_ids", []) + [camera_id]))},
    )
    await record_audit(database, user, "CAMERA_CREATED", camera_id)
    return camera


@router.get("/{camera_id}")
async def get_camera(camera_id: str, request: Request, user: dict = Depends(get_current_user)):
    camera = await request.app.state.database.find_one("cameras", {"camera_id": camera_id})
    if camera is None:
        raise HTTPException(status_code=404, detail="Camera not found.")
    return camera


@router.put("/{camera_id}")
async def update_camera(
    camera_id: str, payload: CameraInput, request: Request,
    user: dict = Depends(require_roles("ADMIN")),
):
    database = request.app.state.database
    camera = await database.find_one("cameras", {"camera_id": camera_id})
    if camera is None:
        raise HTTPException(status_code=404, detail="Camera not found.")
    if await database.find_one("pools", {"pool_id": payload.pool_id}) is None:
        raise HTTPException(status_code=404, detail="Choose an existing pool for this camera.")
    fields = payload.model_dump()
    await database.update_one("cameras", {"camera_id": camera_id}, fields)
    return {**camera, **fields}


@router.delete("/{camera_id}")
async def delete_camera(
    camera_id: str, request: Request, user: dict = Depends(require_roles("ADMIN")),
):
    database = request.app.state.database
    camera = await database.find_one("cameras", {"camera_id": camera_id})
    if camera is None:
        raise HTTPException(status_code=404, detail="Camera not found.")
    await database.delete_one("cameras", {"camera_id": camera_id})
    pool = await database.find_one("pools", {"pool_id": camera["pool_id"]})
    if pool:
        await database.update_one(
            "pools", {"pool_id": camera["pool_id"]},
            {"camera_ids": [item for item in pool.get("camera_ids", []) if item != camera_id]},
        )
    await record_audit(database, user, "CAMERA_DELETED", camera_id)
    return {"message": f"Camera {camera_id} removed."}


async def _set_status(camera_id: str, status: str, request: Request, user: dict):
    database = request.app.state.database
    camera = await database.find_one("cameras", {"camera_id": camera_id})
    if camera is None:
        raise HTTPException(status_code=404, detail="Camera not found.")
    last_seen = datetime.now(timezone.utc).isoformat() if status == "ONLINE" else camera.get("last_seen")
    await database.update_one("cameras", {"camera_id": camera_id}, {"status": status, "last_seen": last_seen})
    return {**camera, "status": status, "last_seen": last_seen}


@router.post("/{camera_id}/start")
async def start_camera(camera_id: str, request: Request, user: dict = Depends(require_roles("ADMIN"))):
    return await _set_status(camera_id, "ONLINE", request, user)


@router.post("/{camera_id}/stop")
async def stop_camera(camera_id: str, request: Request, user: dict = Depends(require_roles("ADMIN"))):
    return await _set_status(camera_id, "OFFLINE", request, user)