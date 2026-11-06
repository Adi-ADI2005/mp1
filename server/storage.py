"""Small repository abstraction with explicit MongoDB and demo-memory modes."""

from copy import deepcopy
from datetime import datetime, timezone
from functools import wraps
import logging
from threading import RLock
from uuid import uuid4

from pymongo import ASCENDING, MongoClient
from pymongo.collation import Collation
from pymongo.errors import (
    AutoReconnect,
    ConfigurationError,
    ConnectionFailure,
    DuplicateKeyError,
    NetworkTimeout,
    OperationFailure,
    PyMongoError,
    ServerSelectionTimeoutError,
)

from config import settings


logger = logging.getLogger("fishcheck.storage")
EMAIL_COLLATION = Collation(locale="en", strength=2)


class DatabaseUnavailable(RuntimeError):
    """Raised when an operation requires MongoDB but it is not ready."""


def _mongo_failure_reason(exc):
    """Return actionable diagnostics without ever including a connection URI."""
    if isinstance(exc, ConfigurationError):
        return (
            "Invalid MongoDB configuration. Check MONGODB_URL syntax and URL-encode "
            "reserved characters in the username or password."
        )
    if isinstance(exc, OperationFailure) and getattr(exc, "code", None) == 18:
        return "MongoDB authentication failed. Verify the database user's credentials."
    if isinstance(exc, DuplicateKeyError):
        return (
            "Duplicate records prevent a required unique MongoDB index from being "
            "created. Review duplicate user emails or refresh-token hashes."
        )
    if isinstance(exc, OperationFailure):
        code = getattr(exc, "code", None)
        if code in (85, 86):
            return (
                "A required MongoDB index conflicts with an existing index. "
                "Review index definitions; no data was deleted."
            )
        if code == 13:
            return (
                "MongoDB denied a required operation. Verify the database user's "
                "read/write and index-creation permissions."
            )
    if isinstance(exc, ServerSelectionTimeoutError):
        return (
            "MongoDB connection timed out. Check cluster availability, DNS, and "
            "the Atlas network access/IP allowlist."
        )
    if isinstance(exc, (ConnectionFailure, NetworkTimeout, AutoReconnect)):
        return (
            "MongoDB network connection failed. Check cluster availability and "
            "the Atlas network access/IP allowlist."
        )
    return f"MongoDB initialization failed ({type(exc).__name__}). Check database settings and permissions."


