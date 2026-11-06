"""Authentication workflows shared by the HTTP routes."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import secrets
from threading import Lock
from time import monotonic
from uuid import uuid4

from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

from config import settings
from security import (
    hash_password,
    is_legacy_password_hash,
    normalize_role,
    user_is_active,
    verify_password,
)
from storage import now_iso, store


class LoginRateLimiter:
    """Per-process sliding window; deployments with multiple workers should use shared storage."""

    def __init__(self, window_seconds: int = 900, email_limit: int = 5, ip_limit: int = 30):
        self.window_seconds = window_seconds
        self.email_limit = email_limit
        self.ip_limit = ip_limit
        self._attempts: dict[str, list[float]] = {}
        self._lock = Lock()

    def _live(self, key: str, now: float) -> list[float]:
        recent = [
            attempt for attempt in self._attempts.get(key, [])
            if now - attempt < self.window_seconds
        ]
        if recent:
            self._attempts[key] = recent
        else:
            self._attempts.pop(key, None)
        return recent

    def check(self, ip: str, email: str) -> None:
        now = monotonic()
        with self._lock:
            email_attempts = self._live(f"email:{email}", now)
            ip_attempts = self._live(f"ip:{ip}", now)
            if len(email_attempts) >= self.email_limit or len(ip_attempts) >= self.ip_limit:
                raise HTTPException(
                    status_code=429,
                    detail="Too many login attempts. Please try again later.",
                    headers={"Retry-After": str(self.window_seconds)},
                )

    def failed(self, ip: str, email: str) -> None:
        now = monotonic()
        with self._lock:
            for key in (f"email:{email}", f"ip:{ip}"):
                self._live(key, now)
                self._attempts.setdefault(key, []).append(now)

    def succeeded(self, email: str) -> None:
        with self._lock:
            self._attempts.pop(f"email:{email}", None)


login_rate_limiter = LoginRateLimiter()


def public_user(user: dict) -> dict:
    return {
        "id": str(user.get("id") or user.get("_id")),
        "name": user.get("name") or user.get("full_name") or "Farm user",
        "email": user.get("email", ""),
        "role": normalize_role(user.get("role")),
        "status": user.get("status", "active"),
        "is_active": user.get("is_active", True),
        "assigned_pools": user.get("assigned_pools") or [],
    }


def _audit(action: str, user: dict | None, ip: str) -> None:
    store.insert("audit_logs", {
        "id": str(uuid4()),
        "user_id": (user or {}).get("id") or (user or {}).get("_id"),
        "action": action,
        "ip": ip or "unknown",
        "timestamp": now_iso(),
    })


def _active_user_by_id(user_id: str) -> dict | None:
    if user_id == "demo-admin" and store.mode == "demo":
        return {
            "id": "demo-admin",
            "name": "Alex Morgan",
            "email": "demo@fishcheck.local",
            "role": "admin",
            "status": "active",
            "assigned_pools": [],
        }
    user = store.find_one("users", {"id": user_id})
    if user is None:
        user = store.find_one("users", {"_id": user_id})
    return user


def register_user(name: str, email: str, password: str, ip: str) -> dict:
    email = email.strip().lower()
    if store.find_one("users", {"email": email}):
        raise HTTPException(status_code=409, detail="This email is already registered.")

    user = {
        "id": str(uuid4()),
        "name": name.strip(),
        "email": email,
        "password_hash": hash_password(password),
        "role": "farmer",
        "status": "active",
        "is_active": True,
        "is_verified": False,
        "assigned_pools": [],
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "last_login": None,
    }
    try:
        store.insert("users", user)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="This email is already registered.") from None
    _audit("REGISTER_SUCCESS", user, ip)
    return public_user(user)


def login_user(email: str, password: str, ip: str) -> dict:
    email = email.strip().lower()
    login_rate_limiter.check(ip, email)
    user = store.find_one("users", {"email": email})
    stored_hash = (
        (user or {}).get("password_hash")
        or (user or {}).get("hashed_password")
        or ""
    )
    password_matches = bool(user and verify_password(password, stored_hash))

    if not user or not password_matches or not user_is_active(user):
        _audit("LOGIN_FAILED", user if password_matches else None, ip)
        if user and password_matches and not user_is_active(user):
            _audit("ACCOUNT_DISABLED", user, ip)
        login_rate_limiter.failed(ip, email)
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    user_id = str(user.get("id") or user.get("_id"))
    updates = {"last_login": now_iso(), "updated_at": now_iso()}
    if is_legacy_password_hash(stored_hash):
        updates["password_hash"] = hash_password(password)
    store.update_if("users", {"id": user_id}, updates)
    if is_legacy_password_hash(stored_hash):
        store.unset_fields("users", user_id, ["hashed_password"])
        user["password_hash"] = updates["password_hash"]
        user.pop("hashed_password", None)
    user.update(updates)
    login_rate_limiter.succeeded(email)
    _audit("LOGIN_SUCCESS", user, ip)
    return public_user(user)


def issue_refresh_token(user: dict) -> tuple[str, datetime]:
    raw_token = secrets.token_urlsafe(48)
    expires_at = datetime.now(timezone.utc) + timedelta(
        days=settings.refresh_token_expire_days
    )
    store.insert("refresh_tokens", {
        "id": str(uuid4()),
        "user_id": str(user.get("id") or user.get("_id")),
        "token_hash": hashlib.sha256(raw_token.encode("utf-8")).hexdigest(),
        "created_at": now_iso(),
        "expires_at": expires_at,
        "revoked": False,
    })
    return raw_token, expires_at


def rotate_refresh_token(raw_token: str, ip: str) -> tuple[dict, str, datetime] | None:
    if not raw_token:
        return None
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    record = store.find_one("refresh_tokens", {"token_hash": token_hash})
    if not record or record.get("revoked"):
        return None

    expires_at = record.get("expires_at")
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at)
        except ValueError:
            return None
    if not isinstance(expires_at, datetime):
        return None
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        return None

    user = _active_user_by_id(str(record.get("user_id", "")))
    if not user or not user_is_active(user):
        store.update_if(
            "refresh_tokens",
            {"id": record.get("id"), "revoked": False},
            {"revoked": True, "revoked_at": now_iso()},
        )
        return None

    revoked = store.update_if(
        "refresh_tokens",
        {"id": record.get("id"), "revoked": False},
        {"revoked": True, "revoked_at": now_iso()},
    )
    if not revoked:
        return None
    replacement, replacement_expiry = issue_refresh_token(user)
    _audit("TOKEN_REFRESH", user, ip)
    return public_user(user), replacement, replacement_expiry


def revoke_refresh_token(raw_token: str, ip: str) -> dict | None:
    if not raw_token:
        return None
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    record = store.find_one("refresh_tokens", {"token_hash": token_hash})
    if not record or record.get("revoked"):
        return None
    revoked = store.update_if(
        "refresh_tokens",
        {"id": record.get("id"), "revoked": False},
        {"revoked": True, "revoked_at": now_iso()},
    )
    user = _active_user_by_id(str(record.get("user_id", ""))) if revoked else None
    if user:
        _audit("LOGOUT", user, ip)
    return public_user(user) if user else None


def demo_user() -> dict:
    return {
        "id": "demo-admin",
        "name": "Alex Morgan",
        "email": "demo@fishcheck.local",
        "role": "admin",
        "status": "active",
        "is_active": True,
        "assigned_pools": [],
    }


def seed_initial_admin() -> None:
    """Create an administrator only when both bootstrap values are configured."""
    if not settings.admin_email:
        return
    if store.find_one("users", {"email": settings.admin_email}):
        return
    password = settings.admin_password
    if (
        len(password) < 12
        or not any(char.islower() for char in password)
        or not any(char.isupper() for char in password)
        or not any(char.isdigit() for char in password)
    ):
        raise RuntimeError(
            "ADMIN_PASSWORD must be at least 12 characters with uppercase, lowercase, and numeric characters."
        )
    user = {
        "id": str(uuid4()),
        "name": "Farm Administrator",
        "email": settings.admin_email,
        "password_hash": hash_password(password),
        "role": "admin",
        "status": "active",
        "is_active": True,
        "is_verified": True,
        "assigned_pools": [],
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "last_login": None,
    }
    try:
        store.insert("users", user)
    except DuplicateKeyError:
        # Another application instance may have completed the same first-run seed.
        return
    _audit("ADMIN_BOOTSTRAPPED", user, "system")