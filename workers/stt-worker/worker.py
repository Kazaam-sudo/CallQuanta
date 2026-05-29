"""STT worker entrypoint."""

import json
import os
import signal
from datetime import UTC, datetime

import redis
from sqlalchemy import create_engine, delete
from sqlalchemy.orm import sessionmaker

from db import Call, TranscriptSegment

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql+psycopg://callquanta:callquanta@postgres:5432/callquanta")
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
TRANSCRIPTION_QUEUE = os.environ.get("TRANSCRIPTION_QUEUE", "transcription_jobs")
STT_MODE = os.environ.get("STT_MODE", "placeholder")
FASTER_WHISPER_MODEL = os.environ.get("FASTER_WHISPER_MODEL", "base")
FASTER_WHISPER_DEVICE = os.environ.get("FASTER_WHISPER_DEVICE", "cpu")
FASTER_WHISPER_COMPUTE_TYPE = os.environ.get("FASTER_WHISPER_COMPUTE_TYPE", "int8")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
running = True
faster_whisper_model = None


def safe_error(exc: Exception, limit: int = 2000) -> str:
    message = str(exc) or exc.__class__.__name__
    for key in ("OPENAI_API_KEY", "API_KEY", "SECRET", "TOKEN"):
        value = os.environ.get(key)
        if value:
            message = message.replace(value, "[redacted]")
    return message[:limit]


def handle_shutdown(signum, frame):
    del frame
    global running
    print(f"stt-worker received shutdown signal: {signum}")
    running = False


def get_faster_whisper_model():
    global faster_whisper_model
    if faster_whisper_model is None:
        print(
            "loading faster-whisper model "
            f"model={FASTER_WHISPER_MODEL} device={FASTER_WHISPER_DEVICE} compute_type={FASTER_WHISPER_COMPUTE_TYPE}"
        )
        from faster_whisper import WhisperModel

        faster_whisper_model = WhisperModel(
            FASTER_WHISPER_MODEL,
            device=FASTER_WHISPER_DEVICE,
            compute_type=FASTER_WHISPER_COMPUTE_TYPE,
        )
    return faster_whisper_model


def placeholder_segments(call_id: int):
    return [
        TranscriptSegment(
            call_id=call_id,
            speaker="agent",
            start_ms=0,
            end_ms=3200,
            text="Hello, thank you for calling. This is a placeholder transcript segment.",
        ),
        TranscriptSegment(
            call_id=call_id,
            speaker="customer",
            start_ms=3200,
            end_ms=7100,
            text="Hi, I need help with my account. Placeholder transcription is enabled in v0.3.0.",
        ),
    ]


def faster_whisper_segments(call_id: int, stored_path: str):
    model = get_faster_whisper_model()
    segments, _ = model.transcribe(stored_path)

    transcript_segments = []
    for segment in segments:
        start_ms = int(segment.start * 1000)
        end_ms = int(segment.end * 1000)
        transcript_segments.append(
            TranscriptSegment(
                call_id=call_id,
                speaker="unknown",
                start_ms=start_ms,
                end_ms=end_ms,
                text=segment.text.strip(),
            )
        )
    return transcript_segments


def process_transcription_job(call_id: int) -> None:
    with SessionLocal() as db:
        call = db.get(Call, call_id)
        if not call:
            print(f"call {call_id} not found, skipping job")
            return

        try:
            call.status = "transcribing"
            call.last_error_type = None
            call.last_error_message = None
            db.commit()

            db.execute(delete(TranscriptSegment).where(TranscriptSegment.call_id == call_id))

            if STT_MODE == "placeholder":
                db.add_all(placeholder_segments(call_id))
                print(f"call {call_id} transcribed with placeholder segments")
            elif STT_MODE == "faster_whisper":
                if not call.stored_path:
                    raise ValueError(f"call {call_id} has no stored_path")
                db.add_all(faster_whisper_segments(call_id=call_id, stored_path=call.stored_path))
                print(f"call {call_id} transcribed with faster-whisper")
            else:
                raise ValueError(f"unsupported STT_MODE: {STT_MODE}")

            call.status = "transcribed"
            call.last_error_type = None
            call.last_error_message = None
            call.last_processed_at = datetime.now(UTC)
            db.commit()
        except Exception as exc:
            db.rollback()
            call = db.get(Call, call_id)
            if call:
                call.status = "transcription_failed"
                call.last_error_type = "transcription"
                call.last_error_message = f"Transcription failed: {safe_error(exc)}"
                call.last_processed_at = datetime.now(UTC)
                db.commit()
            print(f"failed to process call {call_id}: {safe_error(exc)}")


signal.signal(signal.SIGINT, handle_shutdown)
signal.signal(signal.SIGTERM, handle_shutdown)

print(f"stt-worker started. mode={STT_MODE}. Waiting for transcription jobs...")

while running:
    job = redis_client.brpop(TRANSCRIPTION_QUEUE, timeout=2)
    if not job:
        continue

    _, payload = job
    try:
        data = json.loads(payload)
        call_id = int(data["call_id"])
    except Exception:
        print(f"invalid transcription job payload: {payload}")
        continue

    process_transcription_job(call_id)

print("stt-worker stopped gracefully.")
