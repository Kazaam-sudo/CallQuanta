"""Supported STT audio languages and normalization helpers."""

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


def normalize_language_code(value: str | None) -> str | None:
    """Return the canonical API filter code for stored audio language values."""
    if value is None or not isinstance(value, str):
        return "auto"
    normalized = value.strip().lower()
    if normalized in {"", "-", "auto", "auto-detect", "autodetect", "none", "null"}:
        return "auto"
    code = normalized.replace("_", "-").split("-", 1)[0]
    return code or None


def normalize_stt_language(language: str | None) -> str | None:
    normalized = normalize_language_code(language)
    return None if normalized == "auto" else normalized
