from fastapi import APIRouter, Depends, HTTPException, Request

from ..utils.audit import record_audit
from ..utils.security import get_current_user

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("")
async def list_alerts(request: Request, user: dict = Depends(get_current_user)):
    return await request.app.state.database.find_many("health_alerts", sort=("created_at", -1))


@router.post("/{alert_id}/read")
async def mark_read(alert_id: str, request: Request, user: dict = Depends(get_current_user)):
    database = request.app.state.database
    alert = await database.find_one("health_alerts", {"alert_id": alert_id})
    if alert is None:
        alert = await database.find_one("health_alerts", {"_id": alert_id})
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found.")
    await database.update_one("health_alerts", {"_id": alert["_id"]}, {"is_read": True})
    await record_audit(database, user, "ALERT_READ", alert_id)
    return {"message": "Alert marked as read."}