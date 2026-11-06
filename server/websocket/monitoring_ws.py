from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.exceptions import HTTPException

from ..routes.analytics import dashboard_payload
from ..utils.security import decode_access_token
from .manager import manager

router = APIRouter()


async def _authorize(websocket: WebSocket) -> bool:
    protocols = [item.strip() for item in websocket.headers.get("sec-websocket-protocol", "").split(",")]
    auth_protocol = next((item for item in protocols if item.startswith("bearer.")), None)
    if auth_protocol is None:
        await websocket.close(code=1008)
        return None
    try:
        claims = decode_access_token(auth_protocol.removeprefix("bearer."))
        user = await websocket.app.state.database.find_one("users", {"_id": claims.get("sub")})
    except HTTPException:
        user = None
    if user is None:
        await websocket.close(code=1008)
        return None
    return True


async def _monitor(websocket: WebSocket, channel: str, pool_id: str | None = None):
    if not await _authorize(websocket):
        return
    await manager.connect(websocket, channel, "pelagic.monitoring.v1")
    try:
        database = websocket.app.state.database
        if pool_id:
            pool = await database.find_one("pools", {"pool_id": pool_id})
            cameras = await database.find_many("cameras", {"pool_id": pool_id})
            await websocket.send_json({"type": "snapshot", "pool": pool, "cameras": cameras})
        else:
            await websocket.send_json({"type": "snapshot", **await dashboard_payload(database)})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, channel)
    except Exception:
        manager.disconnect(websocket, channel)
        await websocket.close(code=1011)


@router.websocket("/ws/monitoring/global")
async def global_monitor(websocket: WebSocket):
    await _monitor(websocket, "global")


@router.websocket("/ws/monitoring/{pool_id}")
async def pool_monitor(websocket: WebSocket, pool_id: str):
    await _monitor(websocket, f"pool:{pool_id}", pool_id)


@router.websocket("/ws/camera/{camera_id}")
async def camera_monitor(websocket: WebSocket, camera_id: str):
    if not await _authorize(websocket):
        return
    await manager.connect(websocket, f"camera:{camera_id}", "pelagic.monitoring.v1")
    try:
        camera = await websocket.app.state.database.find_one("cameras", {"camera_id": camera_id})
        await websocket.send_json({"type": "camera_status", "camera": camera})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, f"camera:{camera_id}")
    except Exception:
        manager.disconnect(websocket, f"camera:{camera_id}")
        await websocket.close(code=1011)