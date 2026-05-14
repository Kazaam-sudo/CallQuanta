from .interfaces import STTProvider


class FasterWhisperProvider(STTProvider):
    def transcribe(self, audio_path: str) -> list[dict]:
        # TODO: integrate faster-whisper inference.
        return [{"speaker": "agent", "text": "stub transcript", "audio": audio_path}]
