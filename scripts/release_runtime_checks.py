#!/usr/bin/env python3
"""Authenticated, secret-safe HTTP checks used by release-check.sh."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


BASE_URL = os.environ.get("RELEASE_CHECK_BASE_URL", "http://localhost:8080/api").rstrip("/")
PASS, FAIL, BLOCKED = "PASS", "FAIL", "BLOCKED"
XLSX_SIGNATURE = b"PK\x03\x04"


def request(path: str, *, method: str = "GET", payload: dict | None = None, cookie: str = "") -> tuple[int, bytes, str]:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        f"{BASE_URL}{path}", body, method=method, headers={"Content-Type": "application/json"}
    )
    if cookie:
        req.add_header("Cookie", cookie)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return response.status, response.read(), response.headers.get("Set-Cookie", "")
    except urllib.error.HTTPError as error:
        return error.code, error.read(), error.headers.get("Set-Cookie", "")
    except urllib.error.URLError:
        return 0, b"", ""


def report(state: str, name: str, detail: str = "") -> None:
    suffix = f" — {detail}" if detail else ""
    print(f"{state} {name}{suffix}")


def update_cookie_jar(cookie: str, set_cookie: str) -> str:
    """Apply one Set-Cookie header to the small, single-domain test cookie jar."""
    if not set_cookie or "=" not in set_cookie.split(";", 1)[0]:
        return cookie

    name, value = set_cookie.split(";", 1)[0].split("=", 1)
    jar = {
        item_name.strip(): item_value
        for item in cookie.split(";")
        if "=" in item
        for item_name, item_value in [item.split("=", 1)]
    }
    if not value or "max-age=0" in set_cookie.lower():
        jar.pop(name.strip(), None)
    else:
        jar[name.strip()] = value
    return "; ".join(f"{item_name}={item_value}" for item_name, item_value in jar.items())


def login(email: str, password: str) -> tuple[int, str]:
    status, _, set_cookie = request("/auth/login", method="POST", payload={"email": email, "password": password})
    return status, update_cookie_jar("", set_cookie)


def main() -> int:
    failures = 0
    blocked = 0
    for path in ("/health",):
        status, _, _ = request(path)
        if status == 200:
            report(PASS, f"public route {path}")
        else:
            report(FAIL, f"public route {path}", f"HTTP {status}")
            failures += 1

    invalid_status, _, _ = request("/auth/login", method="POST", payload={"email": "invalid@example.invalid", "password": "invalid"})
    if invalid_status == 401:
        report(PASS, "invalid login")
    else:
        report(FAIL, "invalid login", f"HTTP {invalid_status}")
        failures += 1

    email = os.environ.get("RELEASE_CHECK_ADMIN_EMAIL", "")
    password = os.environ.get("RELEASE_CHECK_ADMIN_PASSWORD", "")
    if not email or not password:
        report(BLOCKED, "authenticated checks", "set RELEASE_CHECK_ADMIN_EMAIL and RELEASE_CHECK_ADMIN_PASSWORD")
        return 10

    status, cookie = login(email, password)
    if status != 200 or not cookie:
        report(BLOCKED, "authenticated checks", "configured release credential was not accepted")
        return 10
    report(PASS, "successful login")

    me, _, _ = request("/auth/me", cookie=cookie)
    if me != 200:
        report(FAIL, "session refresh", f"HTTP {me}")
        failures += 1
    else:
        report(PASS, "session refresh")
    logout, _, logout_set_cookie = request("/auth/logout", method="POST", cookie=cookie)
    cookie = update_cookie_jar(cookie, logout_set_cookie)
    after_logout, _, _ = request("/auth/me", cookie=cookie)
    if logout == 200 and after_logout == 401:
        report(PASS, "logout")
    else:
        report(FAIL, "logout", f"logout={logout}, auth/me={after_logout}")
        failures += 1

    status, cookie = login(email, password)
    if status != 200:
        report(FAIL, "re-login for export checks", f"HTTP {status}")
        return 1
    for name, path, signature in (
        ("CSV export", "/calls/export?format=csv", b"ID,Filename"),
        ("XLSX export", "/calls/export?format=xlsx", XLSX_SIGNATURE),
    ):
        export_status, body, _ = request(path, cookie=cookie)
        if export_status == 200 and signature in body[:4096]:
            report(PASS, name)
        else:
            report(FAIL, name, f"HTTP {export_status}")
            failures += 1

    provider_status, provider_body, _ = request("/settings/llm/providers", cookie=cookie)
    try:
        providers = json.loads(provider_body or b"{}") if provider_status == 200 else {}
    except json.JSONDecodeError:
        providers = {}
    configured = any(item.get("is_active") and item.get("api_key_configured") for item in providers.get("items", []))
    if configured:
        report(PASS, "real LLM provider detected", "real QA smoke is enabled for an approved fixture")
    else:
        report(BLOCKED, "real LLM smoke", "no active provider with a configured key")
        blocked += 1

    # Temporary user creation is deliberately opt-in: it mutates the connected database.
    if os.environ.get("RELEASE_CHECK_ALLOW_MUTATIONS", "false").lower() not in {"1", "true", "yes"}:
        report(BLOCKED, "five-role permissions", "set RELEASE_CHECK_ALLOW_MUTATIONS=true for disposable test data")
        blocked += 1
    else:
        import secrets
        created: list[int] = []
        role_failures = 0
        try:
            for role in ("manager", "supervisor", "agent", "viewer"):
                test_email = f"release-check-{role}-{secrets.token_hex(4)}@example.invalid"
                temporary_password = secrets.token_urlsafe(18)
                create_status, create_body, _ = request(
                    "/settings/users", method="POST", cookie=cookie,
                    payload={"email": test_email, "password": temporary_password, "role": role, "team": "release-check", "agent_name": f"release-{role}"},
                )
                if create_status != 200:
                    role_failures += 1
                    continue
                created.append(json.loads(create_body)["user"]["id"])
                login_status, role_cookie = login(test_email, temporary_password)
                calls, _, _ = request("/calls", cookie=role_cookie)
                users, _, _ = request("/settings/users", cookie=role_cookie)
                if login_status != 200 or calls != 200 or users != 403:
                    role_failures += 1
            if role_failures:
                report(FAIL, "five-role permissions", f"{role_failures} role checks failed")
                failures += 1
            else:
                report(PASS, "five-role permissions")
        finally:
            for user_id in created:
                request(f"/settings/users/{user_id}/deactivate", method="PATCH", payload={}, cookie=cookie)

    return 1 if failures else (10 if blocked else 0)


if __name__ == "__main__":
    raise SystemExit(main())
