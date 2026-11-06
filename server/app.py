"""ASGI application entry point."""

import os

# Load server/.env and validate settings before importing modules that initialize storage.
import config  # noqa: F401
from routes.api import app


if __name__ == "__main__":
    import uvicorn

    backend_port = os.getenv("BACKEND_PORT")
    if not backend_port:
        # Replit reserves PORT for the preview-facing frontend process.
        backend_port = (
            "8000"
            if os.getenv("REPLIT_DEV_DOMAIN")
            else os.getenv("PORT", "8000")
        )

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(backend_port),
        reload=False,
    )