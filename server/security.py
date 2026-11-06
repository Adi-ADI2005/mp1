"""Password hashing, JWT validation, and role-aware user dependencies."""

from __future__ import annotations

import base64
import hashlib
import hmac
import time
from typing import Any
from uuid import uuid4

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pwdlib import PasswordHash

from config import settings
from storage import store


_secret = settings.jwt_secret
password_hash = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def _verify_legacy_pbkdf2(password: str, stored_hash: str) -> bool:
    try:
        scheme, rounds, salt, expected = stored_hash.split("$", 3)
        iterations = int(rounds)
        if scheme != "pbkdf2_sha256" or not 100_000 <= iterations <= 2_000_000:
            return False
        salt_bytes = base64.urlsafe_b64decode(salt + "=" * (-len(salt) % 4))
        actual = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt_bytes, iterations
        )
        encoded = base64.urlsafe_b64encode(actual).rstrip(b"=").decode("ascii")
        return hmac.compare_digest(encoded, expected)
    except (ValueError, TypeError, UnicodeError):
        return False


def verify_password(password: str, stored_hash: str) -> bool:
    if not password or not isinstance(stored_hash, str):
        return False
    if stored_hash.startswith("pbkdf2_sha256$"):
        return _verify_legacy_pbkdf2(password, stored_hash)
    try:
        return password_hash.verify(password, stored_hash)
    except Exception:
        return False


def is_legacy_password_hash(stored_hash: str) -> bool:
    return isinstance(stored_hash, str) and stored_hash.startswith("pbkdf2_sha256$")


def create_access_token(user: dict[str, Any]) -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "sub": str(user.get("id") or user.get("_id")),
            "email": user.get("email", ""),
            "role": user.get("role", "farmer"),
            "type": "access",
            "jti": str(uuid4()),
            "iat": now,
            "exp": now + settings.access_token_expire_minutes * 60,
            "iss": "fishcheck",
        },
        _secret,
        algorithm=settings.jwt_algorithm,
    )


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        claims = jwt.decode(
            token,
            _secret,
            algorithms=[settings.jwt_algorithm],
            options={"verify_aud": False},
        )
        # Missing type/issuer is accepted only for still-valid pre-hardening access
        # tokens; newly issued tokens always include both claims.
        if not claims.get("sub"):
            raise ValueError("missing subject")
        if not isinstance(claims.get("exp"), (int, float)):
            raise ValueError("missing expiry")
        if claims.get("type") not in (None, "access"):
            raise ValueError("wrong token type")
        if claims.get("iss") not in (None, "fishcheck"):
            raise ValueError("wrong issuer")
        return claims
    except (JWTError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None


def normalize_role(role: Any) -> str:
    normalized = str(role or "farmer").strip().upper()
    aliases = {
        "ADMIN": "admin",
        "MARINE_EXPERT": "expert",
        "EXPERT": "expert",
        "FISH_FARMER": "farmer",
        "FARMER": "farmer",
    }
    return aliases.get(normalized, "farmer")


def user_is_active(user: dict[str, Any]) -> bool:
    return user.get("status", "active") == "active" and user.get("is_active", True) is not False


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict[str, Any]:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    claims = decode_access_token(credentials.credentials)
    user_id = str(claims["sub"])
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
    if not user or not user_is_active(user):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Return only operational identity fields; never pass a stored hash to routes.
    return {
        "id": str(user.get("id") or user.get("_id")),
        "name": user.get("name") or user.get("full_name") or "Farm user",
        "email": user.get("email", ""),
        "role": normalize_role(user.get("role")),
        "status": user.get("status", "active"),
        "is_active": user.get("is_active", True),
        "assigned_pools": user.get("assigned_pools") or [],
    }


def require_roles(*roles: str):
    permitted = {normalize_role(role) for role in roles}

    def dependency(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
        if user.get("role") not in permitted:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account does not have access to this action.",
            )
        return user

    return dependency