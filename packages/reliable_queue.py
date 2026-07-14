from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

import redis


@dataclass(frozen=True)
class ClaimedJob:
    queue: str
    processing_queue: str
    raw_payload: str
    data: dict[str, Any]


def processing_queue_name(queue: str) -> str:
    return f"{queue}:processing"


def dead_letter_queue_name(queue: str) -> str:
    return f"{queue}:dead"


def active_jobs_key(queue: str) -> str:
    return f"{queue}:active"


def normalize_job(queue: str, payload: dict[str, Any]) -> dict[str, Any]:
    data = dict(payload)
    data.setdefault("job_id", uuid4().hex)
    data.setdefault("job_type", queue)
    data.setdefault("attempt", 0)
    data.setdefault("enqueued_at", int(time.time()))
    call_id = data.get("call_id")
    data.setdefault("idempotency_key", f"{queue}:{call_id}" if call_id is not None else f"{queue}:{data['job_id']}")
    return data


def enqueue_job(client: redis.Redis, queue: str, payload: dict[str, Any]) -> tuple[bool, bool, dict[str, Any]]:
    data = normalize_job(queue, payload)
    key = str(data["idempotency_key"])
    script = """
    if redis.call('SISMEMBER', KEYS[1], ARGV[1]) == 1 then
      return 0
    end
    redis.call('SADD', KEYS[1], ARGV[1])
    redis.call('LPUSH', KEYS[2], ARGV[2])
    return 1
    """
    try:
        inserted = int(client.eval(script, 2, active_jobs_key(queue), queue, key, json.dumps(data))) == 1
        return True, not inserted, data
    except redis.RedisError:
        return False, False, data


def recover_processing_jobs(client: redis.Redis, queue: str) -> int:
    processing = processing_queue_name(queue)
    recovered = 0
    while True:
        payload = client.rpoplpush(processing, queue)
        if payload is None:
            break
        recovered += 1
    return recovered


def claim_job(client: redis.Redis, queue: str, timeout: int = 2) -> ClaimedJob | None:
    processing = processing_queue_name(queue)
    payload = client.brpoplpush(queue, processing, timeout=timeout)
    if payload is None:
        return None
    data = json.loads(payload)
    if not isinstance(data, dict):
        raise ValueError("job payload must be an object")
    return ClaimedJob(queue=queue, processing_queue=processing, raw_payload=payload, data=data)


def acknowledge_job(client: redis.Redis, job: ClaimedJob) -> None:
    pipe = client.pipeline()
    pipe.lrem(job.processing_queue, 1, job.raw_payload)
    pipe.srem(active_jobs_key(job.queue), str(job.data.get("idempotency_key", "")))
    pipe.execute()


def fail_job(client: redis.Redis, job: ClaimedJob, error: str, max_attempts: int = 3) -> bool:
    attempt = int(job.data.get("attempt", 0)) + 1
    data = dict(job.data)
    data["attempt"] = attempt
    data["last_error"] = str(error)[:500]
    data["last_failed_at"] = int(time.time())
    payload = json.dumps(data)
    pipe = client.pipeline()
    pipe.lrem(job.processing_queue, 1, job.raw_payload)
    if attempt < max_attempts:
        pipe.lpush(job.queue, payload)
        requeued = True
    else:
        pipe.lpush(dead_letter_queue_name(job.queue), payload)
        pipe.srem(active_jobs_key(job.queue), str(data.get("idempotency_key", "")))
        requeued = False
    pipe.execute()
    return requeued
