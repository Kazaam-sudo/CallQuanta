import csv
import json
import logging
import os
import re
import time
from pathlib import Path
from uuid import uuid4
from datetime import datetime, time as datetime_time

import redis
import requests
import yaml
from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from io import BytesIO, StringIO
from openpyxl import Workbook
from sqlalchemy import create_engine, func, or_, select, text, delete
from sqlalchemy.orm import Session, sessionmaker
from werkzeug.utils import secure_filename

from .db import AppSetting, Base, Call, ProviderConfig, QAReview, ScorecardConfig, SttProviderConfig, TranscriptSegment, migrate_calls_table, migrate_qa_reviews_table, migrate_stt_provider_configs_table
from .stt_languages import SUPPORTED_STT_LANGUAGES, SUPPORTED_STT_LANGUAGE_CODES, normalize_stt_language

app = FastAPI(title="CallQuanta API", version="0.17.0")
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
MAX_DISPLAY_FILENAME_LENGTH = 255
ALLOWED_UPLOAD_CONTENT_TYPES = {
    "audio/wav",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/aac",
    "audio/ogg",
    "audio/flac",
    "audio/webm",
    "video/webm",
}
UPLOAD_CHUNK_SIZE = 1024 * 1024
DEFAULT_MAX_UPLOAD_BYTES_PER_FILE = 100 * 1024 * 1024
DEFAULT_MAX_BULK_UPLOAD_BYTES = 500 * 1024 * 1024
MAX_UPLOAD_BYTES_PER_FILE = int(
    os.environ.get(
        "MAX_UPLOAD_BYTES_PER_FILE",
        os.environ.get("MAX_UPLOAD_BYTES", str(DEFAULT_MAX_UPLOAD_BYTES_PER_FILE)),
    )
    or "0"
)
MAX_BULK_UPLOAD_BYTES = int(os.environ.get("MAX_BULK_UPLOAD_BYTES", str(DEFAULT_MAX_BULK_UPLOAD_BYTES)) or "0")



LANGUAGE_CATALOG = [
    {"code": "en", "label": "English", "native_label": "English", "ui_supported": True, "llm_supported": True},
    {"code": "ru", "label": "Russian", "native_label": "Русский", "ui_supported": True, "llm_supported": True},
    {"code": "uz", "label": "Uzbek", "native_label": "O‘zbek", "ui_supported": True, "llm_supported": True},
    {"code": "es", "label": "Spanish", "native_label": "Español", "ui_supported": False, "llm_supported": True},
    {"code": "pt", "label": "Portuguese", "native_label": "Português", "ui_supported": False, "llm_supported": True},
    {"code": "de", "label": "German", "native_label": "Deutsch", "ui_supported": False, "llm_supported": True},
    {"code": "fr", "label": "French", "native_label": "Français", "ui_supported": False, "llm_supported": True},
    {"code": "tr", "label": "Turkish", "native_label": "Türkçe", "ui_supported": False, "llm_supported": True},
    {"code": "ar", "label": "Arabic", "native_label": "العربية", "ui_supported": False, "llm_supported": True},
    {"code": "custom", "label": "Custom", "native_label": "Custom", "ui_supported": False, "llm_supported": True},
]
LANGUAGE_LABEL_BY_CODE = {item["code"]: item["label"] for item in LANGUAGE_CATALOG}
WORKSPACE_SETTINGS_KEY = "workspace"
DEFAULT_WORKSPACE_SETTINGS = {
    "interface_language": "en",
    "qa_report_language_mode": "workspace",
    "qa_report_language": "English",
}

STT_PROVIDER_TYPES = {
    "faster_whisper_local",
    "openai_compatible_audio",
    "groq_whisper",
    "deepgram",
    "assemblyai",
    "google_speech",
    "azure_speech",
    "custom",
}
STT_PROVIDER_PRESETS = [
    {"id": "local_faster_whisper", "label": "Local faster-whisper", "provider_type": "faster_whisper_local", "default_base_url": "", "default_model": "tiny", "api_key_required": False, "note": "Runs inside your STT worker using local faster-whisper settings."},
    {"id": "openai_audio", "label": "OpenAI audio transcription", "provider_type": "openai_compatible_audio", "default_base_url": "https://api.openai.com/v1", "default_model": "whisper-1", "api_key_required": True},
    {"id": "groq_whisper", "label": "Groq Whisper", "provider_type": "groq_whisper", "default_base_url": "https://api.groq.com/openai/v1", "default_model": "", "api_key_required": True, "note": "Preset can be saved now; transcription support is not implemented yet."},
    {"id": "deepgram", "label": "Deepgram", "provider_type": "deepgram", "default_base_url": "https://api.deepgram.com/v1", "default_model": "", "api_key_required": True, "note": "Preset can be saved now; transcription support is not implemented yet."},
    {"id": "assemblyai", "label": "AssemblyAI", "provider_type": "assemblyai", "default_base_url": "https://api.assemblyai.com/v2", "default_model": "", "api_key_required": True, "note": "Preset can be saved now; transcription support is not implemented yet."},
    {"id": "google_speech", "label": "Google Speech-to-Text", "provider_type": "google_speech", "default_base_url": "", "default_model": "", "api_key_required": True, "note": "Preset can be saved now; transcription support is not implemented yet."},
    {"id": "azure_speech", "label": "Azure Speech", "provider_type": "azure_speech", "default_base_url": "", "default_model": "", "api_key_required": True, "note": "Preset can be saved now; transcription support is not implemented yet."},
    {"id": "custom", "label": "Custom STT provider", "provider_type": "custom", "default_base_url": "", "default_model": "", "api_key_required": False, "note": "Placeholder for future custom STT integrations."},
]

PROVIDER_PRESETS = [
    {"id": "ollama", "label": "Ollama Local", "provider_type": "openai_compatible", "default_base_url": "http://ollama:11434/v1", "default_model": "qwen2.5:1.5b", "api_key_required": False},
    {"id": "openai", "label": "OpenAI", "provider_type": "openai_compatible", "default_base_url": "https://api.openai.com/v1", "default_model": "gpt-5.4-nano", "api_key_required": True},
    {"id": "groq", "label": "Groq", "provider_type": "openai_compatible", "default_base_url": "https://api.groq.com/openai/v1", "default_model": "qwen/qwen3-32b", "api_key_required": True},
    {"id": "openrouter", "label": "OpenRouter", "provider_type": "openai_compatible", "default_base_url": "https://openrouter.ai/api/v1", "default_model": "openai/gpt-oss-120b", "api_key_required": True},
    {"id": "cloudflare", "label": "Cloudflare Workers AI", "provider_type": "openai_compatible", "default_base_url": "https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1", "default_model": "@cf/meta/llama-3.1-8b-instruct", "api_key_required": True, "note": "Replace {ACCOUNT_ID} before using."},
    {"id": "gemini", "label": "Google Gemini", "provider_type": "openai_compatible", "default_base_url": "https://generativelanguage.googleapis.com/v1beta/openai", "default_model": "gemini-3.5-flash", "api_key_required": True},
    {"id": "anthropic", "label": "Anthropic Claude", "provider_type": "openai_compatible", "default_base_url": "https://api.anthropic.com/v1", "default_model": "claude-sonnet-4-5", "api_key_required": True, "note": "Compatibility may not support every OpenAI parameter."},
    {"id": "together", "label": "Together AI", "provider_type": "openai_compatible", "default_base_url": "https://api.together.xyz/v1", "default_model": "Qwen/Qwen3-32B", "api_key_required": True},
    {"id": "custom", "label": "Custom OpenAI-compatible", "provider_type": "openai_compatible", "default_base_url": "", "default_model": "", "api_key_required": False},
]


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


class ProviderUpsertRequest(BaseModel):
    id: int | None = None
    name: str
    preset: str
    provider_type: str = "openai_compatible"
    base_url: str
    model: str
    api_key: str | None = None
    timeout_seconds: float = 180
    is_active: bool = False


class ProviderTestRequest(BaseModel):
    provider_type: str = "openai_compatible"
    base_url: str
    model: str
    api_key: str | None = None
    timeout_seconds: float = 60


class SttProviderUpsertRequest(BaseModel):
    id: int | None = None
    name: str
    provider_type: str = "faster_whisper_local"
    preset: str = "local_faster_whisper"
    model: str = "tiny"
    base_url: str | None = None
    api_key: str | None = None
    timeout_seconds: int = 180
    is_active: bool = False


class SttProviderTestRequest(BaseModel):
    id: int | None = None
    name: str | None = None
    provider_type: str = "faster_whisper_local"
    preset: str = "local_faster_whisper"
    model: str = "tiny"
    base_url: str | None = None
    api_key: str | None = None
    timeout_seconds: int = 60


DEFAULT_SCORECARD_PATH = Path(os.environ.get("SCORECARD_PATH", "/app/packages/scorecards/default_sales_qa.yaml"))


class ScorecardCriterion(BaseModel):
    id: str
    title: str
    max_points: float
    description: str
    positive_examples: list[str] | None = None
    negative_examples: list[str] | None = None


