import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app import main
    from app.db import Base, Call, TelephonyIntegration
except ModuleNotFoundError as exc:
    raise unittest.SkipTest(f"API test dependency is not installed: {exc.name}") from exc


class TelephonyIngestionTests(unittest.TestCase):
    def test_token_hash_validation(self):
        token = "secret-token"
        token_hash = main._hash_ingestion_token(token)
        self.assertTrue(main._verify_ingestion_token(token, token_hash))
        self.assertFalse(main._verify_ingestion_token("wrong", token_hash))
        self.assertFalse(main._verify_ingestion_token(None, token_hash))

    def test_payload_validation_requires_http_recording_url(self):
        payload = main.TelephonyImportPayload(external_call_id="abc", recording_url="file:///tmp/a.wav")
        with self.assertRaises(main.HTTPException) as raised:
            main._validate_telephony_payload(payload)
        self.assertEqual(raised.exception.status_code, 400)

    def test_idempotency_returns_existing_call(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        SessionLocal = sessionmaker(bind=engine)
        db = SessionLocal()
        original_enqueue = main._enqueue_job
        try:
            integration = TelephonyIntegration(name="Generic", provider_type="generic_webhook", is_active=True, auto_transcribe=False)
            db.add(integration)
            db.commit()
            db.refresh(integration)
            existing = Call(filename="abc.wav", status="uploaded", source_provider="generic_webhook", external_call_id="abc")
            db.add(existing)
            db.commit()
            db.refresh(existing)

            def fail_enqueue(*args, **kwargs):
                raise AssertionError("duplicate import must not enqueue a recording job")

            main._enqueue_job = fail_enqueue
            result = main._ingest_telephony_payload(
                integration,
                main.TelephonyImportPayload(external_call_id="abc", recording_url="https://example.com/abc.wav"),
                db,
            )
            self.assertEqual(result["status"], "duplicate")
            self.assertEqual(result["call_id"], existing.id)
            self.assertEqual(db.query(Call).count(), 1)
        finally:
            main._enqueue_job = original_enqueue
            db.close()

    def test_new_import_enqueues_recording_job(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        SessionLocal = sessionmaker(bind=engine)
        db = SessionLocal()
        original_enqueue = main._enqueue_job
        jobs = []
        try:
            integration = TelephonyIntegration(name="Generic", provider_type="generic_webhook", is_active=True, auto_transcribe=True)
            db.add(integration)
            db.commit()
            db.refresh(integration)

            def capture_enqueue(queue, payload):
                jobs.append((queue, payload))
                return True, None

            main._enqueue_job = capture_enqueue
            result = main._ingest_telephony_payload(
                integration,
                main.TelephonyImportPayload(external_call_id="new", recording_url="https://example.com/new.wav", auto_transcribe=True),
                db,
            )
            self.assertEqual(result["status"], "accepted")
            self.assertEqual(jobs[0][0], main.RECORDING_QUEUE)
            self.assertEqual(jobs[0][1]["call_id"], result["call_id"])
        finally:
            main._enqueue_job = original_enqueue
            db.close()


if __name__ == "__main__":
    unittest.main()
