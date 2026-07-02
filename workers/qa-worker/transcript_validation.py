from typing import Any, Protocol


class TranscriptSegmentLike(Protocol):
    text: str | None


def validate_transcript_for_qa(call: Any, segments: list[TranscriptSegmentLike]) -> dict[str, Any]:
    """Detect transcripts that are unsafe for QA scoring."""
    text = " ".join((segment.text or "") for segment in segments).strip()
    lowered = text.lower()
    words = [w for w in lowered.replace("/", " ").split() if any(ch.isalpha() for ch in w)]
    flags: list[str] = []
    reasons: list[str] = []

    if not text or not words:
        flags.append("empty_transcript")
        reasons.append("Transcript is empty.")
    if "placeholder transcript segment" in lowered or "this is a placeholder transcript segment" in lowered:
        flags.append("placeholder_transcript")
        reasons.append("Placeholder transcript text was found.")
    if lowered.count("placeholder") >= 2:
        flags.append("placeholder_transcript")
        reasons.append("The word placeholder appears repeatedly.")

    generic_phrases = (
        "demo transcript", "sample transcript", "fallback transcript", "test transcript",
        "transcription is not available", "no transcript available", "audio transcription placeholder",
    )
    if any(phrase in lowered for phrase in generic_phrases):
        flags.append("low_content")
        reasons.append("Transcript appears to contain only generic demo/fallback text.")

    unique_words = set(words)
    if words and (len(words) < 8 or len(unique_words) <= 4):
        flags.append("low_content")
        reasons.append("Transcript has too little meaningful customer/operator content.")

    duration_seconds = getattr(call, "duration_seconds", None) or 0
    if duration_seconds >= 30 and len(words) < max(12, int(duration_seconds / 10)):
        flags.append("too_short")
        reasons.append("Transcript is too short for the call duration.")

    selected_language = str(getattr(call, "language", "") or "").lower()
    cyrillic = sum(1 for ch in text if "а" <= ch.lower() <= "я" or ch == "ё")
    latin = sum(1 for ch in text if "a" <= ch.lower() <= "z")
    if selected_language.startswith("ru") and latin >= 30 and cyrillic == 0:
        flags.append("possible_wrong_language")
        reasons.append("Transcript language appears inconsistent with selected call language.")
    if selected_language.startswith("en") and cyrillic >= 30 and latin < 10:
        flags.append("possible_wrong_language")
        reasons.append("Transcript language appears inconsistent with selected call language.")

    flags = list(dict.fromkeys(flags))
    reasons = list(dict.fromkeys(reasons))
    return {"is_valid": not flags, "reason": " ".join(reasons), "flags": flags}
