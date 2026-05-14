import logging

from fastapi import FastAPI, File, UploadFile
from pydantic import BaseModel

app = FastAPI(title="CallQuanta API", version="0.1.0")
logger = logging.getLogger("callquanta.api")

CALLS = []


class ProviderTestRequest(BaseModel):
    provider_type: str
    base_url: str
    api_key: str | None = None


@app.get("/health")
def health() -> dict[str, str]:
    logger.info("Health check requested")
    return {"status": "ok"}


@app.on_event("startup")
def on_startup() -> None:
    logging.basicConfig(level=logging.INFO)
    logger.info("CallQuanta API started")


@app.post("/calls/upload")
async def upload_call(file: UploadFile = File(...)) -> dict:
    call = {"id": len(CALLS) + 1, "filename": file.filename, "status": "uploaded"}
    CALLS.append(call)
    return call


@app.get("/calls")
def list_calls() -> list[dict]:
    return CALLS


@app.get("/calls/{call_id}")
def get_call(call_id: int) -> dict:
    return next((c for c in CALLS if c["id"] == call_id), {"error": "not found"})


@app.post("/calls/{call_id}/transcribe")
def transcribe_call(call_id: int) -> dict:
    # TODO: enqueue STT worker job
    return {"call_id": call_id, "status": "transcription_queued"}


@app.post("/calls/{call_id}/analyze")
def analyze_call(call_id: int) -> dict:
    # TODO: enqueue QA analysis worker job
    return {"call_id": call_id, "status": "analysis_queued"}


@app.get("/settings/providers")
def list_providers() -> dict:
    return {
        "llm": ["openai_compatible"],
        "stt": ["faster_whisper"],
        "tts": [],
    }


@app.post("/settings/providers/test")
def test_provider(payload: ProviderTestRequest) -> dict:
    # TODO: perform real provider connectivity test
    return {"ok": True, "provider_type": payload.provider_type}
