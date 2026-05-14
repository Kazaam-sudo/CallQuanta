from abc import ABC, abstractmethod


class LLMProvider(ABC):
    @abstractmethod
    def analyze(self, prompt: str) -> str:
        raise NotImplementedError


class STTProvider(ABC):
    @abstractmethod
    def transcribe(self, audio_path: str) -> list[dict]:
        raise NotImplementedError


class TTSProvider(ABC):
    """Placeholder for future text-to-speech provider abstraction."""

    @abstractmethod
    def synthesize(self, text: str) -> bytes:
        raise NotImplementedError
