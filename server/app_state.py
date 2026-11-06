"""Shared reference to the active database for FastAPI dependencies."""

from contextvars import ContextVar

current_database = ContextVar("current_database", default=None)