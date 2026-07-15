import importlib.util
import unittest
from pathlib import Path
from types import SimpleNamespace


module_path = Path(__file__).resolve().parents[1] / "workers" / "qa-worker" / "transcript_validation.py"
spec = importlib.util.spec_from_file_location("release_transcript_validation", module_path)
validation = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(validation)


class TranscriptValidationReleaseTests(unittest.TestCase):
    def test_valid_and_invalid_transcript_paths(self):
        valid_call = SimpleNamespace(duration_seconds=60, language="en")
        valid_text = " ".join(["The agent confirmed delivery timing and answered the customer's product question clearly."] * 8)
        valid = validation.validate_transcript_for_qa(valid_call, [SimpleNamespace(text=valid_text)])
        self.assertTrue(valid["is_valid"])

        invalid_call = SimpleNamespace(duration_seconds=60, language="en")
        invalid = validation.validate_transcript_for_qa(invalid_call, [SimpleNamespace(text="This is a placeholder transcript segment")])
        self.assertFalse(invalid["is_valid"])
        self.assertIn("placeholder_transcript", invalid["flags"])


if __name__ == "__main__":
    unittest.main()
