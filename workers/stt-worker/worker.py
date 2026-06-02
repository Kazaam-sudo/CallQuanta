"""STT worker entrypoint."""

import json
import os
import signal
import sys
from dataclasses import dataclass
from datetime import UTC, datetime

import redis
import requests
from sqlalchemy import create_engine, delete, select
from sqlalchemy.orm import Session, sessionmaker

from db import Call, SttProviderConfig, TranscriptSegment
from stt_language import normalize_stt_language, stt_initial_prompt

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql+psycopg://callquanta:callquanta@postgres:5432/callquanta")
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
TRANSCRIPTION_QUEUE = os.environ.get("TRANSCRIPTION_QUEUE", "transcription_jobs")
STT_MODE = os.environ.get("STT_MODE", "placeholder")
FASTER_WHISPER_MODEL = os.environ.get("FASTER_WHISPER_MODEL", "base")
FASTER_WHISPER_DEVICE = os.environ.get("FASTER_WHISPER_DEVICE", "cpu")
FASTER_WHISPER_COMPUTE_TYPE = os.environ.get("FASTER_WHISPER_COMPUTE_TYPE", "int8")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
running = True
_faster_whisper_models: dict[tuple[str, str, str], object] = {}


@dataclass
class SegmentResult:
    start_seconds: float
    end_seconds: float
    text: str
    speaker: str = "unknown"


@dataclass
class TranscriptionResult:
    segments: list[SegmentResult]
    provider_name: str
    provider_type: str
    model: str
    stt_language_used: str | None
    detected_language: str | None = None


@dataclass
class RuntimeProviderConfig:
    name: str
    provider_type: str
    model: str
    base_url: str | None = None
    api_key: str | None = None
    timeout_seconds: int = 180


class STTProvider:
    def transcribe(self, file_path: str, language: str | None, initial_prompt: str | None) -> TranscriptionResult:
        raise NotImplementedError


def safe_error(exc: Exception, limit: int = 2000) -> str:
    message = str(exc) or exc.__class__.__name__
    for key in ("OPENAI_API_KEY", "API_KEY", "SECRET", "TOKEN"):
        value = os.environ.get(key)
        if value:
            message = message.replace(value, "[redacted]")
    return message[:limit]


def handle_shutdown(signum, frame):
    del frame
    global running
    print(f"stt-worker received shutdown signal: {signum}")
    running = False


def get_faster_whisper_model(model_name: str):
    key = (model_name, FASTER_WHISPER_DEVICE, FASTER_WHISPER_COMPUTE_TYPE)
    if key not in _faster_whisper_models:
        print(
            "loading faster-whisper model "
            f"model={model_name} device={FASTER_WHISPER_DEVICE} compute_type={FASTER_WHISPER_COMPUTE_TYPE}"
        )
        from faster_whisper import WhisperModel

        _faster_whisper_models[key] = WhisperModel(
            model_name,
            device=FASTER_WHISPER_DEVICE,
            compute_type=FASTER_WHISPER_COMPUTE_TYPE,
        )
    return _faster_whisper_models[key]


class FasterWhisperLocalProvider(STTProvider):
    def __init__(self, config: RuntimeProviderConfig):
        self.config = config

    def transcribe(self, file_path: str, language: str | None, initial_prompt: str | None) -> TranscriptionResult:
        model_name = self.config.model or FASTER_WHISPER_MODEL
        model = get_faster_whisper_model(model_name)
        transcribe_kwargs = {}
        if language is not None:
            transcribe_kwargs["language"] = language
            if initial_prompt:
                transcribe_kwargs["initial_prompt"] = initial_prompt
        segments, info = model.transcribe(file_path, **transcribe_kwargs)
        segment_results = [
            SegmentResult(
                start_seconds=float(segment.start),
                end_seconds=float(segment.end),
                text=(segment.text or "").strip(),
            )
            for segment in segments
            if (segment.text or "").strip()
        ]
        return TranscriptionResult(
            segments=segment_results,
            provider_name=self.config.name,
            provider_type=self.config.provider_type,
            model=model_name,
            stt_language_used=language,
            detected_language=getattr(info, "language", None),
        )


