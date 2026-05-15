import logging
from pathlib import Path
from uuid import uuid4

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from werkzeug.utils import secure_filename

from .db import Base, Call

app = FastAPI(title="CallQuanta API", version="0.2.0")
logger = logging.getLogger("callquanta.api")

DATABASE_URL = "postgresql+psycopg://callquanta:callquanta@postgres:5432/callquanta"
DATABASE_URL = __import__("os").environ.get("DATABASE_URL", DATABASE_URL)
UPLOAD_DIR = Path(__import__("os").environ.get("UPLOAD_DIR", "uploads"))
CORS_ORIGINS = __import__("os").environ.get(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
)
ALLOWED_CORS_ORIGINS = [origin.strip() for origin in CORS_ORIGINS.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class ProviderTestRequest(BaseModel):
    provider_type: str
    base_url: str
    api_key: str | None = None


class CallResponse(BaseModel):
    id: int
    filename: str
    status: str
    created_at: str | None = None


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

    stored_name = f"{uuid4().hex}_{safe_name}"
    stored_path = UPLOAD_DIR / stored_name

    contents = await file.read()
    stored_path.write_bytes(contents)

    call = Call(filename=safe_name, status="uploaded")
    db.add(call)
    db.commit()
    db.refresh(call)

    return {
        "id": call.id,
        "filename": call.filename,
        "status": call.status,
        "created_at": call.created_at.isoformat() if call.created_at else None,
    }


@app.get("/calls")
def list_calls(db: Session = Depends(get_db)) -> list[dict]:
    calls = db.execute(select(Call).order_by(Call.created_at.desc(), Call.id.desc())).scalars().all()
    return [
        {
            "id": call.id,
            "filename": call.filename,
            "status": call.status,
            "created_at": call.created_at.isoformat() if call.created_at else None,
        }
        for call in calls
    ]


@app.get("/calls/{call_id}")
def get_call(call_id: int, db: Session = Depends(get_db)) -> dict:
    call = db.get(Call, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    return {
        "id": call.id,
        "filename": call.filename,
        "status": call.status,
        "created_at": call.created_at.isoformat() if call.created_at else None,
    }


@app.post("/calls/{call_id}/transcribe")
def transcribe_call(call_id: int) -> dict:
    return {"call_id": call_id, "status": "transcription_queued"}


@app.post("/calls/{call_id}/analyze")
def analyze_call(call_id: int) -> dict:
    return {"call_id": call_id, "status": "analysis_queued"}


@app.get("/settings/providers")
def list_providers() -> dict:
    return {"llm": ["openai_compatible"], "stt": ["faster_whisper"], "tts": []}


@app.post("/settings/providers/test")
def test_provider(payload: ProviderTestRequest) -> dict:
    return {"ok": True, "provider_type": payload.provider_type}
