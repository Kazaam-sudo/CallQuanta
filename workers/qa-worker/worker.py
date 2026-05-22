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

from db import Call, ProviderConfig, QAFinding, QAReview, TranscriptSegment

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
LLM_PROVIDER_CONFIG_SOURCE = os.environ.get("LLM_PROVIDER_CONFIG_SOURCE", "db_or_env")

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


def parse_json_object_from_text(raw_content: str) -> dict[str, Any]:
    try:
        parsed = json.loads(raw_content)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    decoder = json.JSONDecoder()
    for idx, char in enumerate(raw_content):
        if char != "{":
            continue
        try:
            obj, _ = decoder.raw_decode(raw_content[idx:])
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict):
            return obj

    raise ValueError("no valid JSON object found in LLM response")


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




def resolve_active_provider(db) -> dict[str, Any]:
    default_config = {
        "provider": LLM_PROVIDER,
        "preset": "env",
        "name": "Environment fallback",
        "base_url": LLM_BASE_URL,
        "model": provider["model"],
        "api_key": LLM_API_KEY,
        "timeout_seconds": LLM_TIMEOUT_SECONDS,
    }
    if LLM_PROVIDER_CONFIG_SOURCE == "env":
        return default_config

    active = db.execute(select(ProviderConfig)).scalars().all()
    for item in active:
        config = item.config or {}
        if not config.get("is_active"):
            continue
        return {
            "provider": item.provider_type,
            "preset": config.get("preset", "custom"),
            "name": item.name,
            "base_url": str(config.get("base_url", "")).rstrip("/"),
            "model": config.get("model", LLM_MODEL),
            "api_key": config.get("api_key", ""),
            "timeout_seconds": float(config.get("timeout_seconds", LLM_TIMEOUT_SECONDS)),
        }
    return default_config

def llm_review(transcript_text: str, scorecard: dict[str, Any], provider: dict[str, Any]) -> dict[str, Any]:
    if provider["provider"] != "openai_compatible":
        raise ValueError(f"unsupported LLM_PROVIDER: {LLM_PROVIDER}")

    headers = {"Content-Type": "application/json"}
    if provider.get("api_key"):
        headers["Authorization"] = f"Bearer {provider["api_key"]}"

    criteria_lines = []
    for index, criterion in enumerate(scorecard["criteria"], start=1):
        criteria_lines.append(
            f"{index}. {criterion['title']} (id: {criterion['id']}, max_points: {criterion['max_points']})"
        )
    scorecard_list = "\n".join(criteria_lines)

    payload = {
        "model": provider["model"],
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a QA analyzer for sales/support call transcripts. "
                    "Return JSON only (no markdown, no extra text). "
                    "Required schema: {\"summary\": string, \"criteria_scores\": array, \"findings\": array}. "
                    "Each criteria_scores item must include index (1-based), score, comment, evidence, severity (info|warning|critical). "
                    "Each finding object must include severity (info|warning|critical) and evidence (string). "
                    "Do not include criterion ids, titles, or max points in criteria_scores. "
                    "Evidence must reference concrete behavior from the transcript, including speaker and/or timestamps when possible."
                ),
            },
            {
                "role": "user",
                "content": (
                    "Scorecard criteria (use 1-based index values exactly as listed):\n"
                    f"{scorecard_list}\n\n"
                    "Return compact JSON that matches this exact example shape:\n"
                    '{"summary":"Short summary","criteria_scores":[{"index":1,"score":3,"comment":"Brief comment","evidence":"[12.40s-18.10s] Agent did X","severity":"warning"}],"findings":[{"severity":"info","evidence":"Short finding"}]}\n\n'
                    f"Transcript:\n{transcript_text}"
                ),
            },
        ],
    }

    try:
        response = requests.post(
            f"{provider["base_url"]}/chat/completions",
            headers=headers,
            json=payload,
            timeout=provider["timeout_seconds"],
        )
    except requests.exceptions.Timeout as exc:
        print(
            "LLM request timed out after "
            f"{provider["timeout_seconds"]:g} seconds. Try a smaller model, increase "
            "LLM_TIMEOUT_SECONDS, or use placeholder mode."
        )
        raise RuntimeError("LLM request timeout") from exc

    response.raise_for_status()
    data = response.json()
    content = data["choices"][0]["message"]["content"]
    try:
        return parse_json_object_from_text(content)
    except ValueError as exc:
        print(f"failed to parse LLM JSON response: {exc}")
        print(f"raw LLM response: {content}")
        raise