class OpenAICompatibleAudioProvider(STTProvider):
    def __init__(self, config: RuntimeProviderConfig):
        self.config = config

    def transcribe(self, file_path: str, language: str | None, initial_prompt: str | None) -> TranscriptionResult:
        if not self.config.api_key:
            raise ValueError("API key is required for OpenAI-compatible audio transcription")
        if not self.config.base_url:
            raise ValueError("Base URL is required for OpenAI-compatible audio transcription")
        if not self.config.model:
            raise ValueError("Model is required for OpenAI-compatible audio transcription")
        data = {"model": self.config.model}
        if language:
            data["language"] = language
        if initial_prompt:
            data["prompt"] = initial_prompt
        url = f"{self.config.base_url.rstrip('/')}/audio/transcriptions"
        with open(file_path, "rb") as audio_file:
            response = requests.post(
                url,
                headers={"Authorization": f"Bearer {self.config.api_key}"},
                data=data,
                files={"file": (os.path.basename(file_path), audio_file)},
                timeout=self.config.timeout_seconds,
            )
        if not response.ok:
            try:
                provider_error = response.json()
            except ValueError:
                provider_error = (response.text or "")[:1000]
            raise ValueError(f"Hosted STT provider failed with HTTP {response.status_code}: {provider_error}")
        payload = response.json()
        text = (payload.get("text") or "").strip()
        segments_payload = payload.get("segments") if isinstance(payload, dict) else None
        segment_results: list[SegmentResult] = []
        if isinstance(segments_payload, list):
            for item in segments_payload:
                if not isinstance(item, dict):
                    continue
                item_text = str(item.get("text") or "").strip()
                if not item_text:
                    continue
                segment_results.append(
                    SegmentResult(
                        start_seconds=float(item.get("start") or 0),
                        end_seconds=float(item.get("end") or item.get("start") or 0),
                        text=item_text,
                    )
                )
        if not segment_results and text:
            segment_results = [SegmentResult(start_seconds=0, end_seconds=0, text=text)]
        return TranscriptionResult(
            segments=segment_results,
            provider_name=self.config.name,
            provider_type=self.config.provider_type,
            model=self.config.model,
            stt_language_used=language,
            detected_language=payload.get("language") if isinstance(payload, dict) else None,
        )


class NotImplementedSTTProvider(STTProvider):
    def __init__(self, config: RuntimeProviderConfig):
        self.config = config

    def transcribe(self, file_path: str, language: str | None, initial_prompt: str | None) -> TranscriptionResult:
        del file_path, language, initial_prompt
        raise NotImplementedError(f"STT provider '{self.config.provider_type}' can be configured but transcription is not implemented yet.")


def build_provider(config: RuntimeProviderConfig) -> STTProvider:
    if config.provider_type == "faster_whisper_local":
        return FasterWhisperLocalProvider(config)
    if config.provider_type == "openai_compatible_audio":
        return OpenAICompatibleAudioProvider(config)
    return NotImplementedSTTProvider(config)


def placeholder_segments(call_id: int):
    return [
        TranscriptSegment(call_id=call_id, speaker="agent", start_ms=0, end_ms=3200, text="Hello, thank you for calling. This is a placeholder transcript segment."),
        TranscriptSegment(call_id=call_id, speaker="customer", start_ms=3200, end_ms=7100, text="Hi, I need help with my account. Placeholder transcription is enabled in v0.3.0."),
    ]


def active_stt_provider_config(db: Session) -> RuntimeProviderConfig | None:
    saved = db.execute(select(SttProviderConfig).where(SttProviderConfig.is_active.is_(True)).order_by(SttProviderConfig.id.asc())).scalars().first()
    if not saved:
        return None
    return RuntimeProviderConfig(
        name=saved.name,
        provider_type=saved.provider_type,
        model=saved.model or FASTER_WHISPER_MODEL,
        base_url=saved.base_url,
        api_key=saved.api_key,
        timeout_seconds=int(saved.timeout_seconds or 180),
    )


def fallback_stt_provider_config() -> RuntimeProviderConfig | None:
    if STT_MODE == "faster_whisper":
        return RuntimeProviderConfig("Env faster-whisper", "faster_whisper_local", FASTER_WHISPER_MODEL)
    return None


