from .interfaces import LLMProvider


class OpenAICompatibleProvider(LLMProvider):
    def __init__(self, base_url: str, model: str, api_key: str | None = None):
        self.base_url = base_url
        self.model = model
        self.api_key = api_key

    def analyze(self, prompt: str) -> str:
        # TODO: send request to OpenAI-compatible chat completions endpoint.
        return f"stub analysis from {self.model}: {prompt[:64]}"
