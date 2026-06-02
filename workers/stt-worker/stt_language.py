"""STT audio language normalization and faster-whisper prompt helpers."""

SUPPORTED_STT_LANGUAGES = [
    {"code": "auto", "label_en": "Auto-detect", "label_ru": "Определить автоматически", "whisper_code": None},
    {"code": "ru", "label_en": "Russian", "label_ru": "Русский", "whisper_code": "ru"},
    {"code": "uz", "label_en": "Uzbek", "label_ru": "Узбекский", "whisper_code": "uz"},
    {"code": "en", "label_en": "English", "label_ru": "Английский", "whisper_code": "en"},
    {"code": "es", "label_en": "Spanish", "label_ru": "Испанский", "whisper_code": "es"},
    {"code": "tr", "label_en": "Turkish", "label_ru": "Турецкий", "whisper_code": "tr"},
    {"code": "kk", "label_en": "Kazakh", "label_ru": "Казахский", "whisper_code": "kk"},
]

SUPPORTED_STT_LANGUAGE_CODES = {item["code"] for item in SUPPORTED_STT_LANGUAGES if item["code"] != "auto"}

INITIAL_PROMPTS = {
    "uz": "Transcribe the audio in Uzbek. Prefer Latin Uzbek script. Do not use Arabic script.",
    "ru": "Transcribe the audio in Russian.",
    "en": "Transcribe the audio in English.",
}


def normalize_stt_language(language: str | None) -> str | None:
    """Normalize stored audio-language metadata to faster-whisper language codes."""
    if language is None or not isinstance(language, str):
        return None
    normalized = language.strip().lower()
    if normalized in {"", "-", "auto", "auto-detect", "autodetect", "none", "null"}:
        return None
    code = normalized.replace("_", "-").split("-", 1)[0]
    return code or None


def stt_initial_prompt(language: str | None) -> str | None:
    normalized = normalize_stt_language(language)
    if normalized is None:
        return None
    return INITIAL_PROMPTS.get(normalized)
