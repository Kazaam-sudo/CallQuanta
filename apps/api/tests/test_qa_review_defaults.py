import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker

    from app.db import Base, Call, QAReview, migrate_qa_reviews_table
except ModuleNotFoundError as exc:
    raise unittest.SkipTest(f"API test dependency is not installed: {exc.name}") from exc


class QAReviewDefaultTests(unittest.TestCase):
    def test_successful_review_gets_ai_generated_default(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        SessionLocal = sessionmaker(bind=engine)
        db = SessionLocal()
        try:
            call = Call(filename="success.wav", status="analyzed")
            db.add(call)
            db.flush()
            review = QAReview(call_id=call.id, status="success")
            db.add(review)
            db.commit()
            db.refresh(review)
            self.assertEqual(review.review_status, "ai_generated")
        finally:
            db.close()

    def test_failed_review_gets_ai_generated_default(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        SessionLocal = sessionmaker(bind=engine)
        db = SessionLocal()
        try:
            call = Call(filename="failed.wav", status="analysis_failed")
            db.add(call)
            db.flush()
            review = QAReview(call_id=call.id, status="failed", error_message="boom")
            db.add(review)
            db.commit()
            db.refresh(review)
            self.assertEqual(review.review_status, "ai_generated")
        finally:
            db.close()

    def test_migrate_qa_reviews_table_backfills_null_review_status(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(text(
                "CREATE TABLE qa_reviews ("
                "id INTEGER PRIMARY KEY, "
                "call_id INTEGER, "
                "score FLOAT, "
                "summary TEXT, "
                "status VARCHAR(32), "
                "review_status VARCHAR(32), "
                "calibration_flag BOOLEAN"
                ")"
            ))
            conn.execute(text(
                "INSERT INTO qa_reviews "
                "(id, call_id, status, review_status, calibration_flag) "
                "VALUES (1, 1, 'success', NULL, NULL)"
            ))

        migrate_qa_reviews_table(engine)

        with engine.connect() as conn:
            row = conn.execute(text("SELECT review_status, calibration_flag FROM qa_reviews WHERE id = 1")).one()
        self.assertEqual(row.review_status, "ai_generated")
        self.assertEqual(row.calibration_flag, 0)


if __name__ == "__main__":
    unittest.main()
