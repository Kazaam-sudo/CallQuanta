import csv
import json
import logging
import os
import time
from pathlib import Path
from uuid import uuid4

import redis
import requests
import yaml
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from io import BytesIO, StringIO
from openpyxl import Workbook
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session, sessionmaker
from werkzeug.utils import secure_filename

from .db import Base, Call, ProviderConfig, QAReview, ScorecardConfig, TranscriptSegment, migrate_calls_table, migrate_qa_reviews_table

app = FastAPI(title="CallQuanta API", version="0.7.0")
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


class CallMetadataPayload(BaseModel):
    agent_name: str | None = None
    team: str | None = None
    campaign: str | None = None
    direction: str | None = None
    language: str | None = None


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
        "agent_name": call.agent_name,
        "team": call.team,
        "campaign": call.campaign,
        "direction": call.direction,
        "language": call.language,
        "created_at": call.created_at.isoformat() if call.created_at else None,
    }


@app.patch("/calls/{call_id}/metadata")
def patch_call_metadata(call_id: int, payload: CallMetadataPayload, db: Session = Depends(get_db)) -> dict:
    call = db.get(Call, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    normalized_direction = payload.direction.lower().strip() if isinstance(payload.direction, str) else None
    if normalized_direction is not None and normalized_direction not in {"inbound", "outbound", "unknown"}:
        raise HTTPException(status_code=400, detail="direction must be one of: inbound, outbound, unknown")

    call.agent_name = payload.agent_name.strip() if isinstance(payload.agent_name, str) and payload.agent_name.strip() else None
    call.team = payload.team.strip() if isinstance(payload.team, str) and payload.team.strip() else None
    call.campaign = payload.campaign.strip() if isinstance(payload.campaign, str) and payload.campaign.strip() else None
    call.direction = normalized_direction
    call.language = payload.language.strip() if isinstance(payload.language, str) and payload.language.strip() else None
    db.commit()
    db.refresh(call)
    return serialize_call(call)


@app.get("/dashboard/agent-metrics")
def dashboard_agent_metrics(db: Session = Depends(get_db)) -> dict:
    calls = db.execute(select(Call)).scalars().all()
    groups: dict[str, dict] = {}
    for call in calls:
        key = (call.agent_name or "").strip() or "Unassigned"
        if key not in groups:
            groups[key] = {
                "agent_name": key,
                "calls_count": 0,
                "analyzed_calls_count": 0,
                "average_score": None,
                "lowest_score": None,
                "_scores": [],
            }
        item = groups[key]
        item["calls_count"] += 1

    reviews = db.execute(
        select(QAReview)
        .where(QAReview.status == "success", QAReview.score.is_not(None))
        .order_by(QAReview.call_id.asc(), QAReview.created_at.desc(), QAReview.id.desc())
    ).scalars().all()
    latest_by_call: dict[int, QAReview] = {}
    for review in reviews:
        latest_by_call.setdefault(review.call_id, review)

    for call_id, review in latest_by_call.items():
        call = db.get(Call, call_id)
        if not call:
            continue
        key = (call.agent_name or "").strip() or "Unassigned"
        item = groups.setdefault(key, {"agent_name": key, "calls_count": 0, "analyzed_calls_count": 0, "average_score": None, "lowest_score": None, "_scores": []})
        item["analyzed_calls_count"] += 1
        item["_scores"].append(float(review.score))

    metrics = []
    for item in groups.values():
        scores = item.pop("_scores")
        if scores:
            item["average_score"] = round(sum(scores) / len(scores), 2)
            item["lowest_score"] = min(scores)
        metrics.append(item)
    metrics.sort(key=lambda x: x["agent_name"].lower())
    return {"agents": metrics}


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
    data.setdefault("report_language", "english")
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
    if payload.report_language not in {"english", "russian", "same_as_transcript"}:
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
