import unittest

from validate_worker_mode import validate_worker_mode


class ValidateWorkerModeTests(unittest.TestCase):
    def test_development_allows_placeholder(self):
        validate_worker_mode("qa", {"APP_ENV": "development", "QA_MODE": "placeholder"})
        validate_worker_mode("stt", {"APP_ENV": "test", "STT_MODE": "placeholder"})

    def test_pilot_rejects_placeholder_qa(self):
        with self.assertRaisesRegex(RuntimeError, "QA_MODE=placeholder"):
            validate_worker_mode("qa", {"APP_ENV": "pilot", "QA_MODE": "placeholder"})

    def test_production_rejects_missing_qa_mode(self):
        with self.assertRaisesRegex(RuntimeError, "QA_MODE=placeholder"):
            validate_worker_mode("qa", {"APP_ENV": "production"})

    def test_pilot_rejects_placeholder_stt(self):
        with self.assertRaisesRegex(RuntimeError, "STT_MODE=placeholder"):
            validate_worker_mode("stt", {"APP_ENV": "pilot", "STT_MODE": "placeholder"})

    def test_real_modes_are_allowed(self):
        validate_worker_mode("qa", {"APP_ENV": "production", "QA_MODE": "openai_compatible"})
        validate_worker_mode("stt", {"APP_ENV": "production", "STT_MODE": "faster_whisper"})

    def test_explicit_diagnostic_override_is_allowed(self):
        validate_worker_mode(
            "qa",
            {
                "APP_ENV": "pilot",
                "QA_MODE": "placeholder",
                "ALLOW_PLACEHOLDER_AI": "true",
            },
        )

    def test_unknown_worker_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "worker must be"):
            validate_worker_mode("unknown", {})


if __name__ == "__main__":
    unittest.main()
