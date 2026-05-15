"""STT worker entrypoint."""

import json
import os
import signal
import time

import redis
from sqlalchemy import create_engine, delete, select
from sqlalchemy.orm import Session, sessionmaker

from db import Call, TranscriptSegment

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql+psycopg://callquanta:callquanta@postgres:5432/callquanta")
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
TRANSCRIPTION_QUEUE = os.environ.get("TRANSCRIPTION_QUEUE", "transcription_jobs")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
running = True


def handle_shutdown(signum, frame):
    global running
    print(f"stt-worker received shutdown signal: {signum}")
    running = False


def process_transcription_job(call_id: int) -> None:
    with SessionLocal() as db:
        call = db.get(Call, call_id)
        if not call:
            print(f"call {call_id} not found, skipping job")
            return

        try:
            db.execute(delete(TranscriptSegment).where(TranscriptSegment.call_id == call_id))
            db.add_all(
                [
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
            )
            call.status = "transcribed"
            db.commit()
            print(f"call {call_id} transcribed with placeholder segments")
        except Exception as exc:
            db.rollback()
            call.status = "failed"
            db.commit()
            print(f"failed to process call {call_id}: {exc}")


signal.signal(signal.SIGINT, handle_shutdown)
signal.signal(signal.SIGTERM, handle_shutdown)

print("stt-worker started. Waiting for transcription jobs...")

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
