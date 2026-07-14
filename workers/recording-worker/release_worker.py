from __future__ import annotations

import os
import signal

import worker
from db import Call
from packages.reliable_queue import acknowledge_job, claim_job, enqueue_job, fail_job, recover_processing_jobs

MAX_JOB_ATTEMPTS = int(os.environ.get("WORKER_MAX_JOB_ATTEMPTS", "3"))


def _reliable_enqueue_transcription(call_id: int) -> bool:
    ok, _, _ = enqueue_job(worker.redis_client, worker.TRANSCRIPTION_QUEUE, {"call_id": call_id})
    return ok


worker.enqueue_transcription = _reliable_enqueue_transcription


def _call_status(call_id: int) -> str | None:
    with worker.SessionLocal() as db:
        call = db.get(Call, call_id)
        return call.status if call else None


def run_worker() -> None:
    signal.signal(signal.SIGINT, worker.handle_shutdown)
    signal.signal(signal.SIGTERM, worker.handle_shutdown)
    recovered = recover_processing_jobs(worker.redis_client, worker.RECORDING_QUEUE)
    print(f"recording-worker started with reliable queue. recovered={recovered}")

    while worker.running:
        worker.write_heartbeat()
        job = claim_job(worker.redis_client, worker.RECORDING_QUEUE, timeout=2)
        if not job:
            continue
        call_id = int(job.data["call_id"])
        try:
            worker.process_job(job.data)
            status = _call_status(call_id)
            if status == "recording_download_failed":
                requeued = fail_job(
                    worker.redis_client,
                    job,
                    f"recording download failed call_id={call_id}",
                    max_attempts=MAX_JOB_ATTEMPTS,
                )
                print(
                    f"recording job failed job_id={job.data.get('job_id')} call_id={call_id} "
                    f"requeued={requeued}"
                )
            else:
                acknowledge_job(worker.redis_client, job)
        except Exception as exc:
            clean_error = worker.safe_error(exc)
            requeued = fail_job(
                worker.redis_client,
                job,
                clean_error,
                max_attempts=MAX_JOB_ATTEMPTS,
            )
            print(
                f"recording job failed job_id={job.data.get('job_id')} call_id={call_id} "
                f"requeued={requeued}: {clean_error}"
            )

    print("recording-worker stopped gracefully.")


if __name__ == "__main__":
    run_worker()