class ScorecardPayload(BaseModel):
    name: str
    report_language: str = "english"
    criteria: list[ScorecardCriterion]




class WorkspaceSettingsPayload(BaseModel):
    interface_language: str | None = None
    qa_report_language_mode: str | None = None
    qa_report_language: str | None = None

class CallMetadataPayload(BaseModel):
    agent_name: str | None = None
    team: str | None = None
    campaign: str | None = None
    direction: str | None = None
    language: str | None = None


class BatchCallsPayload(BaseModel):
    call_ids: list[int]


class BatchMetadataPayload(CallMetadataPayload):
    call_ids: list[int]


class BatchDeletePayload(BaseModel):
    call_ids: list[int]
    delete_files: bool = True



def _normalize_workspace_settings(value: dict | None) -> dict:
    settings = dict(DEFAULT_WORKSPACE_SETTINGS)
    if isinstance(value, dict):
        settings.update({k: v for k, v in value.items() if v is not None})
    if settings.get("interface_language") not in LANGUAGE_LABEL_BY_CODE:
        settings["interface_language"] = "en"
    if settings.get("qa_report_language_mode") not in {"workspace", "same_as_transcript", "custom"}:
        settings["qa_report_language_mode"] = "workspace"
    language = str(settings.get("qa_report_language") or "").strip()
    if not language:
        language = LANGUAGE_LABEL_BY_CODE.get(settings["interface_language"], "English")
    settings["qa_report_language"] = language
    return settings


def _get_workspace_settings(db: Session) -> dict:
    setting = db.get(AppSetting, WORKSPACE_SETTINGS_KEY)
    return _normalize_workspace_settings(setting.value if setting else None)


def _upsert_workspace_settings(db: Session, payload: WorkspaceSettingsPayload) -> dict:
    current = _get_workspace_settings(db)
    updates = payload.model_dump(exclude_unset=True)
    if "interface_language" in updates:
        code = str(updates["interface_language"] or "").strip()
        if code not in LANGUAGE_LABEL_BY_CODE:
            raise HTTPException(status_code=400, detail="Unsupported interface_language")
        current["interface_language"] = code
        if current.get("qa_report_language_mode") == "workspace" and "qa_report_language" not in updates:
            current["qa_report_language"] = LANGUAGE_LABEL_BY_CODE.get(code, "English")
    if "qa_report_language_mode" in updates:
        mode = str(updates["qa_report_language_mode"] or "").strip()
        if mode not in {"workspace", "same_as_transcript", "custom"}:
            raise HTTPException(status_code=400, detail="qa_report_language_mode must be one of: workspace, same_as_transcript, custom")
        current["qa_report_language_mode"] = mode
    if "qa_report_language" in updates:
        language = str(updates["qa_report_language"] or "").strip()
        if not language:
            raise HTTPException(status_code=400, detail="qa_report_language must not be empty")
        current["qa_report_language"] = language
    current = _normalize_workspace_settings(current)
    setting = db.get(AppSetting, WORKSPACE_SETTINGS_KEY)
    if not setting:
        setting = AppSetting(key=WORKSPACE_SETTINGS_KEY, value=current)
        db.add(setting)
    else:
        setting.value = current
    db.commit()
    return current

def _provider_test_request(provider_type: str, base_url: str, model: str, api_key: str | None, timeout_seconds: float) -> dict:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    started = time.perf_counter()
    try:
        response = requests.post(
            f"{base_url.rstrip('/')}/chat/completions",
            headers=headers,
            json={"model": model, "temperature": 0, "messages": [{"role": "user", "content": "Return only JSON: {\"ok\": true}"}]},
            timeout=timeout_seconds,
        )
        latency_ms = int((time.perf_counter() - started) * 1000)
        if response.ok:
            return {"ok": True, "latency_ms": latency_ms, "model": model}

        provider_error: object
        try:
            provider_error = response.json()
        except ValueError:
            provider_error = (response.text or "")[:1000]
        return {
            "ok": False,
            "status_code": response.status_code,
            "latency_ms": latency_ms,
            "model": model,
            "provider_error": provider_error,
        }
    except requests.RequestException as exc:
        latency_ms = int((time.perf_counter() - started) * 1000)
        return {"ok": False, "latency_ms": latency_ms, "model": model, "provider_error": str(exc)[:300]}


@app.get("/health")
def health() -> dict[str, str]:
    logger.info("Health check requested")
    return {"status": "ok"}


@app.on_event("startup")
def on_startup() -> None:
    logging.basicConfig(level=logging.INFO)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    migrate_qa_reviews_table(engine)
    migrate_calls_table(engine)
    migrate_stt_provider_configs_table(engine)
    logger.info("CallQuanta API started")


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _normalize_optional_text(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _normalize_direction(value: str | None) -> str | None:
    normalized = _normalize_optional_text(value)
    if normalized is None:
        return None
    normalized = normalized.lower()
    if normalized not in {"inbound", "outbound", "internal", "unknown"}:
        raise HTTPException(status_code=400, detail="direction must be one of: inbound, outbound, internal, unknown")
    return normalized


def _original_filename_basename(filename: str | None) -> str:
    basename = re.split(r"[\\/]+", filename or "")[-1].strip()
    return "".join(char for char in basename if char.isprintable() and char not in {"\x7f"})


def _truncate_display_filename(filename: str, max_length: int = MAX_DISPLAY_FILENAME_LENGTH) -> str:
    if len(filename) <= max_length:
        return filename
    extension = Path(filename).suffix
    if extension and len(extension) < max_length:
        return f"{filename[: max_length - len(extension)]}{extension}"
    return filename[:max_length]


def _display_upload_filename(filename: str | None) -> str:
    display_name = _truncate_display_filename(_original_filename_basename(filename))
    if not display_name:
        raise HTTPException(status_code=400, detail="Invalid filename")
    return display_name


def _upload_extension(display_name: str) -> str:
    extension = Path(display_name).suffix.lower()
    if extension not in ALLOWED_UPLOAD_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_UPLOAD_EXTENSIONS))
        raise HTTPException(status_code=400, detail=f"Unsupported file extension. Allowed extensions: {allowed}")
    return extension


def _safe_storage_filename(display_name: str, extension: str) -> str:
    safe_name = secure_filename(display_name)
    if not safe_name or Path(safe_name).suffix.lower() != extension:
        stem = Path(safe_name).stem if safe_name else ""
        safe_name = f"{stem or 'upload'}{extension}"
    return safe_name


def _validate_upload_file(file: UploadFile) -> tuple[str, str]:
    display_name = _display_upload_filename(file.filename)
    extension = _upload_extension(display_name)

    content_type = (file.content_type or "").split(";", 1)[0].strip().lower()
    if (
        content_type
        and content_type != "application/octet-stream"
        and content_type not in ALLOWED_UPLOAD_CONTENT_TYPES
        and not content_type.startswith("audio/")
    ):
        raise HTTPException(status_code=400, detail="Unsupported file type")
    return display_name, _safe_storage_filename(display_name, extension)


def _format_upload_limit_message() -> str:
    return (
        "Upload too large. "
        f"Max per file: {MAX_UPLOAD_BYTES_PER_FILE / 1024 / 1024:.0f} MB. "
        f"Max bulk upload: {MAX_BULK_UPLOAD_BYTES / 1024 / 1024:.0f} MB."
    )


def _upload_size(file: UploadFile) -> int | None:
    size = getattr(file, "size", None)
    return int(size) if isinstance(size, int) and size >= 0 else None


def _validate_known_upload_sizes(files: list[UploadFile]) -> None:
    known_sizes = [_upload_size(file) for file in files]
    if MAX_UPLOAD_BYTES_PER_FILE:
        oversized = [size for size in known_sizes if size is not None and size > MAX_UPLOAD_BYTES_PER_FILE]
        if oversized:
            raise HTTPException(status_code=413, detail=_format_upload_limit_message())
    if MAX_BULK_UPLOAD_BYTES and all(size is not None for size in known_sizes):
        if sum(size or 0 for size in known_sizes) > MAX_BULK_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail=_format_upload_limit_message())


async def _store_upload_file(file: UploadFile, safe_name: str, bulk_state: dict[str, int] | None = None) -> tuple[str, Path, int]:
    stored_name = f"{uuid4().hex}_{safe_name}"
    stored_path = UPLOAD_DIR / stored_name
    size = 0

    with stored_path.open("wb") as handle:
        while True:
            chunk = await file.read(UPLOAD_CHUNK_SIZE)
            if not chunk:
                break
            size += len(chunk)
            if bulk_state is not None:
                bulk_state["size"] = bulk_state.get("size", 0) + len(chunk)
            if MAX_UPLOAD_BYTES_PER_FILE and size > MAX_UPLOAD_BYTES_PER_FILE:
                handle.close()
                stored_path.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail=_format_upload_limit_message())
            if bulk_state is not None and MAX_BULK_UPLOAD_BYTES and bulk_state.get("size", 0) > MAX_BULK_UPLOAD_BYTES:
                handle.close()
                stored_path.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail=_format_upload_limit_message())
            handle.write(chunk)

    if size == 0:
        stored_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    return stored_name, stored_path, size