def validate_review(review: dict[str, Any]) -> dict[str, Any]:
    summary = review.get("summary")
    if not isinstance(summary, str):
        raise ValueError("summary must be a string")
    summary = summary.strip()

    criteria = review.get("criteria", [])
    if criteria is None:
        criteria = []
    if not isinstance(criteria, list):
        raise ValueError("criteria must be a list when provided")

    criteria_scores = review.get("criteria_scores", [])
    if criteria_scores is None:
        criteria_scores = []
    if not isinstance(criteria_scores, list):
        raise ValueError("criteria_scores must be a list when provided")

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

    normalized_criteria_scores = []
    for criterion_score in criteria_scores:
        if not isinstance(criterion_score, dict):
            continue
        severity = str(criterion_score.get("severity", "warning")).strip().lower()
        if severity not in {"info", "warning", "critical"}:
            severity = "warning"
        normalized_criteria_scores.append(
            {
                "index": criterion_score.get("index"),
                "score": criterion_score.get("score", 0),
                "comment": str(criterion_score.get("comment", "")).strip(),
                "evidence": str(criterion_score.get("evidence", "")).strip(),
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

    score = review.get("score")
    normalized_score = float(score) if isinstance(score, (int, float)) else None

    return {
        "score": normalized_score,
        "summary": summary,
        "criteria": normalized_criteria,
        "criteria_scores": normalized_criteria_scores,
        "findings": normalized_findings,
    }


def normalize_review(review: dict[str, Any], scorecard: dict[str, Any]) -> dict[str, Any]:
    scorecard_map = {
        str(item["id"]).strip(): {
            "title": str(item["title"]).strip(),
            "max_points": float(item["max_points"]),
        }
        for item in scorecard["criteria"]
    }
    criteria_by_id: dict[str, dict[str, Any]] = {}
    findings = list(review["findings"])
    scorecard_criteria = scorecard["criteria"]

    for criterion_score in review.get("criteria_scores", []):
        raw_index = criterion_score.get("index")
        if not isinstance(raw_index, (int, float)):
            continue
        index = int(raw_index)
        if index < 1 or index > len(scorecard_criteria):
            continue
        scorecard_item = scorecard_criteria[index - 1]
        criterion_id = str(scorecard_item["id"]).strip()
        if criterion_id in criteria_by_id:
            continue
        max_points = float(scorecard_item["max_points"])
        raw_score = criterion_score.get("score", 0)
        score = float(raw_score) if isinstance(raw_score, (int, float)) else 0.0
        score = max(0.0, min(score, max_points))
        criteria_by_id[criterion_id] = {
            "id": criterion_id,
            "title": str(scorecard_item["title"]).strip(),
            "score": score,
            "max_points": max_points,
            "comment": criterion_score.get("comment") or "No clear model comment provided.",
            "evidence": criterion_score.get("evidence") or "No clear evidence found in transcript.",
            "severity": criterion_score.get("severity")
            if criterion_score.get("severity") in {"info", "warning", "critical"}
            else "warning",
        }

    for criterion in review["criteria"]:
        criterion_id = str(criterion.get("id", "")).strip()
        if criterion_id not in scorecard_map or criterion_id in criteria_by_id:
            continue
        source = scorecard_map[criterion_id]
        max_points = source["max_points"]
        raw_max_points = criterion.get("max_points", 0)
        if not isinstance(raw_max_points, (int, float)) or raw_max_points <= 0 or abs(float(raw_max_points) - max_points) > 0.001:
            raw_max_points = max_points
        score = criterion.get("score", 0)
        if not isinstance(score, (int, float)):
            score = 0
        score = max(0.0, min(float(score), float(raw_max_points)))
        criteria_by_id[criterion_id] = {
            "id": criterion_id,
            "title": source["title"],
            "score": score,
            "max_points": float(raw_max_points),
            "comment": criterion.get("comment") or "No clear model comment provided.",
            "evidence": criterion.get("evidence") or "No clear evidence found in transcript.",
            "severity": criterion.get("severity") if criterion.get("severity") in {"info", "warning", "critical"} else "warning",
        }

    normalized_criteria = []
    usable_scores_found = len(criteria_by_id) > 0
    for scorecard_item in scorecard["criteria"]:
        criterion_id = str(scorecard_item["id"]).strip()
        if criterion_id not in criteria_by_id:
            normalized_criteria.append(
                {
                    "id": criterion_id,
                    "title": str(scorecard_item["title"]).strip(),
                    "score": 0.0,
                    "max_points": float(scorecard_item["max_points"]),
                    "comment": "No valid model assessment was returned for this criterion.",
                    "evidence": "No clear evidence found in transcript.",
                    "severity": "warning",
                }
            )
            continue
        normalized_criteria.append(criteria_by_id[criterion_id])

    if not usable_scores_found and (review.get("summary") or review["findings"]):
        findings.append(
            {
                "severity": "warning",
                "evidence": "Model did not return usable per-criterion scores.",
            }
        )

    total_score = sum(item["score"] for item in normalized_criteria)
    total_max = sum(item["max_points"] for item in normalized_criteria) or 1
    computed_score = round((total_score / total_max) * 100)
    llm_score = review.get("score")
    if isinstance(llm_score, (int, float)) and abs(float(llm_score) - float(computed_score)) >= 5:
        findings.append(
            {
                "severity": "warning",
                "evidence": "LLM total score differed from criteria-derived score; criteria-derived score was used.",
            }
        )
    if computed_score <= 40 and any(token in review["summary"].lower() for token in ["great", "excellent", "strong", "outstanding"]):
        findings.append(
            {
                "severity": "warning",
                "evidence": "Summary may be inconsistent with the criteria-derived score.",
            }
        )
    return {"score": computed_score, "summary": review["summary"], "criteria": normalized_criteria, "findings": findings}


def fallback_review(scorecard: dict[str, Any], parse_error: str) -> dict[str, Any]:
    review = {
        "score": 0,
        "summary": "LLM returned an invalid response; fallback scorecard review generated.",
        "criteria": [],
        "findings": [{"severity": "warning", "evidence": f"LLM parse error: {parse_error[:180]}"}],
    }
    return normalize_review(review, scorecard)


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
            if QA_MODE == "placeholder":
                review = placeholder_review(scorecard)
            else:
                try:
                    provider = resolve_active_provider(db)
                    raw_review = llm_review(transcript_text, scorecard, provider)
                    validated = validate_review(raw_review)
                    review = normalize_review(validated, scorecard)
                except (json.JSONDecodeError, ValueError) as exc:
                    review = fallback_review(scorecard, str(exc))
                    review["findings"].append(
                        {
                            "severity": "warning",
                            "evidence": "This review was partially recovered from an imperfect LLM response.",
                        }
                    )

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
            mode_detail = f"Analysis mode: {QA_MODE}; provider: {provider.get('preset', 'env')}/{provider.get('name', 'unknown')}; model: {provider.get('model', LLM_MODEL)}" if QA_MODE != "placeholder" else f"Analysis mode: {QA_MODE}"
            db.add(QAFinding(qa_review_id=qa_review.id, severity="info", evidence=mode_detail))

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
