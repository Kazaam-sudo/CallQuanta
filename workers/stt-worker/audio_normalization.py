"""Audio normalization helpers for local STT decoding fallbacks."""

import subprocess
import tempfile
from pathlib import Path

FFMPEG_FALLBACK_EXTENSIONS = {".ogg", ".opus", ".webm", ".m4a", ".aac", ".mp3", ".flac"}
DECODE_ERROR_MARKERS = (
    "decode",
    "decoder",
    "demux",
    "invalid data",
    "could not open",
    "failed to open",
    "audio",
    "averror",
    "ffmpeg",
    "format",
    "codec",
)


def should_try_ffmpeg_fallback(file_path: str) -> bool:
    return Path(file_path).suffix.lower() in FFMPEG_FALLBACK_EXTENSIONS


def is_decode_error(exc: Exception) -> bool:
    message = f"{exc.__class__.__name__}: {exc}".lower()
    return any(marker in message for marker in DECODE_ERROR_MARKERS)


def build_ffmpeg_wav_command(input_path: str, output_path: str) -> list[str]:
    return ["ffmpeg", "-y", "-i", input_path, "-ar", "16000", "-ac", "1", output_path]


def convert_audio_to_wav(input_path: str) -> str:
    temp_file = tempfile.NamedTemporaryFile(prefix="callquanta_stt_", suffix=".wav", delete=False)
    output_path = temp_file.name
    temp_file.close()
    command = build_ffmpeg_wav_command(input_path, output_path)
    try:
        completed = subprocess.run(command, check=False, capture_output=True, text=True, timeout=300)
    except Exception:
        Path(output_path).unlink(missing_ok=True)
        raise
    if completed.returncode != 0:
        Path(output_path).unlink(missing_ok=True)
        stderr = (completed.stderr or completed.stdout or "ffmpeg conversion failed").strip()
        raise RuntimeError(f"ffmpeg audio normalization failed with exit code {completed.returncode}: {stderr[:1000]}")
    return output_path