def _apply_call_metadata(call: Call, metadata: CallMetadataPayload) -> None:
    call.agent_name = _normalize_optional_text(metadata.agent_name)
    call.team = _normalize_optional_text(metadata.team)
    call.campaign = _normalize_optional_text(metadata.campaign)
    call.direction = _normalize_direction(metadata.direction)
    normalized_language = normalize_stt_language(metadata.language)
    if normalized_language is not None and normalized_language not in SUPPORTED_STT_LANGUAGE_CODES:
        raise HTTPException(status_code=400, detail="Unsupported audio language")
    call.language = normalized_language


async def _create_uploaded_call(file: UploadFile, db: Session, metadata: CallMetadataPayload | None = None, bulk_state: dict[str, int] | None = None) -> Call:
    display_name, safe_name = _validate_upload_file(file)
    stored_name, stored_path, size = await _store_upload_file(file, safe_name, bulk_state)
    call = Call(
        filename=display_name,
        status="uploaded",
        stored_filename=stored_name,
        stored_path=str(stored_path),
        file_size_bytes=size,
        content_type=file.content_type,
    )
    if metadata:
        _apply_call_metadata(call, metadata)
    db.add(call)
    db.commit()
    db.refresh(call)
    return call


@app.post("/calls/upload")
async def upload_call(
    file: UploadFile = File(...),
    agent_name: str | None = Form(None),
    team: str | None = Form(None),
    campaign: str | None = Form(None),
    direction: str | None = Form(None),
    language: str | None = Form(None),
    db: Session = Depends(get_db),
) -> dict:
    metadata = CallMetadataPayload(
        agent_name=agent_name,
        team=team,
        campaign=campaign,
        direction=direction,
        language=language,
    )
    _normalize_direction(metadata.direction)
    _validate_known_upload_sizes([file])
    call = await _create_uploaded_call(file, db, metadata)
    return {"id": call.id, "filename": call.filename, "status": call.status}


@app.get("/settings/upload-limits")
def upload_limits() -> dict:
    return {
        "max_upload_bytes_per_file": MAX_UPLOAD_BYTES_PER_FILE,
        "max_bulk_upload_bytes": MAX_BULK_UPLOAD_BYTES,
        "allowed_extensions": sorted(ALLOWED_UPLOAD_EXTENSIONS),
    }


@app.post("/calls/upload/bulk")
async def upload_calls_bulk(
    files: list[UploadFile] = File(...),
    agent_name: str | None = Form(None),
    team: str | None = Form(None),
    campaign: str | None = Form(None),
    direction: str | None = Form(None),
    language: str | None = Form(None),
    db: Session = Depends(get_db),
) -> dict:
    metadata = CallMetadataPayload(
        agent_name=agent_name,
        team=team,
        campaign=campaign,
        direction=direction,
        language=language,
    )
    # Validate metadata and known sizes before storing any files so hard failures are returned consistently.
    _normalize_direction(metadata.direction)
    _validate_known_upload_sizes(files)

    uploaded: list[dict] = []
    failed: list[dict] = []
    bulk_state = {"size": 0}
    for file in files:
        filename = _truncate_display_filename(_original_filename_basename(file.filename)) or "unknown"
        try:
            call = await _create_uploaded_call(file, db, metadata, bulk_state)
            uploaded.append({"id": call.id, "filename": call.filename, "status": call.status})
        except HTTPException as exc:
            db.rollback()
            failed.append({"filename": filename, "error": str(exc.detail)})
        except Exception as exc:
            db.rollback()
            logger.exception("bulk upload failed for %s", filename)
            failed.append({"filename": filename, "error": str(exc) or "Upload failed"})
    return {"uploaded": uploaded, "failed": failed}


def serialize_call(call: Call) -> dict:
    return {
        "id": call.id,
        "filename": call.filename,
        "status": call.status,
        "stored_filename": call.stored_filename,
        "stored_path": call.stored_path,
        "file_size_bytes": call.file_size_bytes,
        "content_type": call.content_type,
        "agent_name": call.agent_name,
        "team": call.team,
        "campaign": call.campaign,
        "direction": call.direction,
        "language": call.language,
        "stt_provider_name": call.stt_provider_name,
        "stt_provider_type": call.stt_provider_type,
        "stt_model": call.stt_model,
        "stt_language_used": call.stt_language_used,
        "detected_language": call.detected_language,
        "created_at": call.created_at.isoformat() if call.created_at else None,
        "last_error_type": call.last_error_type,
        "last_error_message": call.last_error_message,
        "last_processed_at": call.last_processed_at.isoformat() if call.last_processed_at else None,
    }


