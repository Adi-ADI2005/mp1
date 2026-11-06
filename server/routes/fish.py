from fastapi import APIRouter, Depends, HTTPException, Request

from ..utils.security import get_current_user

router = APIRouter(prefix="/api/fish", tags=["fish"])


@router.get("")
async def list_fish(request: Request, user: dict = Depends(get_current_user)):
    return await request.app.state.database.find_many("fish", sort=("last_detected", -1), limit=500)


@router.get("/pool/{pool_id}")
async def fish_in_pool(pool_id: str, request: Request, user: dict = Depends(get_current_user)):
    return await request.app.state.database.find_many(
        "fish", {"pool_id": pool_id}, sort=("last_detected", -1), limit=500
    )


@router.get("/{fish_id}")
async def fish_details(fish_id: str, request: Request, user: dict = Depends(get_current_user)):
    database = request.app.state.database
    fish = await database.find_one("fish", {"fish_id": fish_id})
    if fish is None:
        raise HTTPException(status_code=404, detail="Fish record not found.")
    history = await database.find_many(
        "fish_detections", {"pool_id": fish["pool_id"]}, sort=("created_at", -1), limit=100
    )
    fish["detection_history"] = [
        {"created_at": event["created_at"], "camera_id": event["camera_id"], "analysis_id": event.get("analysis_id")}
        for event in history
        if any(item.get("fish_id") == fish_id for item in event.get("detections", []))
    ]
    return fish