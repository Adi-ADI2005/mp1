"""Authentication endpoints for the FishCheck API."""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials

from config import settings
from schemas.auth import LoginInput, RegistrationInput
from security import create_access_token, get_current_user
from storage import store
from services.auth_service import (
    _audit,
    demo_user,
    issue_refresh_token,
    login_user,
    public_user,
    register_user,
    revoke_refresh_token,
    rotate_refresh_token,
)


router = APIRouter(prefix="/api/auth", tags=["authentication"])
REFRESH_COOKIE = "fishcheck_refresh"
REFRESH_COOKIE_PATH = "/api/auth"


def _client_ip(request: Request) -> str:
    # Use the direct peer address; do not trust a client-supplied X-Forwarded-For.
    return request.client.host if request.client else "unknown"


def _require_same_site_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") not in settings.cors_origins:
        raise HTTPException(status_code=403, detail="This request origin is not allowed.")


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=token,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.environment == "production",
        samesite="none" if settings.environment == "production" else "lax",
        path=REFRESH_COOKIE_PATH,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=REFRESH_COOKIE,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.environment == "production",
        samesite="none" if settings.environment == "production" else "lax",
    )


def _user_from_bearer(request: Request) -> dict | None:
    value = request.headers.get("authorization", "")
    scheme, _, token = value.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    try:
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer", credentials=token.strip()
        )
        return get_current_user(request, credentials)
    except HTTPException:
        return None


@router.get("/health")
def auth_health():
    return {
        "status": "ok",
        "access_tokens_configured": bool(settings.jwt_secret),
        "refresh_tokens_enabled": True,
        "refresh_cookie_http_only": True,
        "environment": settings.environment,
    }


@router.post("/register", status_code=201)
def register(payload: RegistrationInput, request: Request):
    user = register_user(payload.name, payload.email, payload.password, _client_ip(request))
    return {
        "success": True,
        "message": "Account created successfully. Please log in.",
        "user": user,
    }


@router.post("/login")
def login(payload: LoginInput, request: Request, response: Response):
    user = login_user(payload.email, payload.password, _client_ip(request))
    refresh_token, _ = issue_refresh_token(user)
    _set_refresh_cookie(response, refresh_token)
    return {
        "access_token": create_access_token(user),
        "token_type": "bearer",
        "expires_in": settings.access_token_expire_minutes * 60,
        "user": user,
    }


@router.post("/demo")
def demo_login(request: Request, response: Response):
    if not settings.allow_demo_auth or store.mode != "demo":
        raise HTTPException(status_code=404, detail="Demo sign-in is disabled.")
    user = demo_user()
    _audit("DEMO_SIGN_IN", user, _client_ip(request))
    refresh_token, _ = issue_refresh_token(user)
    _set_refresh_cookie(response, refresh_token)
    return {
        "access_token": create_access_token(user),
        "token_type": "bearer",
        "expires_in": settings.access_token_expire_minutes * 60,
        "user": user,
    }


@router.post("/refresh")
def refresh(request: Request, response: Response):
    _require_same_site_origin(request)
    ip = _client_ip(request)
    rotated = rotate_refresh_token(request.cookies.get(REFRESH_COOKIE, ""), ip)
    if rotated:
        user, refresh_token, _ = rotated
    else:
        # One-time bridge for valid access tokens issued before refresh cookies existed.
        user = _user_from_bearer(request)
        if user is None:
            anonymous = JSONResponse(
                status_code=200,
                content={
                    "authenticated": False,
                },
            )
            _clear_refresh_cookie(anonymous)
            return anonymous
        refresh_token, _ = issue_refresh_token(user)

    _set_refresh_cookie(response, refresh_token)
    return {
        "access_token": create_access_token(user),
        "token_type": "bearer",
        "expires_in": settings.access_token_expire_minutes * 60,
        "user": user,
    }


@router.post("/logout")
def logout(request: Request, response: Response):
    _require_same_site_origin(request)
    user = revoke_refresh_token(
        request.cookies.get(REFRESH_COOKIE, ""),
        _client_ip(request),
    )
    if user is None:
        current_user = _user_from_bearer(request)
        if current_user:
            _audit("LOGOUT", current_user, _client_ip(request))
    _clear_refresh_cookie(response)
    return {"success": True, "message": "Logged out successfully."}


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return public_user(user)