def _guard_storage_operation(method):
    @wraps(method)
    def guarded(self, *args, **kwargs):
        self._require_ready()
        try:
            return method(self, *args, **kwargs)
        except DuplicateKeyError:
            # Application routes use this to return a conflict for duplicate users.
            raise
        except PyMongoError as exc:
            self._mark_unavailable(exc)
            raise DatabaseUnavailable(self.connection_error) from None

    return guarded


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def _demo_data():
    pools = [
        {
            "id": "P1", "pool_id": "P1", "name": "North nursery", "location": "Farm Area A",
            "pool_type": "Nursery", "capacity_l": 42000, "species": "Rohu",
            "fish_count": 1245, "camera_id": "CAM-001", "status": "active",
            "temperature_c": 27.4, "ph": 7.2, "oxygen_mg_l": 6.7,
            "health": "normal", "last_monitoring": now_iso(), "created_at": now_iso(),
        },
        {
            "id": "P2", "pool_id": "P2", "name": "East grow-out", "location": "Farm Area B",
            "pool_type": "Grow-out", "capacity_l": 68000, "species": "Catla",
            "fish_count": 985, "camera_id": "CAM-002", "status": "active",
            "temperature_c": 28.1, "ph": 7.0, "oxygen_mg_l": 5.2,
            "health": "warning", "last_monitoring": now_iso(), "created_at": now_iso(),
        },
        {
            "id": "P3", "pool_id": "P3", "name": "South production", "location": "Farm Area C",
            "pool_type": "Production", "capacity_l": 91000, "species": "Tilapia",
            "fish_count": 1430, "camera_id": "CAM-003", "status": "active",
            "temperature_c": 26.8, "ph": 7.4, "oxygen_mg_l": 6.1,
            "health": "normal", "last_monitoring": now_iso(), "created_at": now_iso(),
        },
        {
            "id": "P4", "pool_id": "P4", "name": "West quarantine", "location": "Farm Area D",
            "pool_type": "Quarantine", "capacity_l": 28000, "species": "Mixed",
            "fish_count": 640, "camera_id": "CAM-004", "status": "active",
            "temperature_c": 25.9, "ph": 6.8, "oxygen_mg_l": 5.8,
            "health": "alert", "last_monitoring": now_iso(), "created_at": now_iso(),
        },
        {
            "id": "P5", "pool_id": "P5", "name": "Central hatchery", "location": "Farm Area E",
            "pool_type": "Hatchery", "capacity_l": 36000, "species": "Mrigal",
            "fish_count": 1820, "camera_id": "CAM-005", "status": "active",
            "temperature_c": 27.1, "ph": 7.1, "oxygen_mg_l": 6.4,
            "health": "normal", "last_monitoring": now_iso(), "created_at": now_iso(),
        },
        {
            "id": "P6", "pool_id": "P6", "name": "Overflow pond", "location": "Farm Area F",
            "pool_type": "Grow-out", "capacity_l": 76000, "species": "Common carp",
            "fish_count": 1110, "camera_id": "CAM-006", "status": "inactive",
            "temperature_c": 26.3, "ph": 7.3, "oxygen_mg_l": 6.0,
            "health": "unknown", "last_monitoring": now_iso(), "created_at": now_iso(),
        },
    ]
    cameras = [
        {
            "id": f"CAM-00{i}", "camera_id": f"CAM-00{i}", "name": f"Pool P{i} camera",
            "pool_id": f"P{i}", "type": "simulated", "status": "offline" if i == 6 else "online",
            "location": f"Pool P{i}", "resolution": "1920 × 1080", "fps": 30,
            "last_active": now_iso(),
        }
        for i in range(1, 7)
    ]
    alerts = [
        {
            "id": "ALT-001", "severity": "high", "title": "Low dissolved oxygen",
            "message": "Oxygen in East grow-out is below the farm’s preferred range.",
            "pool_id": "P2", "created_at": now_iso(), "status": "open",
        },
        {
            "id": "ALT-002", "severity": "medium", "title": "Health review requested",
            "message": "Review the latest observation from West quarantine.",
            "pool_id": "P4", "created_at": now_iso(), "status": "open",
        },
        {
            "id": "ALT-003", "severity": "low", "title": "Camera offline",
            "message": "Overflow pond camera has not reported recently.",
            "pool_id": "P6", "created_at": now_iso(), "status": "open",
        },
    ]
    return {
        "pools": pools, "cameras": cameras, "alerts": alerts, "users": [],
        "refresh_tokens": [],
        "analysis_results": [], "fish": [], "reports": [], "audit_logs": [],
        "fish_detections": [], "fish_tracks": [], "species": [], "disease_detections": [],
        "monitoring_sessions": [], "camera_events": [], "health_alerts": [],
    }


