"""MongoDB adapter with a persistent local JSON store for offline demos."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any


class Database:
    def __init__(self, mongodb_url: str, database_name: str, demo_store_path: Path) -> None:
        self.mongodb_url = mongodb_url
        self.database_name = database_name
        self.demo_store_path = demo_store_path
        self.mongo_client = None
        self.mongo_db = None
        self.mode = "local-demo"
        self._lock = asyncio.Lock()
        self._data: dict[str, list[dict[str, Any]]] = {}

    async def connect(self) -> None:
        if self.mongodb_url:
            try:
                from motor.motor_asyncio import AsyncIOMotorClient
            except ImportError as exc:
                raise RuntimeError("MongoDB is configured, but Motor is not installed.") from exc
            self.mongo_client = AsyncIOMotorClient(
                self.mongodb_url,
                serverSelectionTimeoutMS=4000,
                tz_aware=True,
            )
            await self.mongo_client.admin.command("ping")
            self.mongo_db = self.mongo_client[self.database_name]
            self.mode = "mongodb"
            return
        self.demo_store_path.parent.mkdir(parents=True, exist_ok=True)
        if self.demo_store_path.is_file():
            try:
                self._data = json.loads(self.demo_store_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError) as exc:
                raise RuntimeError(f"Could not read local demo data: {exc}") from exc

    async def close(self) -> None:
        if self.mongo_client is not None:
            self.mongo_client.close()

    def _local_find(self, collection: str, query: dict[str, Any] | None) -> list[dict[str, Any]]:
        documents = self._data.setdefault(collection, [])
        if not query:
            return documents
        return [
            item for item in documents
            if all(item.get(key) == value for key, value in query.items())
        ]

    async def _persist(self) -> None:
        if self.mode != "local-demo":
            return
        async with self._lock:
            self.demo_store_path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.demo_store_path.with_suffix(".tmp")
            temporary.write_text(
                json.dumps(self._data, ensure_ascii=False, indent=2, default=str),
                encoding="utf-8",
            )
            temporary.replace(self.demo_store_path)

    async def find_many(
        self,
        collection: str,
        query: dict[str, Any] | None = None,
        *,
        sort: tuple[str, int] | None = None,
        limit: int = 0,
    ) -> list[dict[str, Any]]:
        if self.mongo_db is not None:
            cursor = self.mongo_db[collection].find(query or {})
            if sort:
                cursor = cursor.sort(sort[0], sort[1])
            if limit:
                cursor = cursor.limit(limit)
            return await cursor.to_list(length=limit or None)
        items = [dict(item) for item in self._local_find(collection, query)]
        if sort:
            items.sort(key=lambda item: item.get(sort[0]) or "", reverse=sort[1] < 0)
        return items[:limit] if limit else items

    async def find_one(self, collection: str, query: dict[str, Any]) -> dict[str, Any] | None:
        if self.mongo_db is not None:
            return await self.mongo_db[collection].find_one(query)
        items = self._local_find(collection, query)
        return dict(items[0]) if items else None

    async def insert_one(self, collection: str, document: dict[str, Any]) -> None:
        if self.mongo_db is not None:
            await self.mongo_db[collection].insert_one(document)
            return
        self._data.setdefault(collection, []).append(dict(document))
        await self._persist()

    async def update_one(
        self,
        collection: str,
        query: dict[str, Any],
        fields: dict[str, Any],
    ) -> bool:
        if self.mongo_db is not None:
            result = await self.mongo_db[collection].update_one(query, {"$set": fields})
            return result.matched_count > 0
        for item in self._local_find(collection, query):
            item.update(fields)
            await self._persist()
            return True
        return False

    async def delete_one(self, collection: str, query: dict[str, Any]) -> bool:
        if self.mongo_db is not None:
            result = await self.mongo_db[collection].delete_one(query)
            return result.deleted_count > 0
        items = self._local_find(collection, query)
        if not items:
            return False
        self._data[collection].remove(items[0])
        await self._persist()
        return True

    async def delete_many(self, collection: str, query: dict[str, Any]) -> int:
        if self.mongo_db is not None:
            result = await self.mongo_db[collection].delete_many(query)
            return result.deleted_count
        items = self._local_find(collection, query)
        for item in list(items):
            self._data[collection].remove(item)
        if items:
            await self._persist()
        return len(items)

    async def count_documents(self, collection: str, query: dict[str, Any] | None = None) -> int:
        if self.mongo_db is not None:
            return await self.mongo_db[collection].count_documents(query or {})
        return len(self._local_find(collection, query))