from __future__ import annotations

import csv as csv_module
import logging

import redis
from openpyxl.worksheet.worksheet import Worksheet
from sqlalchemy import func, select

from packages.demo_quota import release_demo_call, reserve_demo_call, reserved_demo_calls
from packages.reliable_queue import enqueue_job
from packages.spreadsheet_safety import safe_spreadsheet_row

from . import main as legacy

logger = logging.getLogger("callquanta.release_hardening")


# Protect every CSV/XLSX export without changing working endpoint layouts.
_original_csv_writer = csv_module.writer
_original_worksheet_append = Worksheet.append


class _SafeCsvWriter:
    def __init__(self, wrapped):
        self._wrapped = wrapped

    def writerow(self, row):
        return self._wrapped.writerow(safe_spreadsheet_row(row))

    def writerows(self, rows):
        return self._wrapped.writerows(safe_spreadsheet_row(row) for row in rows)

    @property
    def dialect(self):
        return self._wrapped.dialect


def _safe_csv_writer(*args, **kwargs):
    return _SafeCsvWriter(_original_csv_writer(*args, **kwargs))


def _safe_worksheet_append(self, iterable):
    return _original_worksheet_append(self, safe_spreadsheet_row(iterable))


csv_module.writer = _safe_csv_writer
legacy.csv.writer = _safe_csv_writer
Worksheet.append = _safe_worksheet_append


def _completed_demo_calls() -> int:
    with legacy.SessionLocal() as db:
        value = db.execute(
            select(func.count(func.distinct(legacy.QAReview.call_id))).where(legacy.QAReview.status == "success")
        ).scalar() or 0
        return int(value)


def _hardened_demo_quota_status(db) -> dict:
    limit = max(0, legacy.DEMO_CALL_LIMIT)
    completed = db.execute(
        select(func.count(func.distinct(legacy.QAReview.call_id))).where(legacy.QAReview.status == "success")
    ).scalar() or 0
    try:
        reserved = reserved_demo_calls(legacy.redis_client) if limit else 0
    except redis.RedisError:
        reserved = 0
    used = int(completed)
    committed_or_reserved = used + int(reserved)
    remaining = max(0, limit - committed_or_reserved) if limit else None
    return {
        "mode": "demo",
        "enabled": limit > 0,
        "limit": limit,
        "used": used,
        "reserved": int(reserved),
        "remaining": remaining,
        "exceeded": bool(limit and committed_or_reserved >= limit),
    }


def _hardened_ensure_demo_quota_available(db) -> dict:
    quota = _hardened_demo_quota_status(db)
    if quota["enabled"] and quota["exceeded"]:
        raise legacy.HTTPException(status_code=429, detail=legacy.DEMO_LIMIT_DETAIL)
    return quota


def _hardened_enqueue_job(queue_name: str, payload: dict) -> tuple[bool, str | None]:
    call_id = payload.get("call_id")
    reserved = False
    if queue_name == legacy.QA_QUEUE and call_id is not None and legacy.DEMO_CALL_LIMIT > 0:
        try:
            accepted, already_reserved = reserve_demo_call(
                legacy.redis_client,
                call_id=int(call_id),
                limit=legacy.DEMO_CALL_LIMIT,
                completed_count=_completed_demo_calls(),
            )
        except redis.RedisError as exc:
            logger.warning("Demo quota reservation failed: %s", exc)
            return False, "Queue backend is unavailable"
        if not accepted:
            return False, legacy.DEMO_LIMIT_DETAIL
        reserved = not already_reserved
        payload = {**payload, "demo_reservation": True}

    try:
        ok, duplicate, _ = enqueue_job(legacy.redis_client, queue_name, payload)
    except redis.RedisError as exc:
        logger.warning("Redis enqueue failed for %s: %s", queue_name, exc)
        ok = False
        duplicate = False

    if not ok:
        if reserved and call_id is not None:
            try:
                release_demo_call(legacy.redis_client, int(call_id))
            except redis.RedisError:
                pass
        return False, "Queue backend is unavailable"
    if duplicate:
        return True, "Job is already queued or processing"
    return True, None


legacy._demo_quota_status = _hardened_demo_quota_status
legacy._ensure_demo_quota_available = _hardened_ensure_demo_quota_available
legacy._enqueue_job = _hardened_enqueue_job

app = legacy.app