class Store:
    """Storage facade; demo mode is process-local and intentionally non-durable."""

    collections = (
        "users", "refresh_tokens", "pools", "cameras", "fish", "fish_detections", "fish_tracks",
        "species", "disease_detections", "monitoring_sessions", "camera_events",
        "health_alerts", "analysis_results", "reports", "audit_logs", "alerts",
    )

    def __init__(self):
        self._lock = RLock()
        self.mongo_client = None
        self.database = None
        self.configured_mongodb = bool(settings.mongodb_url)
        self.connection_error = None
        self._ready = not self.configured_mongodb
        self.mode = "disconnected" if self.configured_mongodb else "demo"
        self.data = None if self.configured_mongodb else _demo_data()
        if not self.configured_mongodb:
            logger.info("Starting with the in-memory demo store; no MongoDB URI is configured.")

    @property
    def ready(self):
        return self._ready

    def _require_ready(self):
        if not self._ready:
            reason = self.connection_error or "MongoDB initialization has not completed."
            raise DatabaseUnavailable(reason)

    def _mark_unavailable(self, exc):
        self.connection_error = _mongo_failure_reason(exc)
        self._ready = False
        self.mode = "disconnected"
        if self.mongo_client is not None:
            self.mongo_client.close()
            self.mongo_client = None

    def initialize(self):
        """Connect and create required indexes after app startup, never at import time."""
        if not self.configured_mongodb:
            self.mode = "demo"
            self._ready = True
            return True
        if self._ready and self.mode == "mongodb":
            return True

        self.mode = "connecting"
        self.connection_error = None
        try:
            self.mongo_client = MongoClient(
                settings.mongodb_url,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000,
                tz_aware=True,
            )
            self.mongo_client.admin.command("ping")
            self.database = self.mongo_client[settings.database_name]
            self._create_auth_indexes()
        except Exception as exc:
            self._mark_unavailable(exc)
            logger.error("MongoDB initialization failed: %s", self.connection_error)
            return False

        self.mode = "mongodb"
        self._ready = True
        logger.info("MongoDB connected and required indexes initialized: %s", settings.database_name)
        return True

    def _create_auth_indexes(self):
        """Enforce normalized-email uniqueness and expire refresh records in MongoDB."""
        self.database["users"].create_index(
            [("email", ASCENDING)],
            unique=True,
            collation=EMAIL_COLLATION,
            name="users_email_case_insensitive_unique",
        )
        self.database["refresh_tokens"].create_index(
            [("token_hash", ASCENDING)],
            unique=True,
            name="refresh_tokens_hash_unique",
        )
        self.database["refresh_tokens"].create_index(
            [("expires_at", ASCENDING)],
            expireAfterSeconds=0,
            name="refresh_tokens_expiry",
        )
        self.database["pools"].create_index(
            [("facility_id", ASCENDING), ("pool_code", ASCENDING)],
            unique=True,
            name="pools_facility_code_unique",
            partialFilterExpression={
                "facility_id": {"$type": "string"},
                "pool_code": {"$type": "string"},
            },
            collation=EMAIL_COLLATION,
        )

    @_guard_storage_operation
    def find(self, collection, query=None):
        query = query or {}
        if collection not in self.collections:
            raise ValueError(f"Unknown collection: {collection}")
        if self.mode == "mongodb":
            return [
                self._clean(row)
                for row in self.database[collection].find(query, {"_id": 0})
            ]
        with self._lock:
            return deepcopy([
                row for row in self.data[collection]
                if all(row.get(key) == value for key, value in query.items())
            ])

    @_guard_storage_operation
    def find_one(self, collection, query):
        if self.mode == "mongodb":
            options = {"collation": EMAIL_COLLATION} if collection == "users" and "email" in query else {}
            row = self.database[collection].find_one(query, {"_id": 0}, **options)
            return self._clean(row) if row else None
        with self._lock:
            row = next(
                (item for item in self.data[collection]
                 if all(item.get(key) == value for key, value in query.items())),
                None,
            )
            return deepcopy(row) if row else None

    @_guard_storage_operation
    def insert(self, collection, document):
        if collection not in self.collections:
            raise ValueError(f"Unknown collection: {collection}")
        row = deepcopy(document)
        row.setdefault("id", str(uuid4()))
        row.setdefault("created_at", now_iso())
        if self.mode == "mongodb":
            self.database[collection].insert_one(row)
            return self._clean(row)
        with self._lock:
            if collection == "users" and row.get("email"):
                email = str(row["email"]).strip().lower()
                if any(
                    str(existing.get("email", "")).strip().lower() == email
                    for existing in self.data[collection]
                ):
                    raise DuplicateKeyError("A user with this email already exists.")
            self.data[collection].append(row)
        return deepcopy(row)

    @_guard_storage_operation
    def update(self, collection, row_id, updates):
        if self.mode == "mongodb":
            result = self.database[collection].update_one(
                {"id": row_id}, {"$set": deepcopy(updates)}
            )
            return self.find_one(collection, {"id": row_id}) if result.matched_count else None
        with self._lock:
            row = next((item for item in self.data[collection] if item.get("id") == row_id), None)
            if not row:
                return None
            row.update(deepcopy(updates))
            return deepcopy(row)

    @_guard_storage_operation
    def update_if(self, collection, query, updates):
        """Atomically update a matching document, used to rotate refresh tokens once."""
        if self.mode == "mongodb":
            result = self.database[collection].update_one(
                query, {"$set": deepcopy(updates)}
            )
            return result.matched_count > 0
        with self._lock:
            row = next(
                (
                    item for item in self.data[collection]
                    if all(item.get(key) == value for key, value in query.items())
                ),
                None,
            )
            if not row:
                return False
            row.update(deepcopy(updates))
            return True

    @_guard_storage_operation
    def unset_fields(self, collection, row_id, fields):
        if self.mode == "mongodb":
            self.database[collection].update_one(
                {"id": row_id}, {"$unset": {field: "" for field in fields}}
            )
            return
        with self._lock:
            row = next(
                (item for item in self.data[collection] if item.get("id") == row_id),
                None,
            )
            if row:
                for field in fields:
                    row.pop(field, None)

    @_guard_storage_operation
    def delete(self, collection, row_id):
        if self.mode == "mongodb":
            return self.database[collection].delete_one({"id": row_id}).deleted_count > 0
        with self._lock:
            before = len(self.data[collection])
            self.data[collection] = [
                item for item in self.data[collection] if item.get("id") != row_id
            ]
            return len(self.data[collection]) != before

    def close(self):
        if self.mongo_client is not None:
            self.mongo_client.close()
            self.mongo_client = None
        if self.configured_mongodb:
            self._ready = False
            self.mode = "disconnected"

    @staticmethod
    def _clean(row):
        if not row:
            return row
        row.pop("_id", None)
        return row


store = Store()