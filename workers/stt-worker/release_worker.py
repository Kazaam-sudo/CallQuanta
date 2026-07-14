from __future__ import annotations

import os
import signal
from datetime import UTC, datetime

from sqlalchemy import delete, func, select

import worker
from db import Call, IngestionEvent, QAReview, TranscriptSegment
from packages.demo_quota import release_demo_call, reserve_demo_call
from packages.reliable_queue import acknowledge_job, claim_job, enqueue_job, fail_job, recover_processing_jobs

MAX_JOB_ATTEMPTS = int(os.environ.get("WORKER_MAX_JOB_ATTEMPTS", "3"))


def _completed_demo_calls(db) -> int:
    return int(
        db.execute(
            select(func.count(func.distinct(QAReview.call_id))).where(QAReview.status == "success")
        ).scalar()
        or 0
    )


def _enqueue_auto_qa(db, call: Call) -> tuple[bool, str | None]:
    reserved = False
    if worker.DEMO_CALL_LIMIT > 0:
        accepted, already_reserved = reserve_demo_call(
            worker.redis_client,
            call_id=call.id,
            limit=worker.DEMO_CALL_LIMIT,
            completed_count=_completed_demo_calls(db),
        )
        if not accepted:
            return False, "demo_limit_reached"
        reserved = not already_reserved

    ok, duplicate, _ = enqueue_job(
        worker.redis_client,
        worker.QA_QUEUE,
        {"call_id": call.id, "demo_reservation": worker.DEMO_CALL_LIMIT > 0},
    )
    if not ok:
        if reserved:
            release_demo_call(worker.redis_client, call.id)
        return False, "Queue backend is unavailable"
    return True, "already_queued" if duplicate else None


def process_transcription_job(call_id: int) -> None:
    with worker.SessionLocal() as db:
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
            config = worker.active_stt_provider_config_or_fallback(db, f"call {call_id} provider lookup")
            if config is None and worker.STT_MODE == "placeholder":
                db.add_all(worker.placeholder_segments(call_id))
                call.stt_provider_name = "Env placeholder"
                call.stt_provider_type = "placeholder"
                call.stt_model = "placeholder"
                call.stt_language_used = worker.normalize_stt_language(call.language)
                call.detected_language = None
            else:
                config = config or worker.fallback_stt_provider_config()
                if config is None:
                    raise ValueError(f"unsupported STT_MODE: {worker.STT_MODE}")
                result = worker.transcribe_with_provider(call, config)
                db.add_all(
                    [
                        TranscriptSegment(
                            call_id=call_id,
                            speaker=segment.speaker or "unknown",
                            start_ms=int(segment.start_seconds * 1000),
                            end_ms=int(segment.end_seconds * 1000),
                            text=segment.text,
                        )
                        for segment in result.segments
                    ]
                )
                call.stt_provider_name = result.provider_name
                call.stt_provider_type = result.provider_type
                call.stt_model = result.model
                call.stt_language_used = result.stt_language_used
                call.detected_language = result.detected_language

            if call.auto_analyze_after_transcription:
                queued, reason = _enqueue_auto_qa(db, call)
                if queued:
                    call.status = "analysis_pending"
                    db.add(
                        IngestionEvent(
                            source_provider=call.source_provider or "generic_webhook",
                            external_call_id=call.external_call_id,
                            event_type="analysis_queued",
                            status="success",
                            message=reason,
                            call_id=call.id,
                        )
                    )
                elif reason == "demo_limit_reached":
                    call.status = "transcribed"
                    call.last_error_type = "demo_limit_reached"
                    call.last_error_message = "demo_limit_reached"
                    db.add(
                        IngestionEvent(
                            source_provider=call.source_provider or "generic_webhook",
                            external_call_id=call.external_call_id,
                            event_type="analysis_queued",
                            status="skipped",
                            message="demo_limit_reached",
                            call_id=call.id,
                        )
                    )
                else:
                    call.status = "analysis_failed"
                    call.last_error_type = "queue_unavailable"
                    call.last_error_message = reason
                    db.add(
                        IngestionEvent(
                            source_provider=call.source_provider or "generic_webhook",
                            external_call_id=call.external_call_id,
                            event_type="analysis_queued",
                            status="failed",
                            message=reason,
                            call_id=call.id,
                        )
                    )
            else:
                call.status = "transcribed"

            keep_error = call.status == "analysis_failed" or call.last_error_type == "demo_limit_reached"
            if not keep_error:
                call.last_error_type = None
                call.last_error_message = None
            call.last_processed_at = datetime.now(UTC)
            db.commit()
        except Exception:
            db.rollback()
            raise


def _mark_terminal_failure(call_id: int, error: str) -> None:
    with worker.SessionLocal() as db:
        call = db.get(Call, call_id)
        if call:
            call.status = "transcription_failed"
            call.last_error_type = "transcription"
            call.last_error_message = f"Transcription failed after retries: {error[:500]}"
            call.last_processed_at = datetime.now(UTC)
            db.commit()


def run_worker() -> None:
    signal.signal(signal.SIGINT, worker.handle_shutdown)
    signal.signal(signal.SIGTERM, worker.handle_shutdown)
    active = worker.wait_for_provider_settings_ready()
    recovered = recover_processing_jobs(worker.redis_client, worker.TRANSCRIPTION_QUEUE)
    print(
        f"stt-worker started with reliable queue. active_provider={getattr(active, 'name', None) or '-'} "
        f"recovered={recovered}"
    )

    while worker.running:
        worker.write_heartbeat()
        job = claim_job(worker.redis_client, worker.TRANSCRIPTION_QUEUE, timeout=2)
        if not job:
            continue
        call_id = int(job.data["call_id"])
        try:
            process_transcription_job(call_id)
            acknowledge_job(worker.redis_client, job)
        except Exception as exc:
            clean_error = worker.safe_error(exc)
            requeued = fail_job(
                worker.redis_client,
                job,
                clean_error,
                max_attempts=MAX_JOB_ATTEMPTS,
            )
            if not requeued:
                _mark_terminal_failure(call_id, clean_error)
            print(
                f"stt job failed job_id={job.data.get('job_id')} call_id={call_id} "
                f"requeued={requeued}: {clean_error}"
            )

    print("stt-worker stopped gracefully.")


if __name__ == "__main__":
    run_worker()
