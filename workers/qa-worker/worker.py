"""QA worker entrypoint."""

import json
import os
import signal
from pathlib import Path
from typing import Any

import redis
import requests
import yaml
from sqlalchemy import create_engine, delete, select
from sqlalchemy.orm import sessionmaker

from db import Call, QAFinding, QAReview, TranscriptSegment

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql+psycopg://callquanta:callquanta@postgres:5432/callquanta")
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
QA_QUEUE = os.environ.get("QA_QUEUE", "qa_jobs")
QA_MODE = os.environ.get("QA_MODE", "placeholder")
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "openai_compatible")
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "http://ollama:11434/v1").rstrip("/")
LLM_MODEL = os.environ.get("LLM_MODEL", "llama3.1:8b")
LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
SCORECARD_PATH = Path(os.environ.get("SCORECARD_PATH", "/app/packages/scorecards/default_sales_qa.yaml"))


def get_llm_timeout_seconds() -> float:
    raw = os.environ.get("LLM_TIMEOUT_SECONDS", "180")
    try:
        timeout_seconds = float(raw)
    except (TypeError, ValueError):
        print(f"invalid LLM_TIMEOUT_SECONDS={raw!r}; using default 180 seconds")
        return 180.0

    if timeout_seconds <= 0:
        print(f"LLM_TIMEOUT_SECONDS must be > 0; got {timeout_seconds}. using default 180 seconds")
        return 180.0

    return timeout_seconds

LLM_TIMEOUT_SECONDS = get_llm_timeout_seconds()

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
running = True


def handle_shutdown(signum, frame):
    del frame
    global running
    print(f"qa-worker received shutdown signal: {signum}")
    running = False


def load_scorecard() -> dict[str, Any]:
    with SCORECARD_PATH.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    if not isinstance(data, dict) or not isinstance(data.get("criteria"), list):
        raise ValueError("invalid scorecard format")
    return data


def placeholder_review(scorecard: dict[str, Any]) -> dict:
    criteria = []
    findings = []
    for criterion in scorecard["criteria"]:
        max_points = int(criterion["max_points"])
        score = max(max_points - 2, 0)
        criteria.append(
            {
                "id": criterion["id"],
                "title": criterion["title"],
                "score": score,
                "max_points": max_points,
                "comment": "Placeholder evaluation: deterministic criterion assessment for CI-safe mode.",
                "evidence": f"Criterion {criterion['title']} reviewed in placeholder mode.",
                "severity": "info",
            }
        )
        if criterion["id"] == "objection_handling":
            findings.append(
                {
                    "severity": "warning",
                    "evidence": "Placeholder mode cannot verify nuanced objection handling behavior.",
                }
            )

    total_score = sum(item["score"] for item in criteria)
    total_max = sum(item["max_points"] for item in criteria) or 1
    normalized_score = round((total_score / total_max) * 100, 2)
    findings.append({"severity": "info", "evidence": "Analysis mode: placeholder (deterministic)."})

    return {
        "score": normalized_score,
        "summary": "Placeholder QA review generated from default sales scorecard criteria.",
        "criteria": criteria,
        "findings": findings,
    }


def format_transcript(segments: list[TranscriptSegment]) -> str:
    lines = []
    for segment in segments:
        start_s = segment.start_ms / 1000
        end_s = segment.end_ms / 1000
        lines.append(f"[{start_s:.2f}s-{end_s:.2f}s] {segment.speaker}: {segment.text}")
    return "\n".join(lines)


def llm_review(transcript_text: str, scorecard: dict[str, Any]) -> dict[str, Any]:
    if LLM_PROVIDER != "openai_compatible":
        raise ValueError(f"unsupported LLM_PROVIDER: {LLM_PROVIDER}")

    headers = {"Content-Type": "application/json"}
    if LLM_API_KEY:
        headers["Authorization"] = f"Bearer {LLM_API_KEY}"

    payload = {
        "model": LLM_MODEL,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a QA analyzer for sales/support call transcripts. "
                    "Return JSON only (no markdown, no extra text). "
                    "Required schema: {\"score\": number, \"summary\": string, \"criteria\": array, \"findings\": array}. "
                    "Each criteria item must include id, title, score, max_points, comment, evidence, severity (info|warning|critical). "
                    "Each finding object must include severity (info|warning|critical) and evidence (string). "
                    "Evidence must reference concrete behavior from the transcript, including speaker and/or timestamps when possible."
                ),
            },
            {"role": "user", "content": json.dumps({"scorecard": scorecard, "transcript": transcript_text})},
        ],
    }

    try:
        response = requests.post(
            f"{LLM_BASE_URL}/chat/completions",
            headers=headers,
            json=payload,
            timeout=LLM_TIMEOUT_SECONDS,
        )
    except requests.exceptions.Timeout as exc:
        print(
            "LLM request timed out after "
            f"{LLM_TIMEOUT_SECONDS:g} seconds. Try a smaller model, increase "
            "LLM_TIMEOUT_SECONDS, or use placeholder mode."
        )
        raise RuntimeError("LLM request timeout") from exc

    response.raise_for_status()
    data = response.json()
    content = data["choices"][0]["message"]["content"]
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        print(f"failed to parse LLM JSON response: {exc}")
        print(f"raw LLM response: {content}")
        raise
    return parsed


