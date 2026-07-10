#!/usr/bin/env python3
"""Validate security-critical API environment settings before startup."""

from __future__ import annotations

import os
import sys

PROTECTED_ENVIRONMENTS = {"production", "prod"}
TRUE_VALUES = {"1", "true", "yes", "on"}
UNSAFE_SESSION_SECRETS = {
    "",
    "dev-session-secret-change-me",
    "change-me-random-secret",
    "replace-with-at-least-32-random-characters",
    "changeme",
    "secret",
}
UNSAFE_ADMIN_PASSWORDS = {
    "",
    "admin-password",
    "admin-password-change-me",
    "replace-with-unique-password-2026",
    "changeme",
}


def validate_api_environment(environ: dict[str, str] | None = None) -> None:
    env = environ if environ is not None else os.environ
    app_env = env.get("APP_ENV", "development").strip().lower()
    if app_env == "pilot":
        raise RuntimeError(
            "APP_ENV=pilot does not enable Secure session cookies. Use APP_ENV=production "
            "for any HTTPS buyer-facing pilot."
        )
    if app_env not in PROTECTED_ENVIRONMENTS:
        return

    if env.get("REQUIRE_AUTH", "true").strip().lower() not in TRUE_VALUES:
        raise RuntimeError("REQUIRE_AUTH must be true in production")

    session_secret = env.get("SESSION_SECRET", "").strip()
    if session_secret.lower() in UNSAFE_SESSION_SECRETS or len(session_secret) < 32:
        raise RuntimeError("SESSION_SECRET must be a unique high-entropy value of at least 32 characters")

    admin_email = env.get("ADMIN_EMAIL", "").strip()
    admin_password = env.get("ADMIN_PASSWORD", "").strip()
    if bool(admin_email) != bool(admin_password):
        raise RuntimeError("ADMIN_EMAIL and ADMIN_PASSWORD must be configured together")
    if admin_email and "@" not in admin_email:
        raise RuntimeError("ADMIN_EMAIL must be a valid email address")
    if admin_password and (admin_password.lower() in UNSAFE_ADMIN_PASSWORDS or len(admin_password) < 12):
        raise RuntimeError("ADMIN_PASSWORD must be a unique value of at least 12 characters")

    cors_origins = [item.strip() for item in env.get("CORS_ORIGINS", "").split(",") if item.strip()]
    if not cors_origins or "*" in cors_origins:
        raise RuntimeError("CORS_ORIGINS must contain explicit trusted origins in production")
    if any(not origin.startswith("https://") for origin in cors_origins):
        raise RuntimeError("Every production CORS origin must use https://")


def main() -> int:
    try:
        validate_api_environment()
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
