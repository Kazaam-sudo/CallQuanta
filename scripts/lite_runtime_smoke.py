#!/usr/bin/env python3
"""Exercise the private Lite API and existing worker pipeline with a synthetic WAV.

The test uses only the Python standard library. It never calls Telegram or an
external STT/LLM provider directly. Use a dedicated test Telegram user ID.
"""

from __future__ import annotations

import argparse
import io
import json
import mimetypes
import os
from pathlib import Path
import struct
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import wave
from typing import Any


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


def _bool_env(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name, "true" if default else "false").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _synthetic_wav() -> bytes:
    sample_rate = 16_000
    duration = 1.0
    samples = int(sample_rate * duration)
    frames = bytearray()
    for index in range(samples):
        amplitude = 5000 if (index // 160) % 2 else -5000
        frames.extend(struct.pack("<h", amplitude))
    output = io.BytesIO()
    with wave.open(output, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(bytes(frames))
    return output.getvalue()


def _multipart(fields: dict[str, str], filename: str, content_type: str, content: bytes) -> tuple[bytes, str]:
    boundary = f"----CallQuantaLite{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for key, value in fields.items():
        chunks.extend([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode(),
            value.encode(),
            b"\r\n",
        ])
    chunks.extend([
        f"--{boundary}\r\n".encode(),
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode(),
        f"Content-Type: {content_type}\r\n\r\n".encode(),
        content,
        b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ])
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def _request(base_url: str, method: str, path: str, token: str | None = None, body: bytes | None = None, content_type: str | None = None) -> tuple[int, dict[str, Any]]:
    headers = {"Accept": "application/json"}
    if token is not None:
        headers["X-CallQuanta-Service-Token"] = token
    if content_type:
        headers["Content-Type"] = content_type
    request = urllib.request.Request(f"{base_url.rstrip('/')}{path}", data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
            return int(response.status), json.loads(raw.decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            payload = {"detail": raw[:500].decode("utf-8", errors="replace")}
        return int(exc.code), payload
    except urllib.error.URLError as exc:
        raise RuntimeError(f"API is unreachable: {exc.reason}") from exc


def _assert_status(actual: int, expected: int, message: str, payload: dict[str, Any]) -> None:
    if actual != expected:
        raise RuntimeError(f"{message}: expected HTTP {expected}, got {actual}: {payload}")


def _audio_input(path: Path | None) -> tuple[str, str, int, bytes]:
    if path is None:
        return "runtime_smoke.wav", "audio/wav", 1, _synthetic_wav()
    suffix = path.suffix.lower()
    supported = {".wav", ".mp3", ".m4a", ".ogg", ".opus", ".flac", ".webm"}
    if suffix not in supported:
        raise RuntimeError(f"Unsupported test audio extension: {suffix}")
    duration_seconds = 0
    if suffix == ".wav":
        with wave.open(str(path), "rb") as handle:
            duration_seconds = max(1, int(handle.getnframes() / handle.getframerate()))
    mime = mimetypes.guess_type(path.name)[0] or ("audio/wav" if suffix == ".wav" else "application/octet-stream")
    return path.name, mime, duration_seconds, path.read_bytes()


def run(base_url: str, token: str, user_id: int, max_wait: int, cleanup: bool, audio_path: Path | None) -> int:
    print(f"Testing API: {base_url}")
    status, payload = _request(base_url, "POST", "/internal/lite/cleanup")
    _assert_status(status, 401, "missing service token must be rejected", payload)
    print("PASS missing service token -> 401")

    status, payload = _request(base_url, "POST", "/internal/lite/cleanup", token)
    _assert_status(status, 200, "authorized cleanup", payload)
    print(f"PASS authorized cleanup -> {payload.get('deleted_jobs', 0)} expired jobs removed")

    filename, mime_type, duration_seconds, content = _audio_input(audio_path)
    audio, content_type = _multipart(
        {
            "telegram_user_id": str(user_id),
            "idempotency_key": f"runtime:{user_id}:{uuid.uuid4().hex}",
            "duration_seconds": str(duration_seconds),
            "language": "ru",
        },
        filename,
        mime_type,
        content,
    )
    job_id: int | None = None
    try:
        status, payload = _request(base_url, "POST", "/internal/lite/jobs", token, audio, content_type)
        _assert_status(status, 200, "create Lite job", payload)
        job_id = int(payload["job_id"])
        print(f"PASS Lite job accepted -> job_id={job_id}, remaining={payload.get('remaining')}")

        deadline = time.monotonic() + max_wait
        last_status = None
        while time.monotonic() < deadline:
            query = urllib.parse.urlencode({"telegram_user_id": user_id})
            status, payload = _request(base_url, "GET", f"/internal/lite/jobs/{job_id}?{query}", token)
            _assert_status(status, 200, "read Lite job", payload)
            current = payload.get("status")
            if current != last_status:
                print(f"STATUS job={job_id}: {current}")
                last_status = current
            if payload.get("result"):
                if payload.get("audio_deleted") is not True:
                    raise RuntimeError("Lite source audio was not marked deleted after transcription")
                print("PASS Lite source audio deleted after transcription")
                print("PASS report returned")
                print(json.dumps(payload["result"], ensure_ascii=False, indent=2)[:4000])
                return 0
            if current in {"analysis_failed", "transcription_failed", "failed"}:
                raise RuntimeError(f"Lite job failed: {payload.get('error') or payload}")
            if current == "analysis_blocked_invalid_transcript":
                raise RuntimeError("QA correctly blocked the transcript as invalid; verify STT mode and test audio language/content")
            time.sleep(3)

        raise RuntimeError(f"Timed out after {max_wait}s waiting for job {job_id}; last payload={payload}")
    finally:
        if cleanup and job_id is not None:
            cleanup_status, cleanup_payload = _request(base_url, "DELETE", f"/internal/lite/users/{user_id}", token)
            _assert_status(cleanup_status, 200, "cleanup test user data", cleanup_payload)
            print(f"PASS test data cleanup -> {cleanup_payload.get('deleted_jobs', 0)} jobs removed")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", default=os.environ.get("LITE_RUNTIME_API_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--service-token", default=os.environ.get("LITE_SERVICE_TOKEN", ""))
    parser.add_argument("--env-file", type=Path, help="read LITE_SERVICE_TOKEN from a local env file without printing it")
    parser.add_argument("--user-id", type=int, default=_env_int("LITE_RUNTIME_TEST_USER_ID", 0))
    parser.add_argument("--max-wait", type=int, default=_env_int("LITE_RUNTIME_MAX_WAIT_SECONDS", 600))
    parser.add_argument("--audio-file", type=Path, help="optional synthetic spoken audio file; default is a short silent test WAV")
    parser.add_argument("--cleanup", action="store_true", help="delete the test user's Lite data after a successful run")
    args = parser.parse_args()
    if args.env_file and not args.service_token:
        for raw_line in args.env_file.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if line.startswith("LITE_SERVICE_TOKEN="):
                args.service_token = line.split("=", 1)[1].strip().strip("\"'")
                break
    if len(args.service_token) < 32:
        print("Set LITE_SERVICE_TOKEN or provide --env-file/--service-token (at least 32 characters).", file=sys.stderr)
        return 2
    if args.user_id <= 0:
        print("Set LITE_RUNTIME_TEST_USER_ID or --user-id to a dedicated positive test ID.", file=sys.stderr)
        return 2
    try:
        return run(args.api_url, args.service_token, args.user_id, max(30, args.max_wait), args.cleanup, args.audio_file)
    except (RuntimeError, KeyError, ValueError) as exc:
        print(f"LITE RUNTIME SMOKE: FAIL: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
