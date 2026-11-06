"""Seed a small, clearly identified demo farm in an empty database."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from ..config import settings
from ..utils.security import hash_password


def _id() -> str:
    return str(uuid4())


async def seed_database(database) -> None:
    if not settings.demo_mode:
        return
    now = datetime.now(timezone.utc)
    if await database.count_documents("users") == 0:
        await database.insert_one("users", {
            "_id": _id(),
            "full_name": "Demo Farm Administrator",
            "email": "admin@fishcheck.demo",
            "password_hash": hash_password("demo-access"),
            "role": "ADMIN",
            "created_at": now.isoformat(),
        })

    if await database.count_documents("pools") == 0:
        pools = [
            ("P1", "North nursery", "Farm area A", "Rohu", 2000, 1245, 32.5, 520),
            ("P2", "Tilapia grow-out", "Farm area B", "Tilapia", 1800, 983, 28.4, 410),
            ("P3", "Carp production", "Farm area C", "Common Carp", 2400, 1456, 35.1, 610),
            ("P4", "Quarantine pond", "Farm area D", "Mrigal", 900, 870, 21.2, 360),
        ]
        for pool_id, name, location, species, capacity, count, length, weight in pools:
            await database.insert_one("pools", {
                "_id": _id(),
                "pool_id": pool_id,
                "pool_name": name,
                "location": location,
                "description": "Sample data for the FishCheck demo farm.",
                "capacity": capacity,
                "water_volume": capacity * 0.9,
                "species": species,
                "camera_ids": [],
                "status": "ACTIVE",
                "current_fish_count": count,
                "average_length_cm": length,
                "average_weight_g": weight,
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
                "is_demo": True,
            })

    if await database.count_documents("cameras") == 0:
        pools = await database.find_many("pools")
        statuses = ["ONLINE", "ONLINE", "ONLINE", "OFFLINE"]
        for index, pool in enumerate(pools):
            camera_id = f"CAM-{index + 1:03d}"
            await database.insert_one("cameras", {
                "_id": _id(),
                "camera_id": camera_id,
                "camera_name": f"{pool['pool_id']} overhead",
                "pool_id": pool["pool_id"],
                "camera_type": "Simulation",
                "camera_url": "",
                "status": statuses[index],
                "resolution": "1920x1080",
                "fps": 25,
                "location": pool["location"],
                "last_seen": now.isoformat(),
                "created_at": now.isoformat(),
                "is_demo": True,
            })
            pool["camera_ids"] = [camera_id]
            await database.update_one("pools", {"_id": pool["_id"]}, {"camera_ids": [camera_id]})

    if await database.count_documents("health_alerts") == 0:
        alerts = [
            ("DISEASE", "P4", "CAM-004", "Review recent quarantine-pool screening.", "MEDIUM"),
            ("CAMERA", "P4", "CAM-004", "Camera CAM-004 is offline.", "LOW"),
            ("INFO", "P1", "CAM-001", "Demo farm is ready for image analysis.", "LOW"),
        ]
        for kind, pool_id, camera_id, message, severity in alerts:
            await database.insert_one("health_alerts", {
                "_id": _id(),
                "alert_id": str(uuid4()),
                "type": kind,
                "pool_id": pool_id,
                "camera_id": camera_id,
                "message": message,
                "severity": severity,
                "is_read": False,
                "is_demo": True,
                "created_at": now.isoformat(),
            })

    if await database.count_documents("analysis_results") == 0:
        for offset, (pool_id, fish_count, species, disease) in enumerate([
            ("P1", 1180, "Rohu", "Healthy"),
            ("P2", 950, "Tilapia", "Healthy"),
            ("P3", 1408, "Common Carp", "Fin Rot"),
            ("P4", 842, "Mrigal", "Healthy"),
        ]):
            pool = await database.find_one("pools", {"pool_id": pool_id})
            await database.insert_one("analysis_results", {
                "_id": _id(),
                "pool_id": pool_id,
                "camera_id": pool["camera_ids"][0] if pool and pool.get("camera_ids") else "",
                "created_at": (now - timedelta(days=offset + 1)).isoformat(),
                "provider_mode": "DEMO_MODEL",
                "fish_count": fish_count,
                "species_distribution": [{"name": species, "count": fish_count}],
                "disease_distribution": [{"name": disease, "count": 1}],
                "summary": {
                    "average_length_cm": (pool or {}).get("average_length_cm", 30),
                    "average_weight_g": (pool or {}).get("average_weight_g", 450),
                    "estimated_biomass_kg": round(fish_count * (pool or {}).get("average_weight_g", 450) / 1000, 1),
                    "healthy_count": fish_count - (1 if disease != "Healthy" else 0),
                    "disease_count": 1 if disease != "Healthy" else 0,
                },
                "is_sample": True,
            })