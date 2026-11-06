from fastapi import APIRouter, Depends, Request

from ..utils.security import require_roles

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("")
async def list_users(request: Request, user: dict = Depends(require_roles("ADMIN"))):
    users = await request.app.state.database.find_many("users", sort=("created_at", -1))
    return [
        {"id": item["_id"], "full_name": item["full_name"], "email": item["email"], "role": item["role"], "created_at": item["created_at"]}
        for item in users
    ]