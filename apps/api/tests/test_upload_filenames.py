import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app import main
    from app.db import Base, Call
except ModuleNotFoundError as exc:
    raise unittest.SkipTest(f"API test dependency is not installed: {exc.name}") from exc


class AsyncUploadFile(SimpleNamespace):
    def __init__(self, filename: str, content: bytes = b"audio", content_type: str = "audio/wav"):
        super().__init__(filename=filename, content_type=content_type, size=len(content))
        self._content = content
        self._read = False

    async def read(self, size: int = -1) -> bytes:
        if self._read:
            return b""
        self._read = True
        return self._content


class UploadFilenameTests(unittest.IsolatedAsyncioTestCase):
    def test_cyrillic_wav_filename_is_accepted_and_preserved_for_display(self):
        display_name, safe_name = main._validate_upload_file(AsyncUploadFile("Приглашение Яхши uz.wav"))

        self.assertEqual(display_name, "Приглашение Яхши uz.wav")
        self.assertTrue(safe_name.endswith(".wav"))
        self.assertNotIn("/", safe_name)
        self.assertNotIn("\\", safe_name)

    def test_cyrillic_only_base_wav_filename_gets_safe_storage_fallback(self):
        display_name, safe_name = main._validate_upload_file(AsyncUploadFile("Привет.wav"))

        self.assertEqual(display_name, "Привет.wav")
        self.assertTrue(safe_name.endswith(".wav"))
        self.assertNotEqual(safe_name, ".wav")

    async def test_display_filename_is_preserved_on_created_call(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        SessionLocal = sessionmaker(bind=engine)
        original_upload_dir = main.UPLOAD_DIR

        with tempfile.TemporaryDirectory() as tmpdir:
            main.UPLOAD_DIR = Path(tmpdir)
            db = SessionLocal()
            try:
                call = await main._create_uploaded_call(AsyncUploadFile("Приглашение КЦ uz.wav.wav"), db)
                stored = db.get(Call, call.id)

                self.assertEqual(call.filename, "Приглашение КЦ uz.wav.wav")
                self.assertEqual(stored.filename, "Приглашение КЦ uz.wav.wav")
                self.assertTrue(call.stored_filename.endswith(".wav"))
                self.assertTrue((Path(tmpdir) / call.stored_filename).exists())
            finally:
                db.close()
                main.UPLOAD_DIR = original_upload_dir

    def test_invalid_png_is_rejected_with_original_filename_context_available(self):
        with self.assertRaises(main.HTTPException) as raised:
            main._validate_upload_file(AsyncUploadFile("Звонок клиента.png", content_type="image/png"))

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("Unsupported file extension", str(raised.exception.detail))
        self.assertEqual(main._display_upload_filename("Звонок клиента.png"), "Звонок клиента.png")


if __name__ == "__main__":
    unittest.main()
