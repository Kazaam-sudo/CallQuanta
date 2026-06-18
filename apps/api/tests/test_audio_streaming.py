import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    from app import main
    from app.db import Base, Call, User
except ModuleNotFoundError as exc:
    raise unittest.SkipTest(f"API test dependency is not installed: {exc.name}") from exc


class AudioStreamingTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)
        self.db = self.SessionLocal()
        self.temp_dir = tempfile.TemporaryDirectory()
        self.audio_bytes = b"0123456789abcdef"
        self.audio_path = Path(self.temp_dir.name) / "pilot recording.ogg"
        self.audio_path.write_bytes(self.audio_bytes)

        self.manager = User(email="manager@example.com", password_hash="x", role="manager", team="Team A", visibility_scope="team", is_active=True)
        self.other_manager = User(email="other@example.com", password_hash="x", role="manager", team="Team B", visibility_scope="team", is_active=True)
        self.db.add_all([self.manager, self.other_manager])
        self.db.flush()
        self.call = Call(
            filename="pilot recording.ogg",
            stored_filename=self.audio_path.name,
            stored_path=str(self.audio_path),
            file_size_bytes=len(self.audio_bytes),
            content_type="audio/ogg",
            status="uploaded",
            team="Team A",
        )
        self.db.add(self.call)
        self.db.commit()

        def override_db():
            yield self.db

        main.app.dependency_overrides[main.get_db] = override_db
        self.client = TestClient(main.app)

    def tearDown(self):
        main.app.dependency_overrides.clear()
        self.db.close()
        self.temp_dir.cleanup()

    def _authenticate(self, user: User):
        self.client.cookies.set(main.SESSION_COOKIE_NAME, main._create_session_token(user))

    def test_unauthenticated_request_returns_401(self):
        response = self.client.get(f"/calls/{self.call.id}/audio")
        self.assertEqual(response.status_code, 401)

    def test_scoped_user_outside_call_team_returns_403(self):
        self._authenticate(self.other_manager)
        response = self.client.get(f"/calls/{self.call.id}/audio")
        self.assertEqual(response.status_code, 403)

    def test_authorized_user_receives_full_audio(self):
        self._authenticate(self.manager)
        response = self.client.get(f"/calls/{self.call.id}/audio")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, self.audio_bytes)
        self.assertEqual(response.headers["content-type"], "audio/ogg")
        self.assertEqual(response.headers["accept-ranges"], "bytes")
        self.assertEqual(response.headers["content-length"], str(len(self.audio_bytes)))

    def test_range_request_returns_partial_content(self):
        self._authenticate(self.manager)
        response = self.client.get(f"/calls/{self.call.id}/audio", headers={"Range": "bytes=2-5"})
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.content, b"2345")
        self.assertEqual(response.headers["content-range"], f"bytes 2-5/{len(self.audio_bytes)}")
        self.assertEqual(response.headers["content-length"], "4")

    def test_download_sets_content_disposition(self):
        self._authenticate(self.manager)
        response = self.client.get(f"/calls/{self.call.id}/audio?download=1")
        self.assertEqual(response.status_code, 200)
        self.assertIn("attachment", response.headers["content-disposition"])
        self.assertIn("pilot%20recording.ogg", response.headers["content-disposition"])


if __name__ == "__main__":
    unittest.main()
