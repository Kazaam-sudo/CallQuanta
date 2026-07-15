import tempfile
import unittest
import wave
from pathlib import Path

from synthetic_audio_fixture import DURATION_SECONDS, SAMPLE_RATE, write_fixture


class SyntheticAudioFixtureTests(unittest.TestCase):
    def test_fixture_is_safe_mono_pcm_wav(self):
        with tempfile.TemporaryDirectory() as directory:
            path = write_fixture(Path(directory) / "synthetic-tone.wav")
            with wave.open(str(path), "rb") as audio:
                self.assertEqual(audio.getnchannels(), 1)
                self.assertEqual(audio.getframerate(), SAMPLE_RATE)
                self.assertEqual(audio.getsampwidth(), 2)
                self.assertEqual(audio.getnframes(), SAMPLE_RATE * DURATION_SECONDS)

    def test_fixture_bytes_are_deterministic(self):
        with tempfile.TemporaryDirectory() as directory:
            first = write_fixture(Path(directory) / "first.wav")
            second = write_fixture(Path(directory) / "second.wav")
            self.assertEqual(first.read_bytes(), second.read_bytes())


if __name__ == "__main__":
    unittest.main()
