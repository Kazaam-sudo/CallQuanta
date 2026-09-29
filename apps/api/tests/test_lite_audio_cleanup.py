import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.lite_audio_cleanup import delete_lite_audio_file


class LiteAudioCleanupTests(unittest.TestCase):
    def test_deletes_only_lite_prefixed_file_in_upload_root(self):
        with tempfile.TemporaryDirectory() as tmp:
            audio = Path(tmp) / "lite_abc123_sample.wav"
            audio.write_bytes(b"synthetic audio")

            delete_lite_audio_file(audio, tmp)

            self.assertFalse(audio.exists())

    def test_refuses_non_lite_filename_and_paths_outside_upload_root(self):
        with tempfile.TemporaryDirectory() as tmp:
            upload_dir = Path(tmp) / "uploads"
            upload_dir.mkdir()
            outside = Path(tmp) / "lite_outside.wav"
            outside.write_bytes(b"keep")
            inside_wrong_name = upload_dir / "ordinary.wav"
            inside_wrong_name.write_bytes(b"keep")

            for path in (outside, inside_wrong_name):
                with self.subTest(path=path):
                    with self.assertRaises(ValueError):
                        delete_lite_audio_file(path, upload_dir)
                    self.assertTrue(path.exists())

    def test_missing_file_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            delete_lite_audio_file(Path(tmp) / "lite_missing.wav", tmp)


if __name__ == "__main__":
    unittest.main()
