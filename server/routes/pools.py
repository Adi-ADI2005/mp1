from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request

from ..schemas.entities import PoolInput
from ..utils.audit import record_audit
from ..utils.security import get_current_user, require_roles

router = APIRouter(prefix="/api/pools", tags=["pools"])


@router.get("")
async def list_pools(request: Request, user: dict = Depends(get_current_user)):
    return await request.app.state.database.find_many("pools", sort=("created_at", 1))


@router.post("")
async def create_pool(payload: PoolInput, request: Request, user: dict = Depends(require_roles("ADMIN"))):
    database = request.app.state.database
    code = f"P-{uuid4().hex[:6].upper()}"
    now = datetime.now(timezone.utc).isoformat()
    pool = {
        **payload.model_dump(),
        "_id": str(uuid4()),
        "pool_id": code,
        "camera_ids": [],
        "current_fish_count": 0,
        "average_length_cm": 0,
        "average_weight_g": 0,
        "created_at": now,
        "updated_at": now,
    }
    await database.insert_one("pools", pool)
    await record_audit(database, user, "POOL_CREATED", code)
    return pool


@router.get("/{pool_id}")
async def get_pool(pool_id: str, request: Request, user: dict = Depends(get_current_user)):
    pool = await request.app.state.database.find_one("pools", {"pool_id": pool_id})
    if pool is None:
        raise HTTPException(status_code=404, detail="Pool not found.")
    pool["cameras"] = await request.app.state.database.find_many("cameras", {"pool_id": pool_id})
    return pool


@router.put("/{pool_id}")
async def update_pool(
    pool_id: str, payload: PoolInput, request: Request,
    user: dict = Depends(require_roles("ADMIN")),
):
    database = request.app.state.database
    pool = await database.find_one("pools", {"pool_id": pool_id})
    if pool is None:
        raise HTTPException(status_code=404, detail="Pool not found.")
    fields = {**payload.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat()}
    await database.update_one("pools", {"pool_id": pool_id}, fields)
    await record_audit(database, user, "POOL_UPDATED", pool_id)
    return {**pool, **fields}


@router.delete("/{pool_id}")
async def delete_pool(pool_id: str, request: Request, user: dict = Depends(require_roles("ADMIN"))):
    database = request.app.state.database
    pool = await database.find_one("pools", {"pool_id": pool_id})
    if pool is None:
        raise HTTPException(status_code=404, detail="Pool not found.")
    cameras = await database.find_many("cameras", {"pool_id": pool_id})
    for camera in cameras:
        await database.delete_one("cameras", {"_id": camera["_id"]})
    await database.delete_one("pools", {"pool_id": pool_id})
    await record_audit(database, user, "POOL_DELETED", pool_id)
    return {"message": f"Pool {pool_id} and its cameras were removed."}