"""Recording download worker for telephony ingestion."""

import json
import mimetypes
import os
import re
import signal
import sys
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit
from uuid import uuid4

import redis
import requests
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from werkzeug.utils import secure_filename

from db import Call, IngestionEvent
from url_safety import validate_recording_url

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql+psycopg://callquanta:callquanta@postgres:5432/callquanta")
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
RECORDING_QUEUE = os.environ.get("RECORDING_QUEUE", "recording_jobs")
TRANSCRIPTION_QUEUE = os.environ.get("TRANSCRIPTION_QUEUE", "transcription_jobs")
UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "uploads"))
MAX_BYTES = int(os.environ.get("RECORDING_DOWNLOAD_MAX_BYTES", str(100 * 1024 * 1024)))
TIMEOUT_SECONDS = int(os.environ.get("RECORDING_DOWNLOAD_TIMEOUT_SECONDS", "120"))
CONNECT_TIMEOUT_SECONDS = int(os.environ.get("RECORDING_DOWNLOAD_CONNECT_TIMEOUT_SECONDS", "10"))
MAX_REDIRECTS = int(os.environ.get("RECORDING_DOWNLOAD_MAX_REDIRECTS", "5"))
ALLOW_PRIVATE_HOSTS = os.environ.get("RECORDING_DOWNLOAD_ALLOW_PRIVATE_HOSTS", "false").lower() in {"1", "true", "yes", "on"}
ALLOWED_HOSTS = os.environ.get("RECORDING_DOWNLOAD_ALLOWED_HOSTS", "")
ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".opus", ".flac", ".webm"}
ALLOWED_CONTENT_TYPES = {
    "audio/wav",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/aac",
    "audio/ogg",
    "application/ogg",
    "audio/opus",
    "audio/flac",
    "audio/webm",
    "video/webm",
    "application/octet-stream",
}
REDIRECT_STATUS_CODES = {301, 302, 303, 307, 308}
CHUNK_SIZE = 1024 * 1024

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
WORKER_HEARTBEAT_SECONDS = int(os.environ.get("WORKER_HEARTBEAT_SECONDS", "30"))
WORKER_NAME = os.environ.get("WORKER_NAME", "recording-worker")
running = True


def write_heartbeat() -> None:
    try:
        redis_client.set(
            f"worker:{WORKER_NAME}:heartbeat",
            datetime.now(UTC).isoformat(),
            ex=max(120, WORKER_HEARTBEAT_SECONDS * 4),
        )
    except redis.RedisError as exc:
        print(f"failed to write heartbeat for {WORKER_NAME}: {exc}")


def handle_shutdown(signum, frame):
    del frame
    global running
    print(f"recording-worker received shutdown signal: {signum}")
    running = False


def redacted_url(value: str) -> str:
    try:
        parsed = urlsplit(value)
        host = parsed.hostname or ""
        if parsed.port:
            host = f"{host}:{parsed.port}"
        return urlunsplit((parsed.scheme, host, parsed.path, "", ""))
    except (TypeError, ValueError):
        return "[redacted-url]"


def safe_error(exc: Exception, limit: int = 1000) -> str:
    message = str(exc) or exc.__class__.__name__
    for key in ("TOKEN", "SECRET", "API_KEY"):
        value = os.environ.get(key)
        if value:
            message = message.replace(value, "[redacted]")
    message = re.sub(r"https?://[^\s'\"]+", lambda match: redacted_url(match.group(0)), message)
    return message[:limit]


def extension_for_content_type(content_type: str | None) -> str | None:
    return {
        "audio/ogg": ".ogg",
        "application/ogg": ".ogg",
        "audio/opus": ".opus",
        "audio/webm": ".webm",
        "video/webm": ".webm",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
        "audio/mpeg": ".mp3",
        "audio/mp3": ".mp3",
        "audio/mp4": ".m4a",
        "audio/aac": ".m4a",
        "audio/flac": ".flac",
    }.get((content_type or "").split(";", 1)[0].strip().lower())


def display_filename(filename: str | None, url: str, content_type: str | None = None) -> tuple[str, str]:
    raw = (filename or url.rsplit("/", 1)[-1] or "recording.wav").split("?", 1)[0]
    raw = raw.replace("\\", "/").rsplit("/", 1)[-1].strip() or "recording.wav"
    ext = Path(raw).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        guessed = extension_for_content_type(content_type) or mimetypes.guess_extension(mimetypes.guess_type(url)[0] or "") or ".wav"
        ext = guessed if guessed in ALLOWED_EXTENSIONS else ".wav"
        raw = f"{Path(raw).stem or 'recording'}{ext}"
    safe = secure_filename(raw)
    if not safe or Path(safe).suffix.lower() != ext:
        safe = f"{Path(safe).stem or 'recording'}{ext}"
    return raw[:255], safe


def log_event(
    db,
    call: Call | None,
    event_type: str,
    status: str,
    message: str | None = None,
    integration_id: int | None = None,
):
    db.add(
        IngestionEvent(
            integration_id=integration_id,
            source_provider=(call.source_provider if call else None) or "generic_webhook",
            external_call_id=call.external_call_id if call else None,
            event_type=event_type,
            status=status,
            message=message[:500] if message else None,
            call_id=call.id if call else None,
        )
    )


def enqueue_transcription(call_id: int) -> bool:
    try:
        redis_client.lpush(TRANSCRIPTION_QUEUE, json.dumps({"call_id": call_id}))
        return True
    except redis.RedisError as exc:
        print(f"failed to enqueue transcription for call {call_id}: {safe_error(exc)}")
        return False


