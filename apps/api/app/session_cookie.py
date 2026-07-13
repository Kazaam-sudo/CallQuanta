from __future__ import annotations

from typing import Protocol


class CookieResponse(Protocol):
    def set_cookie(self, key: str, value: str = "", **kwargs) -> None: ...
    def delete_cookie(self, key: str, **kwargs) -> None: ...


def session_cookie_options(app_env: str, ttl_seconds: int) -> dict:
    return {
        "max_age": ttl_seconds,
        "httponly": True,
        "secure": app_env.strip().lower() in {"production", "prod"},
        "samesite": "lax",
        "path": "/",
    }


def set_session_cookie(
    response: CookieResponse,
    name: str,
    token: str,
    *,
    app_env: str,
    ttl_seconds: int,
) -> None:
    response.set_cookie(
        name,
        token,
        **session_cookie_options(app_env, ttl_seconds),
    )


def clear_session_cookie(response: CookieResponse, name: str, *, app_env: str) -> None:
    response.delete_cookie(
        name,
        path="/",
        secure=app_env.strip().lower() in {"production", "prod"},
        httponly=True,
        samesite="lax",
    )