def validate_review(review: dict[str, Any]) -> dict[str, Any]:
    score = review.get("score")
    if not isinstance(score, (int, float)):
        raise ValueError("score must be a number")

    summary = review.get("summary")
    if not isinstance(summary, str):
        raise ValueError("summary must be a string")
    summary = summary.strip()

    criteria = review.get("criteria", [])
    if not isinstance(criteria, list):
        raise ValueError("criteria must be a list")

    normalized_criteria = []
    for criterion in criteria:
        if not isinstance(criterion, dict):
            continue
        severity = str(criterion.get("severity", "warning")).strip().lower()
        if severity not in {"info", "warning", "critical"}:
            severity = "warning"
        normalized_criteria.append(
            {
                "id": str(criterion.get("id", "")).strip(),
                "title": str(criterion.get("title", "")).strip(),
                "score": float(criterion.get("score", 0)),
                "max_points": float(criterion.get("max_points", 0)),
                "comment": str(criterion.get("comment", "")).strip(),
                "evidence": str(criterion.get("evidence", "")).strip(),
                "severity": severity,
            }
        )

    findings = review.get("findings", [])
    if not isinstance(findings, list):
        raise ValueError("findings must be a list")

    normalized_findings = []
    for finding in findings:
        if not isinstance(finding, dict):
            continue
        severity = str(finding.get("severity", "warning")).strip().lower()
        evidence = str(finding.get("evidence", "")).strip()
        if severity not in {"info", "warning", "critical"}:
            severity = "warning"
        normalized_findings.append({"severity": severity, "evidence": evidence})

    return {"score": score, "summary": summary, "criteria": normalized_criteria, "findings": normalized_findings}


def process_qa_job(call_id: int) -> None:
    with SessionLocal() as db:
        call = db.get(Call, call_id)
        if not call:
            print(f"call {call_id} not found, skipping job")
            return

        segments = db.execute(
            select(TranscriptSegment)
            .where(TranscriptSegment.call_id == call_id)
            .order_by(TranscriptSegment.start_ms.asc(), TranscriptSegment.id.asc())
        ).scalars().all()
        if not segments:
            call.status = "analysis_failed"
            db.commit()
            print(f"call {call_id} has no transcript segments")
            return

        transcript_text = format_transcript(segments)

        try:
            scorecard = load_scorecard()
            raw_review = placeholder_review(scorecard) if QA_MODE == "placeholder" else llm_review(transcript_text, scorecard)
            review = validate_review(raw_review)

            existing_reviews = db.execute(select(QAReview).where(QAReview.call_id == call_id)).scalars().all()
            for existing_review in existing_reviews:
                db.execute(delete(QAFinding).where(QAFinding.qa_review_id == existing_review.id))
            db.execute(delete(QAReview).where(QAReview.call_id == call_id))

            qa_review = QAReview(call_id=call_id, score=review["score"], summary=review["summary"])
            db.add(qa_review)
            db.flush()

            for criterion in review["criteria"]:
                db.add(
                    QAFinding(
                        qa_review_id=qa_review.id,
                        severity=criterion["severity"],
                        evidence=(
                            f"[criterion:{criterion['id']}] {criterion['title']} "
                            f"{criterion['score']}/{criterion['max_points']}: "
                            f"{criterion['comment']} | evidence: {criterion['evidence']}"
                        ),
                    )
                )

            for finding in review["findings"]:
                db.add(
                    QAFinding(
                        qa_review_id=qa_review.id,
                        severity=finding["severity"],
                        evidence=finding["evidence"],
                    )
                )
            db.add(
                QAFinding(
                    qa_review_id=qa_review.id,
                    severity="info",
                    evidence=f"Analysis mode: {QA_MODE}",
                )
            )

            call.status = "analyzed"
            db.commit()
            print(f"call {call_id} analyzed with mode={QA_MODE}")
        except Exception as exc:
            db.rollback()
            call.status = "analysis_failed"
            db.commit()
            print(f"failed to analyze call {call_id}: {exc}")


signal.signal(signal.SIGINT, handle_shutdown)
signal.signal(signal.SIGTERM, handle_shutdown)

print(f"qa-worker started. mode={QA_MODE}. Waiting for QA jobs...")

while running:
    job = redis_client.brpop(QA_QUEUE, timeout=2)
    if not job:
        continue

    _, payload = job
    try:
        data = json.loads(payload)
        call_id = int(data["call_id"])
    except Exception:
        print(f"invalid QA job payload: {payload}")
        continue

    process_qa_job(call_id)

print("qa-worker stopped gracefully.")