def transcribe_with_provider(call: Call, config: RuntimeProviderConfig) -> TranscriptionResult:
    if not call.stored_path:
        raise ValueError(f"call {call.id} has no stored_path")
    stt_language = normalize_stt_language(call.language)
    initial_prompt = stt_initial_prompt(stt_language)
    print(
        f"call {call.id} transcription started: filename={call.filename or '-'}, provider={config.name}, "
        f"provider_type={config.provider_type}, model={config.model}, language_meta={call.language or '-'}, "
        f"stt_language={stt_language or 'auto'}"
    )
    if stt_language == "uz" and config.provider_type == "faster_whisper_local" and config.model.strip().lower() == "tiny":
        print(f"call {call.id} warning: local tiny model may be inaccurate for Uzbek. Consider a stronger local model or hosted STT provider.")
    result = build_provider(config).transcribe(call.stored_path, stt_language, initial_prompt)
    print(
        f"call {call.id} transcription completed: provider={result.provider_name}, provider_type={result.provider_type}, "
        f"model={result.model}, detected_language={result.detected_language or '-'}, segments={len(result.segments)}"
    )
    return result


def process_transcription_job(call_id: int) -> None:
    with SessionLocal() as db:
        call = db.get(Call, call_id)
        if not call:
            print(f"call {call_id} not found, skipping job")
            return

        try:
            call.status = "transcribing"
            call.last_error_type = None
            call.last_error_message = None
            db.commit()

            db.execute(delete(TranscriptSegment).where(TranscriptSegment.call_id == call_id))
            config = active_stt_provider_config(db)
            if config is None and STT_MODE == "placeholder":
                db.add_all(placeholder_segments(call_id))
                call.stt_provider_name = "Env placeholder"
                call.stt_provider_type = "placeholder"
                call.stt_model = "placeholder"
                call.stt_language_used = normalize_stt_language(call.language)
                call.detected_language = None
                print(f"call {call_id} transcribed with placeholder segments")
            else:
                config = config or fallback_stt_provider_config()
                if config is None:
                    raise ValueError(f"unsupported STT_MODE: {STT_MODE}")
                result = transcribe_with_provider(call, config)
                db.add_all([
                    TranscriptSegment(
                        call_id=call_id,
                        speaker=segment.speaker or "unknown",
                        start_ms=int(segment.start_seconds * 1000),
                        end_ms=int(segment.end_seconds * 1000),
                        text=segment.text,
                    )
                    for segment in result.segments
                ])
                call.stt_provider_name = result.provider_name
                call.stt_provider_type = result.provider_type
                call.stt_model = result.model
                call.stt_language_used = result.stt_language_used
                call.detected_language = result.detected_language

            call.status = "transcribed"
            call.last_error_type = None
            call.last_error_message = None
            call.last_processed_at = datetime.now(UTC)
            db.commit()
        except Exception as exc:
            db.rollback()
            call = db.get(Call, call_id)
            if call:
                call.status = "transcription_failed"
                call.last_error_type = "transcription"
                call.last_error_message = f"Transcription failed: {safe_error(exc)}"
                call.last_processed_at = datetime.now(UTC)
                db.commit()
            print(f"failed to process call {call_id}: {safe_error(exc)}")


signal.signal(signal.SIGINT, handle_shutdown)
signal.signal(signal.SIGTERM, handle_shutdown)


def run_worker() -> None:
    with SessionLocal() as db:
        active = active_stt_provider_config(db)
    if active:
        print(f"stt-worker started. active_provider={active.name} provider_type={active.provider_type} model={active.model}. Waiting for transcription jobs...")
    else:
        print(f"stt-worker started. no active STT provider; fallback mode={STT_MODE} model={FASTER_WHISPER_MODEL}. Waiting for transcription jobs...")

    while running:
        job = redis_client.brpop(TRANSCRIPTION_QUEUE, timeout=2)
        if not job:
            continue

        _, payload = job
        try:
            data = json.loads(payload)
            call_id = int(data["call_id"])
        except Exception:
            print(f"invalid transcription job payload: {payload}")
            continue

        process_transcription_job(call_id)

    print("stt-worker stopped gracefully.")


if __name__ == "__main__" and "pytest" not in sys.modules:
    run_worker()
