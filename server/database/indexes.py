"""MongoDB indexes for frequently queried farm records."""

async def create_indexes(database) -> None:
    if database.mongo_db is None:
        return
    definitions = {
        "users": [("email", 1)],
        "pools": [("pool_id", 1)],
        "cameras": [("camera_id", 1), ("pool_id", 1)],
        "fish": [("fish_id", 1), ("pool_id", 1)],
        "fish_detections": [("pool_id", 1), ("camera_id", 1), ("created_at", -1)],
        "disease_detections": [("pool_id", 1), ("created_at", -1)],
        "analysis_results": [("created_at", -1), ("pool_id", 1)],
        "health_alerts": [("created_at", -1), ("is_read", 1)],
        "reports": [("created_at", -1)],
    }
    for collection, indexes in definitions.items():
        for field, direction in indexes:
            await database.mongo_db[collection].create_index([(field, direction)])