@app.patch("/calls/{call_id}/metadata")
def patch_call_metadata(call_id: int, payload: CallMetadataPayload, db: Session = Depends(get_db)) -> dict:
    call = db.get(Call, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    _apply_call_metadata(call, payload)
    db.commit()
    db.refresh(call)
    return serialize_call(call)


def _group_key(value: str | None) -> str:
    return (value or "").strip() or "Unassigned"



CALL_FILTER_STATUSES = {
    "uploaded",
    "transcription_pending",
    "transcribing",
    "transcription_failed",
    "transcribed",
    "analysis_pending",
    "analyzing",
    "analysis_failed",
    "analyzed",
    "failed",
}
CALL_SORT_COLUMNS = {
    "id": Call.id,
    "filename": Call.filename,
    "status": Call.status,
    "agent_name": Call.agent_name,
    "team": Call.team,
    "campaign": Call.campaign,
    "direction": Call.direction,
    "language": Call.language,
    "file_size_bytes": Call.file_size_bytes,
    "created_at": Call.created_at,
    "last_processed_at": Call.last_processed_at,
}


def _clean_filter(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned or cleaned.lower() == "all":
        return None
    return cleaned


def _parse_created_bound(value: str | None, end_of_day: bool = False) -> datetime | None:
    cleaned = _clean_filter(value)
    if not cleaned:
        return None
    try:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", cleaned):
            parsed_date = datetime.fromisoformat(cleaned).date()
            return datetime.combine(parsed_date, datetime_time.max if end_of_day else datetime_time.min)
        return datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date filter: {value}")


def _apply_call_filters(
    stmt,
    *,
    q: str | None = None,
    status: str | None = None,
    agent_name: str | None = None,
    team: str | None = None,
    campaign: str | None = None,
    direction: str | None = None,
    language: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
):
    search = _clean_filter(q)
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(or_(Call.filename.ilike(pattern), Call.agent_name.ilike(pattern), Call.team.ilike(pattern), Call.campaign.ilike(pattern)))

    exact_filters = [
        (Call.status, _clean_filter(status), False),
        (Call.agent_name, _clean_filter(agent_name), False),
        (Call.team, _clean_filter(team), False),
        (Call.campaign, _clean_filter(campaign), False),
        (Call.direction, _clean_filter(direction), True),
        (Call.language, _clean_filter(language), True),
    ]
    for column, value, allow_empty_alias in exact_filters:
        if value is None:
            continue
        if allow_empty_alias and value.lower() in {"unknown", "empty", "auto"}:
            stmt = stmt.where(or_(column == value, column.is_(None), column == ""))
        else:
            stmt = stmt.where(column == value)

    from_dt = _parse_created_bound(created_from)
    to_dt = _parse_created_bound(created_to, end_of_day=True)
    if from_dt:
        stmt = stmt.where(Call.created_at >= from_dt)
    if to_dt:
        stmt = stmt.where(Call.created_at <= to_dt)
    return stmt


def _filtered_calls_statement(**filters):
    return _apply_call_filters(select(Call), **filters)


def _call_filter_query_params(
    q: str | None,
    status: str | None,
    agent_name: str | None,
    team: str | None,
    campaign: str | None,
    direction: str | None,
    language: str | None,
    created_from: str | None,
    created_to: str | None,
) -> dict:
    return {
        "q": q,
        "status": status,
        "agent_name": agent_name,
        "team": team,
        "campaign": campaign,
        "direction": direction,
        "language": language,
        "created_from": created_from,
        "created_to": created_to,
    }


def _get_latest_successful_reviews(db: Session, **filters) -> tuple[dict[int, Call], list[QAReview], dict[int, QAReview]]:
    calls = db.execute(_filtered_calls_statement(**filters)).scalars().all()
    calls_by_id = {call.id: call for call in calls}
    if not calls_by_id:
        return calls_by_id, [], {}
    successful_reviews = db.execute(
        select(QAReview)
        .where(QAReview.call_id.in_(list(calls_by_id.keys())), QAReview.status == "success", QAReview.score.is_not(None))
        .order_by(QAReview.call_id.asc(), QAReview.created_at.desc(), QAReview.id.desc())
    ).scalars().all()
    latest_by_call: dict[int, QAReview] = {}
    for review in successful_reviews:
        latest_by_call.setdefault(review.call_id, review)
    return calls_by_id, successful_reviews, latest_by_call


@app.get("/dashboard/metrics")
def dashboard_metrics(
    q: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    agent_name: str | None = None,
    team: str | None = None,
    campaign: str | None = None,
    direction: str | None = None,
    language: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    filters = _call_filter_query_params(q, None, agent_name, team, campaign, direction, language, created_from, created_to)
    calls_by_id, successful_reviews, latest_by_call = _get_latest_successful_reviews(db, **filters)
    calls = list(calls_by_id.values())

    total_calls = len(calls)
    uploaded_calls = sum(1 for c in calls if c.status and c.status.startswith("uploaded"))
    transcribed_calls = sum(1 for c in calls if c.status and c.status.startswith("transcribed"))
    analyzed_calls = len(latest_by_call)
    analysis_failed_calls = sum(1 for c in calls if c.status == "analysis_failed")
    filtered_call_ids = set(calls_by_id)
    total_qa_reviews = db.execute(select(QAReview.id).where(QAReview.call_id.in_(filtered_call_ids))).all() if filtered_call_ids else []

    latest_scores = [float(r.score) for r in latest_by_call.values() if r.score is not None]
    average_score = round(sum(latest_scores) / len(latest_scores), 2) if latest_scores else None
    lowest_score = min(latest_scores) if latest_scores else None
    highest_score = max(latest_scores) if latest_scores else None

    latest_reviews = sorted(latest_by_call.values(), key=lambda r: ((r.created_at.isoformat() if r.created_at else ""), r.id), reverse=True)[:5]
    latest_reviews_payload = []
    for review in latest_reviews:
        call = calls_by_id.get(review.call_id)
        latest_reviews_payload.append({
            "review_id": review.id,
            "call_id": review.call_id,
            "filename": call.filename if call else None,
            "created_at": review.created_at.isoformat() if review.created_at else None,
            "score": review.score,
            "agent_name": _group_key(call.agent_name if call else None),
            "team": _group_key(call.team if call else None),
            "campaign": _group_key(call.campaign if call else None),
            "provider_name": review.provider_name,
            "model": review.model,
            "scorecard_name": review.scorecard_name,
            "report_language": review.report_language,
            "summary": review.summary,
        })

    lowest_reviews = sorted(latest_by_call.values(), key=lambda r: (float(r.score), r.created_at, r.id))[:5]
    lowest_payload = []
    for review in lowest_reviews:
        call = calls_by_id.get(review.call_id)
        lowest_payload.append({
            "review_id": review.id,
            "call_id": review.call_id,
            "filename": call.filename if call else None,
            "created_at": review.created_at.isoformat() if review.created_at else None,
            "score": review.score,
            "agent_name": _group_key(call.agent_name if call else None),
            "team": _group_key(call.team if call else None),
            "campaign": _group_key(call.campaign if call else None),
            "summary": review.summary,
        })

    criteria_rollup: dict[str, dict] = {}
    for review in latest_by_call.values():
        for criterion in (review.criteria_breakdown or []):
            max_points = float(criterion.get("max_points") or 0)
            if max_points <= 0:
                continue
            title = str(criterion.get("title") or "Untitled criterion").strip() or "Untitled criterion"
            score = float(criterion.get("score") or 0)
            percent = (score / max_points) * 100 if max_points > 0 else 0
            severity = str(criterion.get("severity") or "").lower()
            item = criteria_rollup.setdefault(title, {"criterion_title": title, "reviews_count": 0, "score_sum": 0.0, "max_sum": 0.0, "percent_sum": 0.0, "warning_count": 0, "critical_count": 0})
            item["reviews_count"] += 1
            item["score_sum"] += score
            item["max_sum"] += max_points
            item["percent_sum"] += percent
            if severity == "warning":
                item["warning_count"] += 1
            if severity == "critical":
                item["critical_count"] += 1

    criteria_problem_summary = []
    for item in criteria_rollup.values():
        count = item["reviews_count"]
        criteria_problem_summary.append({
            "criterion_title": item["criterion_title"],
            "reviews_count": count,
            "average_score": round(item["score_sum"] / count, 2),
            "average_max_points": round(item["max_sum"] / count, 2),
            "average_percent": round(item["percent_sum"] / count, 2),
            "warning_count": item["warning_count"],
            "critical_count": item["critical_count"],
        })
    criteria_problem_summary.sort(key=lambda x: (x["average_percent"], -x["critical_count"], -x["warning_count"]))

    def build_group(group_field: str):
        groups: dict[str, dict] = {}
        for c in calls:
            key = _group_key(getattr(c, group_field))
            groups.setdefault(key, {group_field: key, "calls_count": 0, "analyzed_calls_count": 0, "scores": [], "latest_review_at": None})
            groups[key]["calls_count"] += 1
        for call_id, review in latest_by_call.items():
            call = calls_by_id.get(call_id)
            if not call:
                continue
            key = _group_key(getattr(call, group_field))
            item = groups.setdefault(key, {group_field: key, "calls_count": 0, "analyzed_calls_count": 0, "scores": [], "latest_review_at": None})
            item["analyzed_calls_count"] += 1
            item["scores"].append(float(review.score))
            if not item["latest_review_at"] or (review.created_at and review.created_at > item["latest_review_at"]):
                item["latest_review_at"] = review.created_at
        rows = []
        for key, item in groups.items():
            scores = item["scores"]
            rows.append({
                group_field: key,
                "calls_count": item["calls_count"],
                "analyzed_calls_count": item["analyzed_calls_count"],
                "average_score": round(sum(scores) / len(scores), 2) if scores else None,
                "lowest_score": min(scores) if scores else None,
                "highest_score": max(scores) if scores else None,
                "latest_review_at": item["latest_review_at"].isoformat() if item["latest_review_at"] else None,
            })
        rows.sort(key=lambda x: str(x[group_field]).lower())
        return rows

    return {
        "summary": {
            "total_calls": total_calls,
            "uploaded_calls": uploaded_calls,
            "transcribed_calls": transcribed_calls,
            "analyzed_calls": analyzed_calls,
            "analysis_failed_calls": analysis_failed_calls,
            "total_qa_reviews": len(total_qa_reviews),
            "average_score": average_score,
            "lowest_score": lowest_score,
            "highest_score": highest_score,
        },
        "latest_reviews": latest_reviews_payload,
        "lowest_score_reviews": lowest_payload,
        "criteria_problem_summary": criteria_problem_summary,
        "agent_metrics": build_group("agent_name"),
        "team_metrics": build_group("team"),
        "campaign_metrics": build_group("campaign"),
    }


@app.get("/dashboard/agent-metrics")
def dashboard_agent_metrics(db: Session = Depends(get_db)) -> dict:
    metrics = dashboard_metrics(db=db)
    return {"agents": metrics["agent_metrics"]}


@app.get("/calls")
def list_calls(
    q: str | None = None,
    status: str | None = None,
    agent_name: str | None = None,
    team: str | None = None,
    campaign: str | None = None,
    direction: str | None = None,
    language: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    db: Session = Depends(get_db),
) -> dict:
    filters = _call_filter_query_params(q, status, agent_name, team, campaign, direction, language, created_from, created_to)
    filtered = _filtered_calls_statement(**filters)
    total = db.execute(select(func.count()).select_from(filtered.subquery())).scalar_one()
    sort_column = CALL_SORT_COLUMNS.get(sort_by, Call.created_at)
    order = sort_column.asc() if sort_dir.lower() == "asc" else sort_column.desc()
    tie_breaker = Call.id.asc() if sort_dir.lower() == "asc" else Call.id.desc()
    calls = db.execute(filtered.order_by(order, tie_breaker).limit(limit).offset(offset)).scalars().all()
    return {"items": [serialize_call(call) for call in calls], "total": int(total), "limit": limit, "offset": offset}


@app.get("/calls/filter-options")
def call_filter_options(db: Session = Depends(get_db)) -> dict:
    def distinct_values(column):
        rows = db.execute(select(column).where(column.is_not(None), column != "").distinct().order_by(column.asc())).scalars().all()
        return [row for row in rows if str(row).strip()]

    statuses = set(CALL_FILTER_STATUSES)
    statuses.update(str(row) for row in db.execute(select(Call.status).where(Call.status.is_not(None)).distinct()).scalars().all() if str(row).strip())
    return {
        "agents": distinct_values(Call.agent_name),
        "teams": distinct_values(Call.team),
        "campaigns": distinct_values(Call.campaign),
        "directions": distinct_values(Call.direction),
        "languages": distinct_values(Call.language),
        "statuses": sorted(statuses),
    }


def _calls_csv_rows(calls: list[Call]) -> list[list]:
    return [[
        call.id,
        call.filename,
        call.status,
        call.agent_name or "",
        call.team or "",
        call.campaign or "",
        call.direction or "",
        call.language or "",
        call.file_size_bytes or "",
        call.content_type or "",
        call.created_at.isoformat() if call.created_at else "",
        call.last_processed_at.isoformat() if call.last_processed_at else "",
        call.last_error_message or "",
    ] for call in calls]


def _filtered_calls_for_export(db: Session, filters: dict) -> list[Call]:
    return db.execute(_filtered_calls_statement(**filters).order_by(Call.created_at.desc(), Call.id.desc())).scalars().all()


@app.get("/calls/export")
def export_calls(
    format: str = Query("csv", pattern="^(xlsx|csv)$"),
    q: str | None = None,
    status: str | None = None,
    agent_name: str | None = None,
    team: str | None = None,
    campaign: str | None = None,
    direction: str | None = None,
    language: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    db: Session = Depends(get_db),
):
    calls = _filtered_calls_for_export(db, _call_filter_query_params(q, status, agent_name, team, campaign, direction, language, created_from, created_to))
    headers = ["ID", "Filename", "Status", "Agent", "Team", "Campaign", "Direction", "Language", "File size bytes", "Content type", "Created at", "Last processed at", "Last error"]
    safe_name = "callquanta-filtered-calls"
    if format == "csv":
        buf = StringIO(); buf.write("\ufeff")
        writer = csv.writer(buf); writer.writerow(headers); writer.writerows(_calls_csv_rows(calls))
        return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{safe_name}.csv"'})
    wb = Workbook(); ws = wb.active; ws.title = "Calls"; ws.append(headers)
    for row in _calls_csv_rows(calls): ws.append(row)
    out = BytesIO(); wb.save(out); out.seek(0)
    return StreamingResponse(out, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="{safe_name}.xlsx"'})


@app.get("/qa-reviews/export")
def export_filtered_reviews(
    format: str = Query("csv", pattern="^(xlsx|csv)$"),
    q: str | None = None,
    status: str | None = None,
    agent_name: str | None = None,
    team: str | None = None,
    campaign: str | None = None,
    direction: str | None = None,
    language: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    db: Session = Depends(get_db),
):
    calls = _filtered_calls_for_export(db, _call_filter_query_params(q, status, agent_name, team, campaign, direction, language, created_from, created_to))
    calls_by_id = {call.id: call for call in calls}
    reviews = db.execute(select(QAReview).where(QAReview.call_id.in_(list(calls_by_id.keys()))).order_by(QAReview.created_at.desc(), QAReview.id.desc())).scalars().all() if calls_by_id else []
    headers = ["Review ID", "Call ID", "Filename", "Review created at", "Status", "Score", "Agent", "Team", "Campaign", "Provider", "Model", "Scorecard", "Summary"]
    rows = [[r.id, r.call_id, calls_by_id[r.call_id].filename, r.created_at.isoformat() if r.created_at else "", r.status, r.score if r.score is not None else "", calls_by_id[r.call_id].agent_name or "", calls_by_id[r.call_id].team or "", calls_by_id[r.call_id].campaign or "", r.provider_name or "", r.model or "", r.scorecard_name or "", r.summary or ""] for r in reviews]
    safe_name = "callquanta-filtered-qa-reviews"
    if format == "csv":
        buf = StringIO(); buf.write("\ufeff")
        writer = csv.writer(buf); writer.writerow(headers); writer.writerows(rows)
        return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{safe_name}.csv"'})
    wb = Workbook(); ws = wb.active; ws.title = "QA reviews"; ws.append(headers)
    for row in rows: ws.append(row)
    out = BytesIO(); wb.save(out); out.seek(0)
    return StreamingResponse(out, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="{safe_name}.xlsx"'})


def _enqueue_job(queue_name: str, payload: dict) -> tuple[bool, str | None]:
    try:
        redis_client.lpush(queue_name, json.dumps(payload))
        return True, None
    except redis.RedisError as exc:
        logger.warning("Redis enqueue failed for %s: %s", queue_name, exc)
        return False, "Queue backend is unavailable"


def _queue_length(queue_name: str) -> tuple[int, str | None]:
    try:
        return int(redis_client.llen(queue_name)), None
    except redis.RedisError as exc:
        logger.warning("Redis LLEN failed for %s: %s", queue_name, exc)
        return 0, "Redis unavailable; queue lengths are reported as 0."


def _status_counts(db: Session) -> dict[str, int]:
    statuses = [
        "uploaded",
        "transcription_pending",
        "transcribing",
        "transcription_failed",
        "transcribed",
        "analysis_pending",
        "analyzing",
        "analysis_failed",
        "analyzed",
        "failed",
    ]
    counts = {status: 0 for status in statuses}
    rows = db.execute(select(Call.status, func.count(Call.id)).group_by(Call.status)).all()
    for status, count in rows:
        status_key = str(status)
        if status_key in counts:
            counts[status_key] = int(count)
    return counts


@app.get("/calls/processing-summary")
def calls_processing_summary(db: Session = Depends(get_db)) -> dict:
    return _status_counts(db)


@app.get("/jobs/summary")
def jobs_summary(db: Session = Depends(get_db)) -> dict:
    transcription_queue_length, transcription_warning = _queue_length(TRANSCRIPTION_QUEUE)
    qa_queue_length, qa_warning = _queue_length(QA_QUEUE)
    counts = _status_counts(db)
    warnings = [warning for warning in {transcription_warning, qa_warning} if warning]
    payload = {
        "transcription_queue_length": transcription_queue_length,
        "qa_queue_length": qa_queue_length,
        "processing": {
            "transcribing": counts["transcribing"],
            "analyzing": counts["analyzing"],
        },
        "failed": {
            "transcription_failed": counts["transcription_failed"],
            "analysis_failed": counts["analysis_failed"],
            "failed": counts["failed"],
        },
        "pending": {
            "transcription_pending": counts["transcription_pending"],
            "analysis_pending": counts["analysis_pending"],
        },
    }
    if warnings:
        payload["warning"] = " ".join(warnings)
    return payload


def _unique_call_ids(call_ids: list[int]) -> list[int]:
    seen: set[int] = set()
    unique: list[int] = []
    for call_id in call_ids:
        if call_id in seen:
            continue
        seen.add(call_id)
        unique.append(call_id)
    return unique


@app.post("/calls/batch/transcribe")
def batch_transcribe_calls(payload: BatchCallsPayload, db: Session = Depends(get_db)) -> dict:
    results: list[dict] = []
    for call_id in _unique_call_ids(payload.call_ids):
        call = db.get(Call, call_id)
        if not call:
            results.append({"call_id": call_id, "status": "not_found", "error": "Call not found"})
            continue
        if call.status in {"transcription_pending", "transcribing"}:
            results.append({"call_id": call_id, "status": "skipped", "reason": "Transcription already pending or processing"})
            continue
        if call.status in {"analysis_pending", "analyzing"}:
            results.append({"call_id": call_id, "status": "skipped", "reason": "Call is already in another workflow"})
            continue
        call.status = "transcription_pending"
        call.last_error_type = None
        call.last_error_message = None
        db.commit()
        queued, warning = _enqueue_job(TRANSCRIPTION_QUEUE, {"call_id": call_id})
        if queued:
            results.append({"call_id": call_id, "status": "transcription_queued"})
        else:
            call.status = "transcription_failed"
            call.last_error_type = "queue_unavailable"
            call.last_error_message = warning
            db.commit()
            results.append({"call_id": call_id, "status": "failed", "reason": warning})
    return {"results": results}


@app.post("/calls/batch/analyze")
def batch_analyze_calls(payload: BatchCallsPayload, db: Session = Depends(get_db)) -> dict:
    results: list[dict] = []
    for call_id in _unique_call_ids(payload.call_ids):
        call = db.get(Call, call_id)
        if not call:
            results.append({"call_id": call_id, "status": "not_found", "error": "Call not found"})
            continue
        if call.status in {"analysis_pending", "analyzing"}:
            results.append({"call_id": call_id, "status": "skipped", "reason": "Analysis already pending or processing"})
            continue
        has_segments = db.execute(select(TranscriptSegment.id).where(TranscriptSegment.call_id == call_id).limit(1)).first()
        if not has_segments:
            results.append({"call_id": call_id, "status": "skipped", "reason": "Call has no transcript segments"})
            continue
        call.status = "analysis_pending"
        call.last_error_type = None
        call.last_error_message = None
        db.commit()
        queued, warning = _enqueue_job(QA_QUEUE, {"call_id": call_id})
        if queued:
            results.append({"call_id": call_id, "status": "analysis_queued"})
        else:
            call.status = "analysis_failed"
            call.last_error_type = "queue_unavailable"
            call.last_error_message = warning
            db.commit()
            results.append({"call_id": call_id, "status": "failed", "reason": warning})
    return {"results": results}



@app.patch("/calls/batch/metadata")
def batch_patch_call_metadata(payload: BatchMetadataPayload, db: Session = Depends(get_db)) -> dict:
    updates = payload.model_dump(exclude={"call_ids"}, exclude_unset=True)
    updates = {key: value for key, value in updates.items() if value is not None and (not isinstance(value, str) or value.strip())}
    results: list[dict] = []
    for call_id in _unique_call_ids(payload.call_ids):
        call = db.get(Call, call_id)
        if not call:
            results.append({"call_id": call_id, "status": "not_found", "error": "Call not found"})
            continue
        if "agent_name" in updates:
            call.agent_name = _normalize_optional_text(updates["agent_name"])
        if "team" in updates:
            call.team = _normalize_optional_text(updates["team"])
        if "campaign" in updates:
            call.campaign = _normalize_optional_text(updates["campaign"])
        if "direction" in updates:
            call.direction = _normalize_direction(updates["direction"])
        if "language" in updates:
            normalized_language = normalize_stt_language(updates["language"])
            if normalized_language is not None and normalized_language not in SUPPORTED_STT_LANGUAGE_CODES:
                raise HTTPException(status_code=400, detail="Unsupported audio language")
            call.language = normalized_language
        results.append({"call_id": call_id, "status": "updated"})
    db.commit()
    return {"results": results}


@app.delete("/calls/batch")
def batch_delete_calls(payload: BatchDeletePayload, db: Session = Depends(get_db)) -> dict:
    results: list[dict] = []
    for call_id in _unique_call_ids(payload.call_ids):
        call = db.get(Call, call_id)
        if not call:
            results.append({"call_id": call_id, "status": "not_found", "error": "Call not found"})
            continue
        file_error = None
        if payload.delete_files and call.stored_path:
            try:
                path = Path(call.stored_path)
                if not path.is_absolute():
                    path = Path.cwd() / path
                if path.exists() and path.is_file():
                    path.unlink()
            except OSError as exc:
                file_error = str(exc)
        db.execute(delete(TranscriptSegment).where(TranscriptSegment.call_id == call_id))
        db.execute(delete(QAReview).where(QAReview.call_id == call_id))
        db.delete(call)
        results.append({"call_id": call_id, "status": "deleted", **({"file_error": file_error} if file_error else {})})
    db.commit()
    return {"results": results}


@app.post("/calls/batch/retry-failed")
def batch_retry_failed_calls(payload: BatchCallsPayload, db: Session = Depends(get_db)) -> dict:
    results: list[dict] = []
    for call_id in _unique_call_ids(payload.call_ids):
        call = db.get(Call, call_id)
        if not call:
            results.append({"call_id": call_id, "status": "not_found", "error": "Call not found"})
            continue
        if call.status in {"transcription_failed", "failed"}:
            call.status = "transcription_pending"
            call.last_error_type = None
            call.last_error_message = None
            db.commit()
            queued, warning = _enqueue_job(TRANSCRIPTION_QUEUE, {"call_id": call_id})
            if queued:
                results.append({"call_id": call_id, "status": "transcription_queued"})
            else:
                call.status = "transcription_failed"
                call.last_error_type = "queue_unavailable"
                call.last_error_message = warning
                db.commit()
                results.append({"call_id": call_id, "status": "failed", "reason": warning})
            continue
        if call.status == "analysis_failed":
            has_segments = db.execute(select(TranscriptSegment.id).where(TranscriptSegment.call_id == call_id).limit(1)).first()
            if not has_segments:
                results.append({"call_id": call_id, "status": "skipped", "reason": "Call has no transcript segments"})
                continue
            call.status = "analysis_pending"
            call.last_error_type = None
            call.last_error_message = None
            db.commit()
            queued, warning = _enqueue_job(QA_QUEUE, {"call_id": call_id})
            if queued:
                results.append({"call_id": call_id, "status": "analysis_queued"})
            else:
                call.status = "analysis_failed"
                call.last_error_type = "queue_unavailable"
                call.last_error_message = warning
                db.commit()
                results.append({"call_id": call_id, "status": "failed", "reason": warning})
            continue
        results.append({"call_id": call_id, "status": "skipped", "reason": "Call is not in a failed status"})
    return {"results": results}

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
    call.last_error_type = None
    call.last_error_message = None
    db.commit()

    queued, warning = _enqueue_job(TRANSCRIPTION_QUEUE, {"call_id": call_id})
    if not queued:
        call.status = "transcription_failed"
        call.last_error_type = "queue_unavailable"
        call.last_error_message = warning
        db.commit()
        raise HTTPException(status_code=503, detail=warning)
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
    call.last_error_type = None
    call.last_error_message = None
    db.commit()

    queued, warning = _enqueue_job(QA_QUEUE, {"call_id": call_id})
    if not queued:
        call.status = "analysis_failed"
        call.last_error_type = "queue_unavailable"
        call.last_error_message = warning
        db.commit()
        raise HTTPException(status_code=503, detail=warning)
    return {"call_id": call_id, "status": "analysis_queued"}


@app.get("/calls/{call_id}/qa")
def get_call_qa(call_id: int, db: Session = Depends(get_db)) -> dict:
    call = db.get(Call, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    review = db.execute(
        select(QAReview)
        .where(QAReview.call_id == call_id, QAReview.status == "success")
        .order_by(QAReview.created_at.desc(), QAReview.id.desc())
    ).scalars().first()
    if not review:
        return {"call_id": call_id, "status": call.status, "review": None}

    return {"call_id": call_id, "status": call.status, "review": serialize_review_full(review, db)}


def serialize_review_compact(review: QAReview) -> dict:
    has_metadata = any([review.provider_name, review.model, review.scorecard_name, review.report_language])
    has_details = bool(review.criteria_breakdown) or bool(review.findings)
    legacy_review = not has_metadata and not has_details
    return {
        "id": review.id,
        "created_at": review.created_at.isoformat() if review.created_at else None,
        "status": review.status,
        "score": review.score,
        "provider_name": review.provider_name,
        "model": review.model,
        "scorecard_name": review.scorecard_name,
        "report_language": review.report_language,
        "analysis_mode": review.analysis_mode,
        "legacy_review": legacy_review,
    }


def _legacy_findings_table_exists(db: Session) -> bool:
    cached = getattr(db.bind, "_qa_findings_exists", None)
    if cached is not None:
        return bool(cached)
    try:
        db.execute(text("SELECT 1 FROM qa_findings LIMIT 1"))
        setattr(db.bind, "_qa_findings_exists", True)
        return True
    except Exception:
        setattr(db.bind, "_qa_findings_exists", False)
        return False


def _legacy_review_details(review: QAReview, db: Session) -> tuple[list[dict], list[dict], dict]:
    criteria: list[dict] = []
    findings: list[dict] = []
    metadata: dict[str, str] = {}
    if not _legacy_findings_table_exists(db):
        return criteria, findings, metadata
    rows = db.execute(
        text("SELECT severity, evidence FROM qa_findings WHERE qa_review_id = :review_id ORDER BY id ASC"),
        {"review_id": review.id},
    ).mappings().all()
    for row in rows:
        severity = row.get("severity") or "info"
        evidence = row.get("evidence") or ""
        if evidence.startswith("[criterion:") and "]" in evidence:
            marker, _, remainder = evidence.partition("]")
            criteria.append(
                {
                    "id": f"legacy_{len(criteria) + 1}",
                    "title": marker[len("[criterion:") :].strip() or "Legacy criterion",
                    "score": "",
                    "max_points": "",
                    "comment": remainder.strip() or "Legacy criterion detail.",
                    "evidence": evidence,
                    "severity": severity,
                }
            )
            continue
        if evidence.lower().startswith("analysis mode:"):
            for chunk in evidence.split(";"):
                key, _, value = chunk.partition(":")
                if value:
                    metadata[key.strip().lower()] = value.strip()
        findings.append({"severity": severity, "evidence": evidence})
    return criteria, findings, metadata


def serialize_review_full(review: QAReview, db: Session) -> dict:
    criteria = review.criteria_breakdown or []
    findings = review.findings or []
    metadata_fallback: dict[str, str] = {}
    if not criteria and not findings:
        criteria, findings, metadata_fallback = _legacy_review_details(review, db)
    return {
        **serialize_review_compact(review),
        "summary": review.summary,
        "provider_preset": review.provider_preset or metadata_fallback.get("preset"),
        "provider_name": review.provider_name or metadata_fallback.get("provider"),
        "model": review.model or metadata_fallback.get("model"),
        "scorecard_name": review.scorecard_name or metadata_fallback.get("scorecard"),
        "report_language": review.report_language or metadata_fallback.get("report language"),
        "analysis_mode": review.analysis_mode or metadata_fallback.get("analysis mode"),
        "criteria": criteria,
        "findings": findings,
        "error_message": review.error_message,
    }


@app.get("/calls/{call_id}/qa/reviews")
def list_call_reviews(call_id: int, db: Session = Depends(get_db)) -> dict:
    call = db.get(Call, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    reviews = db.execute(select(QAReview).where(QAReview.call_id == call_id).order_by(QAReview.created_at.desc(), QAReview.id.desc())).scalars().all()
    return {"call_id": call_id, "reviews": [serialize_review_compact(r) for r in reviews]}


def _sanitize_filename(name: str) -> str:
    return secure_filename(name) or "export"


def _review_rows(call: Call, reviews: list[QAReview]) -> list[dict]:
    rows = []
    for review in reviews:
        criteria = review.criteria_breakdown or []
        if not criteria:
            rows.append({"review": review, "criterion": {}})
            continue
        for idx, c in enumerate(criteria, start=1):
            rows.append({"review": review, "criterion": {**c, "index": idx}})
    return rows


@app.get("/calls/{call_id}/qa/reviews/export")
def export_call_reviews(call_id: int, format: str = Query("xlsx", pattern="^(xlsx|csv|json)$"), db: Session = Depends(get_db)):
    call = db.get(Call, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    reviews = db.execute(select(QAReview).where(QAReview.call_id == call_id).order_by(QAReview.created_at.desc(), QAReview.id.desc())).scalars().all()
    return _export_reviews(call, reviews, format, f"callquanta-call-{call_id}-qa-history", db)


@app.get("/calls/{call_id}/qa/reviews/{review_id}")
def get_call_review(call_id: int, review_id: int, db: Session = Depends(get_db)) -> dict:
    review = db.get(QAReview, review_id)
    if not review or review.call_id != call_id:
        raise HTTPException(status_code=404, detail="Review not found")
    return {"call_id": call_id, "review": serialize_review_full(review, db)}


@app.get("/calls/{call_id}/qa/reviews/{review_id}/export")
def export_single_review(call_id: int, review_id: int, format: str = Query("xlsx", pattern="^(xlsx|csv|json)$"), db: Session = Depends(get_db)):
    call = db.get(Call, call_id)
    review = db.get(QAReview, review_id)
    if not call or not review or review.call_id != call_id:
        raise HTTPException(status_code=404, detail="Review not found")
    return _export_reviews(call, [review], format, f"callquanta-call-{call_id}-review-{review_id}", db)


def _export_reviews(call: Call, reviews: list[QAReview], format: str, filename_root: str, db: Session):
    safe_name = _sanitize_filename(filename_root)
    if format == "json":
        payload = [{"call_id": call.id, "filename": call.filename, **serialize_review_full(r, db)} for r in reviews]
        data = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        return StreamingResponse(BytesIO(data), media_type="application/json", headers={"Content-Disposition": f'attachment; filename="{safe_name}.json"'})
    if format == "csv":
        buf = StringIO()
        buf.write("\ufeff")
        headers = [
            "Review ID", "Call ID", "Filename", "Created at", "Score",
            "Provider", "Model", "Scorecard", "Report language",
            "Criterion #", "Criterion title", "Criterion score",
            "Criterion max points", "Comment", "Evidence",
        ]
        writer = csv.writer(buf)
        writer.writerow(headers)

        for row in _review_rows(call, reviews):
            r = row["review"]
            c = row["criterion"]
            vals = [
                r.id,
                call.id,
                call.filename,
                r.created_at.isoformat() if r.created_at else "",
                r.score if r.score is not None else "",
                r.provider_name or "",
                r.model or "",
                r.scorecard_name or "",
                r.report_language or "",
                c.get("index", ""),
                c.get("title", ""),
                c.get("score", ""),
                c.get("max_points", ""),
                c.get("comment", ""),
                c.get("evidence", ""),
            ]
            writer.writerow(vals)

        return StreamingResponse(
            iter([buf.getvalue()]),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.csv"'},
        )
    wb=Workbook(); ws=wb.active; ws.title="Summary"
    ws.append(["Review ID","Call ID","Filename","Created at","Status","Score","Provider","Model","Scorecard","Report language","Summary"])
    for r in reviews:
        ws.append([r.id,call.id,call.filename,r.created_at.isoformat() if r.created_at else "",r.status,r.score,r.provider_name,r.model,r.scorecard_name,r.report_language,r.summary])
    wc=wb.create_sheet("Criteria breakdown"); wc.append(["Review ID","Criterion #","Criterion title","Severity / level","Score","Max points","Comment","Evidence"])
    wf=wb.create_sheet("Findings"); wf.append(["Review ID","Severity / level","Finding text"])
    for r in reviews:
        for i,c in enumerate(r.criteria_breakdown or [], start=1):
            wc.append([r.id,i,c.get("title"),c.get("severity"),c.get("score"),c.get("max_points"),c.get("comment"),c.get("evidence")])
        for f in r.findings or []:
            wf.append([r.id,f.get("severity"),f.get("evidence")])
    out=BytesIO(); wb.save(out); out.seek(0)
    return StreamingResponse(out, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="{safe_name}.xlsx"'})




@app.get("/settings/languages")
def list_languages() -> list[dict]:
    return LANGUAGE_CATALOG


@app.get("/settings/stt-languages")
def list_stt_languages() -> list[dict]:
    return SUPPORTED_STT_LANGUAGES



def serialize_stt_provider_config(provider: SttProviderConfig) -> dict:
    return {
        "id": provider.id,
        "name": provider.name,
        "provider_type": provider.provider_type,
        "preset": provider.preset,
        "base_url": provider.base_url or "",
        "model": provider.model or "",
        "timeout_seconds": provider.timeout_seconds,
        "is_active": bool(provider.is_active),
        "api_key_configured": bool(provider.api_key),
        "created_at": provider.created_at.isoformat() if provider.created_at else None,
        "updated_at": provider.updated_at.isoformat() if provider.updated_at else None,
    }


def _active_stt_provider(db: Session) -> SttProviderConfig | None:
    return db.execute(select(SttProviderConfig).where(SttProviderConfig.is_active.is_(True)).order_by(SttProviderConfig.id.asc())).scalars().first()


def _validate_stt_provider_payload(payload: SttProviderUpsertRequest) -> None:
    if payload.provider_type not in STT_PROVIDER_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported STT provider_type")
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="STT provider name is required")
    if not payload.model.strip() and payload.provider_type != "custom":
        raise HTTPException(status_code=400, detail="STT model is required")
    if payload.provider_type in {"openai_compatible_audio", "groq_whisper", "deepgram", "assemblyai", "google_speech", "azure_speech"} and not (payload.api_key or payload.id):
        raise HTTPException(status_code=400, detail="API key is required for this hosted STT provider")
    if payload.timeout_seconds < 10:
        raise HTTPException(status_code=400, detail="timeout_seconds must be at least 10")


def _stt_provider_test_response(provider_type: str, model: str, base_url: str | None, api_key: str | None, timeout_seconds: int) -> dict:
    started = time.perf_counter()
    latency_ms = lambda: int((time.perf_counter() - started) * 1000)
    provider_type = (provider_type or "").strip()
    if provider_type not in STT_PROVIDER_TYPES:
        return {"ok": False, "latency_ms": latency_ms(), "provider_error": "Unsupported STT provider_type"}
    if provider_type == "faster_whisper_local":
        return {
            "ok": True,
            "latency_ms": latency_ms(),
            "model": model or os.environ.get("FASTER_WHISPER_MODEL", "base"),
            "provider_type": provider_type,
            "note": f"Configuration is valid. Worker will load model on demand using device={os.environ.get('FASTER_WHISPER_DEVICE', 'cpu')}.",
        }
    if provider_type == "openai_compatible_audio":
        if not api_key:
            return {"ok": False, "latency_ms": latency_ms(), "model": model, "provider_error": "API key is required."}
        if not (base_url or "").strip():
            return {"ok": False, "latency_ms": latency_ms(), "model": model, "provider_error": "Base URL is required."}
        if not (model or "").strip():
            return {"ok": False, "latency_ms": latency_ms(), "model": model, "provider_error": "Model is required."}
        return {
            "ok": True,
            "latency_ms": latency_ms(),
            "model": model,
            "provider_type": provider_type,
            "note": "Configuration validated. Provider test does not upload audio; transcription will call /audio/transcriptions.",
        }
    if provider_type in {"groq_whisper", "deepgram", "assemblyai", "google_speech", "azure_speech"}:
        if not api_key:
            return {"ok": False, "latency_ms": latency_ms(), "model": model, "provider_error": "API key is required for this hosted STT preset."}
        return {
            "ok": True,
            "latency_ms": latency_ms(),
            "model": model,
            "provider_type": provider_type,
            "note": "Configuration saved for future use. This STT provider integration is not implemented yet.",
        }
    return {
        "ok": True,
        "latency_ms": latency_ms(),
        "model": model,
        "provider_type": provider_type,
        "note": "Custom STT provider settings validated as a placeholder. Runtime transcription is not implemented yet.",
    }


@app.get("/settings/stt/providers")
def list_stt_providers(db: Session = Depends(get_db)) -> dict:
    providers = db.execute(select(SttProviderConfig).order_by(SttProviderConfig.id.asc())).scalars().all()
    return {"presets": STT_PROVIDER_PRESETS, "saved": [serialize_stt_provider_config(item) for item in providers]}


@app.post("/settings/stt/providers")
def upsert_stt_provider(payload: SttProviderUpsertRequest, db: Session = Depends(get_db)) -> dict:
    _validate_stt_provider_payload(payload)
    provider = db.get(SttProviderConfig, payload.id) if payload.id else None
    if provider is None:
        provider = SttProviderConfig(name=payload.name.strip(), provider_type=payload.provider_type, preset=payload.preset, model=payload.model.strip(), timeout_seconds=payload.timeout_seconds)
        db.add(provider)
    api_key = payload.api_key if payload.api_key is not None else provider.api_key
    provider.name = payload.name.strip()
    provider.provider_type = payload.provider_type
    provider.preset = payload.preset.strip() or "custom"
    provider.model = payload.model.strip()
    provider.base_url = (payload.base_url or "").strip().rstrip("/") or None
    provider.api_key = api_key or None
    provider.timeout_seconds = int(payload.timeout_seconds)
    provider.is_active = bool(payload.is_active)
    if provider.is_active:
        db.flush()
        others = db.execute(select(SttProviderConfig).where(SttProviderConfig.id != provider.id)).scalars().all()
        for other in others:
            other.is_active = False
    db.commit()
    db.refresh(provider)
    return serialize_stt_provider_config(provider)


@app.post("/settings/stt/providers/{provider_id}/activate")
def activate_stt_provider(provider_id: int, db: Session = Depends(get_db)) -> dict:
    provider = db.get(SttProviderConfig, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="STT provider not found")
    providers = db.execute(select(SttProviderConfig)).scalars().all()
    for item in providers:
        item.is_active = item.id == provider_id
    db.commit()
    db.refresh(provider)
    return serialize_stt_provider_config(provider)


@app.post("/settings/stt/providers/test")
def test_stt_provider(payload: SttProviderTestRequest) -> dict:
    return _stt_provider_test_response(payload.provider_type, payload.model, payload.base_url, payload.api_key, payload.timeout_seconds)


@app.post("/settings/stt/providers/{provider_id}/test")
def test_saved_stt_provider(provider_id: int, db: Session = Depends(get_db)) -> dict:
    provider = db.get(SttProviderConfig, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="STT provider not found")
    return _stt_provider_test_response(provider.provider_type, provider.model, provider.base_url, provider.api_key, provider.timeout_seconds)


@app.delete("/settings/stt/providers/{provider_id}")
def delete_stt_provider(provider_id: int, db: Session = Depends(get_db)) -> dict:
    provider = db.get(SttProviderConfig, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="STT provider not found")
    db.delete(provider)
    db.commit()
    return {"ok": True}

@app.get("/settings/stt")
def get_stt_settings(db: Session = Depends(get_db)) -> dict:
    active = _active_stt_provider(db)
    if active:
        return {
            "mode": active.provider_type,
            "model": active.model,
            "provider": serialize_stt_provider_config(active),
        }
    return {
        "mode": os.environ.get("STT_MODE", "placeholder"),
        "model": os.environ.get("FASTER_WHISPER_MODEL", "base"),
        "provider": None,
    }


@app.get("/settings/workspace")
def get_workspace_settings(db: Session = Depends(get_db)) -> dict:
    return _get_workspace_settings(db)


@app.patch("/settings/workspace")
def patch_workspace_settings(payload: WorkspaceSettingsPayload, db: Session = Depends(get_db)) -> dict:
    return _upsert_workspace_settings(db, payload)

def serialize_provider_config(provider: ProviderConfig) -> dict:
    config = provider.config or {}
    return {
        "id": provider.id,
        "name": provider.name,
        "provider_type": provider.provider_type,
        "preset": config.get("preset", "custom"),
        "base_url": config.get("base_url", ""),
        "model": config.get("model", ""),
        "timeout_seconds": config.get("timeout_seconds", 180),
        "is_active": bool(config.get("is_active", False)),
        "api_key_configured": bool(config.get("api_key")),
    }


def _load_default_scorecard() -> dict:
    if not DEFAULT_SCORECARD_PATH.exists():
        message = f"Default scorecard file not found: {DEFAULT_SCORECARD_PATH}"
        logger.error(message)
        raise HTTPException(status_code=500, detail=message)

    try:
        with DEFAULT_SCORECARD_PATH.open("r", encoding="utf-8") as handle:
            data = yaml.safe_load(handle) or {}
    except OSError as exc:
        logger.exception("Failed to read default scorecard file: %s", DEFAULT_SCORECARD_PATH)
        raise HTTPException(status_code=500, detail=f"Failed to read default scorecard file: {DEFAULT_SCORECARD_PATH}") from exc

    if not isinstance(data, dict) or not isinstance(data.get("criteria"), list):
        raise HTTPException(status_code=500, detail="Default scorecard is invalid")
    data.setdefault("name", "Default Sales QA")
    data.setdefault("report_language", "workspace")
    return data


def _validate_scorecard(payload: ScorecardPayload) -> None:
    if not payload.criteria:
        raise HTTPException(status_code=400, detail="Criteria list must not be empty")
    total_max = 0.0
    for criterion in payload.criteria:
        if not criterion.title.strip():
            raise HTTPException(status_code=400, detail="Criterion title must not be empty")
        if criterion.max_points <= 0:
            raise HTTPException(status_code=400, detail="Criterion max_points must be greater than 0")
        total_max += criterion.max_points
    if total_max <= 0:
        raise HTTPException(status_code=400, detail="Total max score must be greater than 0")
    if payload.report_language in {"english", "russian", "same_as_transcript", "workspace"}:
        return
    if not payload.report_language.strip():
        raise HTTPException(status_code=400, detail="Invalid report_language")


@app.get("/settings/scorecard")
def get_scorecard_settings(db: Session = Depends(get_db)) -> dict:
    scorecard = db.execute(select(ScorecardConfig).order_by(ScorecardConfig.id.desc())).scalars().first()
    if scorecard and isinstance(scorecard.config, dict):
        return scorecard.config
    return _load_default_scorecard()


@app.post("/settings/scorecard")
def upsert_scorecard_settings(payload: ScorecardPayload, db: Session = Depends(get_db)) -> dict:
    _validate_scorecard(payload)
    scorecard = db.execute(select(ScorecardConfig).order_by(ScorecardConfig.id.desc())).scalars().first()
    if not scorecard:
        scorecard = ScorecardConfig(name=payload.name.strip() or "Scorecard", config={})
        db.add(scorecard)
    scorecard.name = payload.name.strip() or "Scorecard"
    scorecard.config = payload.model_dump()
    db.commit()
    db.refresh(scorecard)
    return scorecard.config


@app.post("/settings/scorecard/reset")
def reset_scorecard_settings(db: Session = Depends(get_db)) -> dict:
    default_scorecard = _load_default_scorecard()
    payload = ScorecardPayload(**default_scorecard)
    _validate_scorecard(payload)

    scorecard = db.execute(select(ScorecardConfig).order_by(ScorecardConfig.id.desc())).scalars().first()
    if not scorecard:
        scorecard = ScorecardConfig(name=payload.name.strip() or "Scorecard", config={})
        db.add(scorecard)

    scorecard.name = payload.name.strip() or "Scorecard"
    scorecard.config = payload.model_dump()
    db.commit()
    db.refresh(scorecard)
    return scorecard.config


@app.get("/settings/llm/providers")
def list_llm_providers(db: Session = Depends(get_db)) -> dict:
    providers = db.execute(select(ProviderConfig).order_by(ProviderConfig.id.asc())).scalars().all()
    return {"presets": PROVIDER_PRESETS, "saved": [serialize_provider_config(item) for item in providers]}


@app.post("/settings/llm/providers")
def upsert_llm_provider(payload: ProviderUpsertRequest, db: Session = Depends(get_db)) -> dict:
    provider = db.get(ProviderConfig, payload.id) if payload.id else None
    if provider is None:
        provider = ProviderConfig(provider_type=payload.provider_type, name=payload.name, config={})
        db.add(provider)

    existing = provider.config or {}
    api_key = payload.api_key if payload.api_key is not None else existing.get("api_key", "")
    provider.provider_type = payload.provider_type
    provider.name = payload.name
    provider.config = {"preset": payload.preset, "base_url": payload.base_url.rstrip("/"), "model": payload.model, "api_key": api_key, "timeout_seconds": payload.timeout_seconds, "is_active": payload.is_active}

    if payload.is_active:
        others = db.execute(select(ProviderConfig).where(ProviderConfig.id != provider.id)).scalars().all()
        for other in others:
            other_config = other.config or {}
            other_config["is_active"] = False
            other.config = other_config

    db.commit()
    db.refresh(provider)
    return serialize_provider_config(provider)


@app.post("/settings/llm/providers/{provider_id}/activate")
def activate_llm_provider(provider_id: int, db: Session = Depends(get_db)) -> dict:
    provider = db.get(ProviderConfig, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    providers = db.execute(select(ProviderConfig)).scalars().all()
    for item in providers:
        config = item.config or {}
        config["is_active"] = item.id == provider_id
        item.config = config
    db.commit()
    db.refresh(provider)
    return serialize_provider_config(provider)


@app.delete("/settings/llm/providers/{provider_id}")
def delete_llm_provider(provider_id: int, db: Session = Depends(get_db)) -> dict:
    provider = db.get(ProviderConfig, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    db.delete(provider)
    db.commit()
    return {"ok": True}


@app.post("/settings/llm/providers/test")
def test_llm_provider(payload: ProviderTestRequest) -> dict:
    return _provider_test_request(payload.provider_type, payload.base_url, payload.model, payload.api_key, payload.timeout_seconds)


@app.post("/settings/llm/providers/{provider_id}/test")
def test_saved_llm_provider(provider_id: int, db: Session = Depends(get_db)) -> dict:
    provider = db.get(ProviderConfig, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    config = provider.config or {}
    return _provider_test_request(
        provider.provider_type,
        str(config.get("base_url", "")),
        str(config.get("model", "")),
        config.get("api_key"),
        float(config.get("timeout_seconds", 60)),
    )
