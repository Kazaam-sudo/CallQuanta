from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from packages.demo_quota import RESERVATION_KEY, release_demo_call, reserve_demo_call, reserved_demo_calls
from packages.reliable_queue import (
    acknowledge_job,
    claim_job,
    dead_letter_queue_name,
    enqueue_job,
    fail_job,
    processing_queue_name,
    recover_processing_jobs,
)
from packages.spreadsheet_safety import safe_spreadsheet_row, safe_spreadsheet_value


class FakePipeline:
    def __init__(self, client):
        self.client = client
        self.operations = []

    def lrem(self, *args):
        self.operations.append(("lrem", args)); return self

    def srem(self, *args):
        self.operations.append(("srem", args)); return self

    def lpush(self, *args):
        self.operations.append(("lpush", args)); return self

    def execute(self):
        for name, args in self.operations:
            getattr(self.client, name)(*args)
        return [1] * len(self.operations)


class FakeRedis:
    def __init__(self):
        self.lists = {}
        self.sets = {}

    def eval(self, script, numkeys, *args):
        del script
        if numkeys == 1:
            key, member, completed, limit = args
            values = self.sets.setdefault(key, set())
            if member in values:
                return 2
            if int(completed) + len(values) >= int(limit):
                return 0
            values.add(member)
            return 1
        active_key, queue, member, payload = args
        values = self.sets.setdefault(active_key, set())
        if member in values:
            return 0
        values.add(member)
        self.lpush(queue, payload)
        return 1

    def scard(self, key):
        return len(self.sets.get(key, set()))

    def srem(self, key, member):
        existed = member in self.sets.get(key, set())
        self.sets.setdefault(key, set()).discard(member)
        return int(existed)

    def lpush(self, key, value):
        self.lists.setdefault(key, []).insert(0, value)
        return len(self.lists[key])

    def brpoplpush(self, source, destination, timeout=0):
        del timeout
        if not self.lists.get(source):
            return None
        value = self.lists[source].pop()
        self.lpush(destination, value)
        return value

    def rpoplpush(self, source, destination):
        return self.brpoplpush(source, destination)

    def lrem(self, key, count, value):
        del count
        values = self.lists.get(key, [])
        try:
            values.remove(value)
            return 1
        except ValueError:
            return 0

    def pipeline(self):
        return FakePipeline(self)


class DemoQuotaTests(unittest.TestCase):
    def test_atomic_reservation_rejects_capacity_overflow(self):
        client = FakeRedis()
        self.assertEqual(reserve_demo_call(client, call_id=1, limit=2, completed_count=1), (True, False))
        self.assertEqual(reserve_demo_call(client, call_id=2, limit=2, completed_count=1), (False, False))
        self.assertEqual(reserved_demo_calls(client), 1)

    def test_same_call_reservation_is_idempotent_and_releasable(self):
        client = FakeRedis()
        self.assertEqual(reserve_demo_call(client, call_id=7, limit=1, completed_count=0), (True, False))
        self.assertEqual(reserve_demo_call(client, call_id=7, limit=1, completed_count=0), (True, True))
        release_demo_call(client, 7)
        self.assertEqual(client.scard(RESERVATION_KEY), 0)


class ReliableQueueTests(unittest.TestCase):
    def test_duplicate_active_job_is_not_enqueued_twice(self):
        client = FakeRedis()
        ok, duplicate, data = enqueue_job(client, "qa_jobs", {"call_id": 42})
        self.assertTrue(ok); self.assertFalse(duplicate)
        ok, duplicate, _ = enqueue_job(client, "qa_jobs", {"call_id": 42})
        self.assertTrue(ok); self.assertTrue(duplicate)
        self.assertEqual(len(client.lists["qa_jobs"]), 1)
        self.assertIn("job_id", data)

    def test_claim_ack_removes_processing_and_active_marker(self):
        client = FakeRedis()
        enqueue_job(client, "qa_jobs", {"call_id": 42})
        job = claim_job(client, "qa_jobs", timeout=0)
        self.assertIsNotNone(job)
        self.assertEqual(len(client.lists[processing_queue_name("qa_jobs")]), 1)
        acknowledge_job(client, job)
        self.assertEqual(client.lists[processing_queue_name("qa_jobs")], [])
        self.assertEqual(client.scard("qa_jobs:active"), 0)

    def test_failure_retries_then_moves_to_dead_letter_queue(self):
        client = FakeRedis()
        enqueue_job(client, "qa_jobs", {"call_id": 42})
        job = claim_job(client, "qa_jobs", timeout=0)
        self.assertTrue(fail_job(client, job, "temporary", max_attempts=2))
        retry = claim_job(client, "qa_jobs", timeout=0)
        self.assertFalse(fail_job(client, retry, "terminal", max_attempts=2))
        dead = client.lists[dead_letter_queue_name("qa_jobs")]
        self.assertEqual(len(dead), 1)
        self.assertEqual(json.loads(dead[0])["attempt"], 2)

    def test_interrupted_processing_is_recovered_on_startup(self):
        client = FakeRedis()
        enqueue_job(client, "stt_jobs", {"call_id": 9})
        claim_job(client, "stt_jobs", timeout=0)
        self.assertEqual(recover_processing_jobs(client, "stt_jobs"), 1)
        self.assertEqual(len(client.lists["stt_jobs"]), 1)


class SpreadsheetSafetyTests(unittest.TestCase):
    def test_dangerous_formula_prefixes_are_forced_to_literal_text(self):
        for value in ("=CMD()", "+SUM(A1:A2)", "-1+2", "@IMPORTXML()", "  =HYPERLINK()"):
            self.assertTrue(safe_spreadsheet_value(value).startswith("'"), value)

    def test_numbers_and_normal_unicode_are_preserved(self):
        row = safe_spreadsheet_row([10, 3.5, "Обычный текст", None])
        self.assertEqual(row, [10, 3.5, "Обычный текст", None])


class IntegrationWiringTests(unittest.TestCase):
    def test_api_uses_release_hardening_entrypoint(self):
        dockerfile = (ROOT / "apps/api/Dockerfile").read_text()
        self.assertIn("app.release_entry:app", dockerfile)

    def test_all_workers_use_reliable_entrypoints(self):
        for path in (
            ROOT / "workers/qa-worker/Dockerfile",
            ROOT / "workers/stt-worker/Dockerfile",
            ROOT / "workers/recording-worker/Dockerfile",
        ):
            self.assertIn("release_worker.py", path.read_text(), str(path))

    def test_malformed_llm_response_cannot_use_success_fallback(self):
        source = (ROOT / "workers/qa-worker/release_worker.py").read_text()
        self.assertIn("worker.fallback_review = _reject_fallback_review", source)
        self.assertIn("raise RuntimeError", source)


if __name__ == "__main__":
    unittest.main()
