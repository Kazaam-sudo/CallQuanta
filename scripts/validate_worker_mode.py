#!/usr/bin/env python3
"""Fail closed when containerized workers would use synthetic placeholder output.

Usage:
    python scripts/validate_worker_mode.py qa
    python scripts/validate_worker_mode.py stt

Placeholder modes remain available for development and CI. Buyer-facing pilot and
production containers require an explicit opt-in via ALLOW_PLACEHOLDER_AI=true,
which should be used only for controlled diagnostics and never presented as real AI.
"""

from __future__ import annotations

import os
import sys

PROTECTED_ENVIRONMENTS = {"pilot", "production", "prod"}
TRUE_VALUES = {"1", "true", "yes", "on"}


def validate_worker_mode(worker: str, environ: dict[str, str] | None = None) -> None:
    env = environ if environ is not None else os.environ
    worker_name = worker.strip().lower()
    if worker_name not in {"qa", "stt"}:
        raise ValueError("worker must be 'qa' or 'stt'")

    app_env = env.get("APP_ENV", "development").strip().lower()
    mode_key = "QA_MODE" if worker_name == "qa" else "STT_MODE"
    mode = env.get(mode_key, "placeholder").strip().lower()
    placeholder_allowed = env.get("ALLOW_PLACEHOLDER_AI", "false").strip().lower() in TRUE_VALUES

    if app_env in PROTECTED_ENVIRONMENTS and mode == "placeholder" and not placeholder_allowed:
        raise RuntimeError(
            f"Refusing to start {worker_name}-worker: {mode_key}=placeholder is unsafe "
            f"when APP_ENV={app_env}. Configure a real provider mode or, for controlled "
            "diagnostics only, set ALLOW_PLACEHOLDER_AI=true."
        )


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: validate_worker_mode.py <qa|stt>", file=sys.stderr)
        return 2
    try:
        validate_worker_mode(argv[1])
    except (ValueError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
