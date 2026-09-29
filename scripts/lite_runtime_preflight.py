#!/usr/bin/env python3
"""Fail-fast preflight for the CallQuanta Lite runtime test.

This script only reads configuration and reports pass/fail names. It never
prints secret values and never starts services or calls external providers.
"""

from __future__ import annotations

import argparse
import os
import shutil
from pathlib import Path
from urllib.parse import urlparse


TRUE_VALUES = {"1", "true", "yes", "on"}
PROTECTED_ENVIRONMENTS = {"pilot", "production", "prod"}


def _dotenv(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if value and value[0:1] == value[-1:] and value[0:1] in {"'", '"'}:
            value = value[1:-1]
        values[key] = value
    return values


def _config(env_file: Path) -> dict[str, str]:
    values = _dotenv(env_file)
    values.update({key: value for key, value in os.environ.items() if value != ""})
    return values


def _flag(value: str | None) -> bool:
    return (value or "").strip().lower() in TRUE_VALUES


def _int(values: dict[str, str], key: str, default: int) -> int | None:
    raw = values.get(key, str(default)).strip()
    try:
        return int(raw)
    except ValueError:
        return None


def _host_allowed(host: str, entries: set[str]) -> bool:
    for entry in entries:
        pattern = entry.strip().lower().rstrip(".")
        if pattern.startswith("*."):
            suffix = pattern[2:]
            marker = f".{suffix}"
            if host.endswith(marker):
                tenant = host[: -len(marker)]
                if tenant and "." not in tenant:
                    return True
        elif host == pattern:
            return True
    return False


def run(env_file: Path) -> int:
    values = _config(env_file)
    failures: list[str] = []
    warnings: list[str] = []

    def require(condition: bool, message: str) -> None:
        if not condition:
            failures.append(message)

    require(env_file.is_file(), f"{env_file} is missing; copy .env.example to .env first")
    require(bool(shutil.which("docker")), "Docker CLI is not installed or is not on PATH")

    service_token = values.get("LITE_SERVICE_TOKEN", "").strip()
    require(len(service_token) >= 32, "LITE_SERVICE_TOKEN must be at least 32 characters")

    free_analyses = _int(values, "LITE_FREE_ANALYSES", 3)
    max_upload = _int(values, "LITE_MAX_UPLOAD_BYTES", 18 * 1024 * 1024)
    max_duration = _int(values, "LITE_MAX_DURATION_SECONDS", 1200)
    retention_days = _int(values, "LITE_RETENTION_DAYS", 30)
    daily_limit = _int(values, "LLM_DAILY_CALL_LIMIT", 30)
    require(free_analyses is not None and free_analyses >= 1, "LITE_FREE_ANALYSES must be a positive integer")
    require(max_upload is not None and 1 <= max_upload <= 20 * 1024 * 1024, "LITE_MAX_UPLOAD_BYTES must be between 1 and 20 MiB")
    require(max_duration is not None and 1 <= max_duration <= 1200, "LITE_MAX_DURATION_SECONDS must be between 1 and 1200")
    require(retention_days is not None and retention_days >= 30, "LITE_RETENTION_DAYS must be at least 30")
    require(daily_limit is not None and daily_limit >= 1, "LLM_DAILY_CALL_LIMIT must be a positive integer")

    app_env = values.get("APP_ENV", "development").strip().lower()
    stt_mode = values.get("STT_MODE", "placeholder").strip().lower()
    qa_mode = values.get("QA_MODE", "placeholder").strip().lower()
    placeholder_allowed = _flag(values.get("ALLOW_PLACEHOLDER_AI"))
    if app_env in PROTECTED_ENVIRONMENTS and (stt_mode == "placeholder" or qa_mode == "placeholder") and not placeholder_allowed:
        failures.append("Placeholder STT/QA is not allowed in protected APP_ENV without explicit diagnostic opt-in")
    elif stt_mode == "placeholder" or qa_mode == "placeholder":
        warnings.append("This is a wiring test: placeholder STT/QA output is not real analysis quality")

    bot_enabled = _flag(values.get("TELEGRAM_BOT_ENABLED"))
    if bot_enabled:
        require(bool(values.get("TELEGRAM_BOT_TOKEN", "").strip()), "TELEGRAM_BOT_TOKEN is required when TELEGRAM_BOT_ENABLED=true")
    else:
        warnings.append("Telegram bot is disabled; run the API/queue smoke test first")

    if _flag(values.get("LLM_EXTERNAL_ENABLED")):
        warnings.append("External LLM is enabled; this preflight cannot verify Alibaba Free Quota Only")
        warnings.append("Confirm Stop-on-Exhaust is enabled for the selected model in Model Studio before sending requests")
        require(qa_mode == "real", "QA_MODE=real is required when LLM_EXTERNAL_ENABLED=true")
        require(
            values.get("LLM_PROVIDER_CONFIG_SOURCE", "").strip().lower() == "env",
            "LLM_PROVIDER_CONFIG_SOURCE=env is required so database provider settings cannot override the Qwen pilot config",
        )
        require(bool(values.get("LLM_API_KEY", "").strip()), "LLM_API_KEY is required when LLM_EXTERNAL_ENABLED=true")
        require(
            values.get("LLM_MODEL", "").strip() == "qwen3.7-flash-2026-07-15",
            "LLM_MODEL must be qwen3.7-flash-2026-07-15 for the configured Lite pilot",
        )
        parsed_url = urlparse(values.get("LLM_BASE_URL", "").strip())
        require(parsed_url.scheme == "https", "LLM_BASE_URL must use HTTPS")
        allowed_hosts = {
            host.strip().lower().rstrip(".")
            for host in values.get("LLM_EXTERNAL_ALLOWED_HOSTS", "").split(",")
            if host.strip()
        }
        require(
            bool(parsed_url.hostname) and _host_allowed(parsed_url.hostname.lower(), allowed_hosts),
            "LLM_BASE_URL host must match LLM_EXTERNAL_ALLOWED_HOSTS (Singapore Qwen workspace host)",
        )
        if daily_limit and daily_limit > 1:
            warnings.append("For the first paid-provider smoke, set LLM_DAILY_CALL_LIMIT=1")
    else:
        warnings.append("External LLM is disabled; no paid LLM call is expected")

    if failures:
        print("LITE RUNTIME PREFLIGHT: FAIL")
        for item in failures:
            print(f"FAIL: {item}")
        for item in warnings:
            print(f"WARN: {item}")
        return 1

    print("LITE RUNTIME PREFLIGHT: PASS")
    for item in warnings:
        print(f"WARN: {item}")
    print("PASS: configuration values are present and within the test bounds")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=Path(".env"))
    args = parser.parse_args()
    return run(args.env_file)


if __name__ == "__main__":
    raise SystemExit(main())