def _get_recording_response(session: requests.Session, url: str) -> tuple[requests.Response, str]:
    current_url = url
    for redirect_count in range(MAX_REDIRECTS + 1):
        validate_recording_url(
            current_url,
            allowed_hosts=ALLOWED_HOSTS,
            allow_private_hosts=ALLOW_PRIVATE_HOSTS,
        )
        response = session.get(
            current_url,
            stream=True,
            allow_redirects=False,
            timeout=(CONNECT_TIMEOUT_SECONDS, TIMEOUT_SECONDS),
        )
        if response.status_code not in REDIRECT_STATUS_CODES:
            response.raise_for_status()
            return response, current_url

        location = response.headers.get("location")
        response.close()
        if not location:
            raise ValueError("Recording download redirect did not include a location")
        if redirect_count >= MAX_REDIRECTS:
            raise ValueError("Recording download exceeded the redirect limit")
        current_url = urljoin(current_url, location)

    raise ValueError("Recording download exceeded the redirect limit")


def download_recording(url: str, filename: str | None) -> tuple[str, Path, int, str | None]:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    size = 0
    stored_path: Path | None = None
    session = requests.Session()
    session.trust_env = False
    try:
        response, final_url = _get_recording_response(session, url)
        with response:
            content_type = (response.headers.get("content-type") or "").split(";", 1)[0].strip().lower() or None
            if content_type and content_type not in ALLOWED_CONTENT_TYPES:
                raise ValueError("Recording URL did not return a supported audio content type")
            _, safe = display_filename(filename, final_url, content_type)
            stored_name = f"{uuid4().hex}_{safe}"
            stored_path = UPLOAD_DIR / stored_name
            declared = int(response.headers.get("content-length") or "0")
            if MAX_BYTES and declared and declared > MAX_BYTES:
                raise ValueError("Recording download exceeds the configured max size")
            with stored_path.open("wb") as handle:
                for chunk in response.iter_content(CHUNK_SIZE):
                    if not chunk:
                        continue
                    size += len(chunk)
                    if MAX_BYTES and size > MAX_BYTES:
                        raise ValueError("Recording download exceeds the configured max size")
                    handle.write(chunk)
        if size == 0:
            raise ValueError("Recording download was empty")
        return stored_name, stored_path, size, content_type
    except Exception:
        if stored_path is not None:
            stored_path.unlink(missing_ok=True)
        raise
    finally:
        session.close()


def process_job(data: dict) -> None:
    call_id = int(data["call_id"])
    url = str(data["recording_url"]).strip()
    filename = data.get("filename")
    auto_transcribe = bool(data.get("auto_transcribe"))
    integration_id = data.get("integration_id")
    downloaded_path: Path | None = None
    with SessionLocal() as db:
        call = db.get(Call, call_id)
        if not call:
            print(f"call {call_id} not found, skipping recording job")
            return
        try:
            call.ingestion_status = "recording_download_started"
            call.status = "recording_download_pending"
            log_event(db, call, "recording_download_started", "success", integration_id=integration_id)
            db.commit()

            stored_name, stored_path, size, content_type = download_recording(url, filename)
            downloaded_path = stored_path
            call.stored_filename = stored_name
            call.stored_path = str(stored_path)
            call.file_size_bytes = size
            call.content_type = content_type
            call.ingestion_status = "recording_downloaded"
            call.ingestion_error = None
            call.imported_at = datetime.now(UTC)
            call.last_error_type = None
            call.last_error_message = None
            call.last_processed_at = datetime.now(UTC)
            call.status = "transcription_pending" if auto_transcribe else "uploaded"
            log_event(db, call, "recording_download_completed", "success", integration_id=integration_id)
            if auto_transcribe:
                queued = enqueue_transcription(call.id)
                log_event(
                    db,
                    call,
                    "transcription_queued",
                    "success" if queued else "failed",
                    None if queued else "Queue backend is unavailable",
                    integration_id=integration_id,
                )
                if not queued:
                    call.status = "transcription_failed"
                    call.last_error_type = "queue_unavailable"
                    call.last_error_message = "Queue backend is unavailable"
            db.commit()
            downloaded_path = None
        except Exception as exc:
            db.rollback()
            if downloaded_path is not None:
                downloaded_path.unlink(missing_ok=True)
            call = db.get(Call, call_id)
            if call:
                message = f"Recording download failed: {safe_error(exc)}"
                call.status = "recording_download_failed"
                call.ingestion_status = "recording_download_failed"
                call.ingestion_error = message
                call.last_error_type = "ingestion"
                call.last_error_message = message
                call.last_processed_at = datetime.now(UTC)
                log_event(db, call, "recording_download_failed", "failed", message, integration_id=integration_id)
                db.commit()
            print(f"failed to download recording for call {call_id}: {safe_error(exc)}")


def run_worker() -> None:
    print("recording-worker started. Waiting for recording jobs...")
    while running:
        write_heartbeat()
        job = redis_client.brpop(RECORDING_QUEUE, timeout=2)
        if not job:
            continue
        _, payload = job
        try:
            process_job(json.loads(payload))
        except Exception as exc:
            print(f"invalid recording job payload: {safe_error(exc)}")
    print("recording-worker stopped gracefully.")


signal.signal(signal.SIGINT, handle_shutdown)
signal.signal(signal.SIGTERM, handle_shutdown)

if __name__ == "__main__" and "pytest" not in sys.modules:
    run_worker()
