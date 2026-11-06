from datetime import datetime, timezone
from uuid import uuid4


async def record_audit(database, user, action: str, target: str = "") -> None:
    await database.insert_one("audit_logs", {
        "_id": str(uuid4()),
        "user_id": user.get("_id") if user else None,
        "email": user.get("email") if user else "system",
        "role": user.get("role") if user else "SYSTEM",
        "action": action,
        "target": target,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })