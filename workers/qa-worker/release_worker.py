from __future__ import annotations

import json
import os
import signal

from sqlalchemy import delete, func, select

import worker
from db import Call, QAReview
from packages.demo_quota import release_demo_call
from packages.reliable_queue import acknowledge_job, claim_job, fail_job, recover_processing_jobs

MAX_JOB_ATTEMPTS = int(os.environ.get("WORKER_MAX_JOB_ATTEMPTS", "3"))


def _reject_fallback_review(scorecard, parse_error):
    del scorecard
    raise RuntimeError(f"LLM response validation failed: {str(parse_error)[:300]}")


worker.fallback_review = _reject_fallback_review


def _max_review_id(call_id: int) -> int:
    with worker.SessionLocal() as db:
        return int(db.execute(select(func.max(QAReview.id)).where(QAReview.call_id == call_id)).scalar() or 0)


def _call_state(call_id: int) -> tuple[str | None, str | None]:
    with worker.SessionLocal() as db:
        call = db.get(Call, call_id)
        return (call.status, call.last_error_type) if call else (None, None)


def _discard_attempt_reviews(call_id: int, previous_max_id: int) -> None:
    with worker.SessionLocal() as db:
        db.execute(
            delete(QAReview).where(
                QAReview.call_id == call_id,
                QAReview.id > previous_max_id,
                QAReview.status == "failed",
            )
        )
        db.commit()


def _release_quota(call_id: int) -> None:
    try:
        release_demo_call(worker.redis_client, call_id)
    except Exception as exc:
        print(f"failed to release demo reservation for call {call_id}: {worker.safe_error(exc, 300)}")


def run_worker() -> None:
    signal.signal(signal.SIGINT, worker.handle_shutdown)
    signal.signal(signal.SIGTERM, worker.handle_shutdown)

    for queue in (worker.QA_QUEUE, worker.TOPIC_CLASSIFICATION_QUEUE):
        recovered = recover_processing_jobs(worker.redis_client, queue)
        if recovered:
            print(f"recovered {recovered} interrupted jobs for queue={queue}")

    print(
        f"qa-worker started with reliable queues. mode={worker.QA_MODE} "
        f"queue={worker.QA_QUEUE} topic_queue={worker.TOPIC_CLASSIFICATION_QUEUE}"
    )

    while worker.running:
        worker.write_heartbeat()
        job = None
        for queue in (worker.QA_QUEUE, worker.TOPIC_CLASSIFICATION_QUEUE):
            job = claim_job(worker.redis_client, queue, timeout=1)
            if job:
                break
        if not job:
            continue

        call_id = int(job.data["call_id"])
        try:
            if job.queue == worker.TOPIC_CLASSIFICATION_QUEUE:
                worker.process_topic_classification_job(call_id)
                acknowledge_job(worker.redis_client, job)
                continue

            previous_max_id = _max_review_id(call_id)
            worker.process_qa_job(call_id)
            status, error_type = _call_state(call_id)
            technical_failure = status == "analysis_failed" and error_type == "analysis"
            if technical_failure:
                next_attempt = int(job.data.get("attempt", 0)) + 1
                if next_attempt < MAX_JOB_ATTEMPTS:
                    _discard_attempt_reviews(call_id, previous_max_id)
                requeued = fail_job(
                    worker.redis_client,
                    job,
                    f"QA technical failure call_id={call_id}",
                    max_attempts=MAX_JOB_ATTEMPTS,
                )
                if not requeued:
                    _release_quota(call_id)
                continue

            acknowledge_job(worker.redis_client, job)
            _release_quota(call_id)
        except Exception as exc:
            requeued = fail_job(
                worker.redis_client,
                job,
                worker.safe_error(exc),
                max_attempts=MAX_JOB_ATTEMPTS,
            )
            if not requeued and job.queue == worker.QA_QUEUE:
                _release_quota(call_id)
            print(
                f"qa job failed job_id={job.data.get('job_id')} call_id={call_id} "
                f"requeued={requeued}: {worker.safe_error(exc)}"
            )

    print("qa-worker stopped gracefully.")


if __name__ == "__main__":
    run_worker()
