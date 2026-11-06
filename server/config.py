"""Application configuration loaded from environment variables and server/.env."""

from __future__ import annotations

import os
import secrets
from pathlib import Path
from urllib.parse import urlsplit
from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent


load_dotenv(BASE_DIR / ".env")


class Settings:
    """One validated source of configuration for the backend."""

    def __init__(self) -> None:
        self.environment = os.getenv("ENVIRONMENT", "development").strip().lower()
        if self.environment not in {"development", "production", "test"}:
            raise RuntimeError("ENVIRONMENT must be development, test, or production.")

        demo_default = "false" if self.environment == "production" else "true"
        self.demo_mode = os.getenv("DEMO_MODE", demo_default).strip().lower() in {
            "1", "true", "yes",
        }
        self.allow_demo_auth = (
            self.demo_mode
            and os.getenv("ALLOW_DEMO_AUTH", "true").strip().lower() in {"1", "true", "yes"}
        )
        self.mongodb_url = os.getenv("MONGODB_URL", "").strip()
        self.database_name = os.getenv("DATABASE_NAME", "fish_monitoring").strip()
        if self.environment == "production" and self.demo_mode:
            raise RuntimeError("Production must run with DEMO_MODE=false.")
        if self.environment == "production" and self.allow_demo_auth:
            raise RuntimeError("Production must disable demo sign-in with ALLOW_DEMO_AUTH=false.")
        if not self.demo_mode and not self.mongodb_url:
            raise RuntimeError("DEMO_MODE=false requires MONGODB_URL.")

        configured_jwt_secret = os.getenv("JWT_SECRET", "").strip()
        if self.environment == "production":
            if len(configured_jwt_secret) < 32:
                raise RuntimeError("Production requires a strong JWT_SECRET of at least 32 characters.")
            if not self.mongodb_url:
                raise RuntimeError("Production requires MONGODB_URL.")
            self.jwt_secret = configured_jwt_secret
        else:
            self.jwt_secret = (
                configured_jwt_secret
                or os.getenv("SESSION_SECRET", "").strip()
                or secrets.token_urlsafe(48)
            )

        self.jwt_algorithm = os.getenv("JWT_ALGORITHM", "HS256").strip().upper()
        if self.jwt_algorithm != "HS256":
            raise RuntimeError("JWT_ALGORITHM must be HS256.")
        self.access_token_expire_minutes = int(
            os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30")
        )
        self.refresh_token_expire_days = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
        if not 1 <= self.access_token_expire_minutes <= 1440:
            raise RuntimeError("ACCESS_TOKEN_EXPIRE_MINUTES must be between 1 and 1440.")
        if not 1 <= self.refresh_token_expire_days <= 30:
            raise RuntimeError("REFRESH_TOKEN_EXPIRE_DAYS must be between 1 and 30.")
        if self.environment == "production" and self.access_token_expire_minutes > 60:
            raise RuntimeError("Production access tokens must expire within 60 minutes.")

        self.frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173").strip().rstrip("/")
        configured_origins = os.getenv("CORS_ORIGINS")
        self.cors_origins = [
            origin.strip().rstrip("/")
            for origin in (configured_origins or self.frontend_url).split(",")
            if origin.strip()
        ]
        if self.environment != "production":
            if not configured_origins:
                self.cors_origins.extend([
                    "http://localhost:5000",
                    "http://127.0.0.1:5000",
                    "http://localhost:5173",
                    "http://127.0.0.1:5173",
                ])
            replit_dev_domain = os.getenv("REPLIT_DEV_DOMAIN", "").strip().rstrip("/")
            if replit_dev_domain:
                replit_dev_origin = (
                    replit_dev_domain
                    if "://" in replit_dev_domain
                    else f"https://{replit_dev_domain}"
                )
                self.cors_origins.append(replit_dev_origin)
        self.cors_origins = list(dict.fromkeys(self.cors_origins))
        if not self.cors_origins or "*" in self.cors_origins:
            raise RuntimeError("Configure explicit CORS_ORIGINS; wildcard origins are not allowed.")
        if self.environment == "production":
            if any(urlsplit(origin).scheme != "https" for origin in self.cors_origins):
                raise RuntimeError("Production CORS origins must use HTTPS.")

        self.admin_email = os.getenv("ADMIN_EMAIL", "").strip().lower()
        self.admin_password = os.getenv("ADMIN_PASSWORD", "")
        if bool(self.admin_email) != bool(self.admin_password):
            raise RuntimeError(
                "Set both ADMIN_EMAIL and ADMIN_PASSWORD to seed an initial administrator."
            )

        self.max_upload_size = int(os.getenv("MAX_UPLOAD_SIZE", str(10 * 1024 * 1024)))
        if self.max_upload_size < 1:
            raise RuntimeError("MAX_UPLOAD_SIZE must be a positive number of bytes.")
        self.upload_dir = Path(os.getenv("UPLOAD_DIR", str(BASE_DIR / "uploads")))
        self.report_dir = Path(os.getenv("REPORT_DIR", str(BASE_DIR / "reports")))
        self.demo_store_path = Path(
            os.getenv("DEMO_STORE_PATH", str(BASE_DIR / "data" / "demo_store.json"))
        )
        self.model_dir = Path(os.getenv("MODEL_DIR", str(BASE_DIR / "ml" / "models")))
        configured_detection_model = os.getenv("FISH_DETECTION_MODEL", "").strip()
        if configured_detection_model:
            detection_path = Path(configured_detection_model)
            if not detection_path.is_absolute():
                detection_path = (
                    PROJECT_DIR / detection_path
                    if detection_path.parts and detection_path.parts[0] == BASE_DIR.name
                    else BASE_DIR / detection_path
                )
            self.detection_model = detection_path.resolve()
        else:
            self.detection_model = (
                self.model_dir / "detection" / "fish_detection.pt"
            ).resolve()
        self.species_model = Path(
            os.getenv(
                "SPECIES_MODEL",
                str(PROJECT_DIR / "models" / "species" / "best_fish_efficientnet_b0.pth"),
            )
        )
        self.disease_model = Path(
            os.getenv(
                "DISEASE_MODEL",
                str(PROJECT_DIR / "models" / "disease" / "best_fish_disease_efficientnet_b0.pth"),
            )
        )
        self.model_provider = os.getenv("MODEL_PROVIDER", "demo").strip().lower()


settings = Settings()