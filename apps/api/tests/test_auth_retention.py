import sys
import tempfile
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app import main
    from app.db import Base, Call, User
except ModuleNotFoundError as exc:
    raise unittest.SkipTest(f"API test dependency is not installed: {exc.name}") from exc


class AuthAndRetentionTests(unittest.TestCase):
    def test_password_hashing_round_trip_and_failure(self):
        password_hash = main._hash_password("correct horse battery staple")
        self.assertTrue(main._verify_password("correct horse battery staple", password_hash))
        self.assertFalse(main._verify_password("wrong", password_hash))
        self.assertNotIn("correct horse battery staple", password_hash)

    def test_session_token_round_trip(self):
        user = User(id=42, email="viewer@example.com", password_hash="x", role="viewer", is_active=True)
        token = main._create_session_token(user)
        self.assertEqual(main._decode_session_token(token), 42)
        self.assertIsNone(main._decode_session_token(token + "tampered"))

    def test_retention_dry_run_counts_audio_bytes(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        SessionLocal = sessionmaker(bind=engine)
        db = SessionLocal()
        original_upload_dir = main.UPLOAD_DIR
        try:
            with tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "old.wav"
                path.write_bytes(b"12345")
                old_call = Call(
                    filename="old.wav",
                    status="uploaded",
                    stored_path=str(path),
                    created_at=datetime.now(UTC) - timedelta(days=10),
                )
                db.add(old_call)
                db.commit()
                plan = main._retention_plan(db, {"audio_days": 1, "transcripts_days": None, "qa_reviews_days": None, "ingestion_events_days": None})
                self.assertEqual(plan["audio"]["count"], 1)
                self.assertEqual(plan["audio"]["bytes"], 5)
        finally:
            main.UPLOAD_DIR = original_upload_dir
            db.close()


if __name__ == "__main__":
    unittest.main()
