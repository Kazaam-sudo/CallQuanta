import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from stt_language import normalize_stt_language


def test_normalize_stt_language_locales_and_auto_values():
    cases = {
        "ru-RU": "ru",
        "ru_RU": "ru",
        "uz_UZ": "uz",
        "uz-UZ": "uz",
        "en-US": "en",
        "es-MX": "es",
        "auto": None,
        "": None,
        "-": None,
        None: None,
        "ru": "ru",
        "uz": "uz",
    }
    for value, expected in cases.items():
        assert normalize_stt_language(value) == expected


def test_ffmpeg_wav_command_uses_safe_audio_normalization_flags():
    from audio_normalization import build_ffmpeg_wav_command, is_decode_error, should_try_ffmpeg_fallback

    assert should_try_ffmpeg_fallback("call.ogg") is True
    assert should_try_ffmpeg_fallback("call.opus") is True
    assert should_try_ffmpeg_fallback("call.webm") is True
    assert should_try_ffmpeg_fallback("call.wav") is False
    assert build_ffmpeg_wav_command("input.ogg", "output.wav") == [
        "ffmpeg",
        "-y",
        "-i",
        "input.ogg",
        "-ar",
        "16000",
        "-ac",
        "1",
        "output.wav",
    ]
    assert is_decode_error(RuntimeError("PyAV failed to decode audio stream")) is True
