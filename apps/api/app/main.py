import json
import logging
import os
from pathlib import Path
from uuid import uuid4

import redis
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from werkzeug.utils import secure_filename

from .db import Base, Call, QAFinding, QAReview, TranscriptSegment

app = FastAPI(title="CallQuanta API", version="0.3.3")
logger = logging.getLogger("callquanta.api")

DATABASE_URL = "postgresql+psycopg://callquanta:callquanta@postgres:5432/callquanta"
DATABASE_URL = os.environ.get("DATABASE_URL", DATABASE_URL)
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
TRANSCRIPTION_QUEUE = os.environ.get("TRANSCRIPTION_QUEUE", "transcription_jobs")
QA_QUEUE = os.environ.get("QA_QUEUE", "qa_jobs")
UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "uploads"))
CORS_ORIGINS = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
)
ALLOWED_CORS_ORIGINS = [origin.strip() for origin in CORS_ORIGINS.split(",") if origin.strip()]
ALLOWED_UPLOAD_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".flac", ".webm"}


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)


class ProviderTestRequest(BaseModel):
    provider_type: str
    base_url: str
    api_key: str | None = None


@app.get("/health")
def health() -> dict[str, str]:
    logger.info("Health check requested")
    return {"status": "ok"}


@app.on_event("startup")
def on_startup() -> None:
    logging.basicConfig(level=logging.INFO)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    logger.info("CallQuanta API started")


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.post("/calls/upload")
async def upload_call(file: UploadFile = File(...), db: Session = Depends(get_db)) -> dict:
    safe_name = secure_filename(file.filename or "")
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid filename")

    extension = Path(safe_name).suffix.lower()
    if extension not in ALLOWED_UPLOAD_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_UPLOAD_EXTENSIONS))
        raise HTTPException(status_code=400, detail=f"Unsupported file extension. Allowed extensions: {allowed}")

    stored_name = f"{uuid4().hex}_{safe_name}"
    stored_path = UPLOAD_DIR / stored_name

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    stored_path.write_bytes(contents)

    call = Call(
        filename=safe_name,
        status="uploaded",
        stored_filename=stored_name,
        stored_path=str(stored_path),
        file_size_bytes=len(contents),
        content_type=file.content_type,
    )
    db.add(call)
    db.commit()
    db.refresh(call)

    return serialize_call(call)


def serialize_call(call: Call) -> dict:
    return {
        "id": call.id,
        "filename": call.filename,
        "status": call.status,
        "stored_filename": call.stored_filename,
        "stored_path": call.stored_path,
        "file_size_bytes": call.file_size_bytes,
        "content_type": call.content_type,
        "created_at": call.created_at.isoformat() if call.created_at else None,
    }


@app.get("/calls")
def list_calls(db: Session = Depends(get_db)) -> list[dict]:
    calls = db.execute(select(Call).order_by(Call.created_at.desc(), Call.id.desc())).scalars().all()
    return [serialize_call(call) for call in calls]


@app.get("/calls/{call_id}")
def get_call(call_id: int, db: Session = Depends(get_db)) -> dict:
    call = db.get(Call, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    return serialize_call(call)


@app.post("/calls/{call_id}/transcribe")
def transcribe_call(call_id: int, db: Session = Depends(get_db)) -> dict:
    call = db.get(Call, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    call.status = "transcription_pending"
    db.commit()

    redis_client.lpush(TRANSCRIPTION_QUEUE, json.dumps({"call_id": call_id}))
    return {"call_id": call_id, "status": "transcription_queued"}


@app.get("/calls/{call_id}/transcript")
def get_call_transcript(call_id: int, db: Session = Depends(get_db)) -> dict:
    call = db.get(Call, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    segments = db.execute(
        select(TranscriptSegment)
        .where(TranscriptSegment.call_id == call_id)
        .order_by(TranscriptSegment.start_ms.asc(), TranscriptSegment.id.asc())
    ).scalars().all()

    return {
        "call_id": call_id,
        "status": call.status,
        "segments": [
            {
                "id": segment.id,
                "speaker": segment.speaker,
                "start_ms": segment.start_ms,
                "end_ms": segment.end_ms,
                "text": segment.text,
            }
            for segment in segments
        ],
    }


@app.post("/calls/{call_id}/analyze")
def analyze_call(call_id: int, db: Session = Depends(get_db)) -> dict:
    call = db.get(Call, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    has_segments = db.execute(select(TranscriptSegment.id).where(TranscriptSegment.call_id == call_id).limit(1)).first()
    if not has_segments:
        raise HTTPException(status_code=400, detail="Call has no transcript segments")

    call.status = "analysis_pending"
    db.commit()

    redis_client.lpush(QA_QUEUE, json.dumps({"call_id": call_id}))
    return {"call_id": call_id, "status": "analysis_queued"}


@app.get("/calls/{call_id}/qa")
def get_call_qa(call_id: int, db: Session = Depends(get_db)) -> dict:
    call = db.get(Call, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    review = db.execute(select(QAReview).where(QAReview.call_id == call_id).order_by(QAReview.id.desc())).scalars().first()
    if not review:
        return {"call_id": call_id, "status": call.status, "review": None}

    findings = db.execute(
        select(QAFinding).where(QAFinding.qa_review_id == review.id).order_by(QAFinding.id.asc())
    ).scalars().all()

    return {
        "call_id": call_id,
        "status": call.status,
        "review": {
            "id": review.id,
            "score": review.score,
            "summary": review.summary,
            "findings": [{"id": finding.id, "severity": finding.severity, "evidence": finding.evidence} for finding in findings],
        },
    }


@app.get("/settings/providers")
def list_providers() -> dict:
    return {"llm": ["openai_compatible"], "stt": ["faster_whisper"], "tts": []}


@app.post("/settings/providers/test")
def test_provider(payload: ProviderTestRequest) -> dict:
    return {"ok": True, "provider_type": payload.provider_type}
