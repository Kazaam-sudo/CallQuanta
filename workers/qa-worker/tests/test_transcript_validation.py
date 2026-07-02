import importlib.util
from pathlib import Path
from types import SimpleNamespace

MODULE_PATH = Path(__file__).resolve().parents[1] / "transcript_validation.py"
spec = importlib.util.spec_from_file_location("transcript_validation", MODULE_PATH)
validation = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(validation)


def segment(text):
    return SimpleNamespace(text=text)


def test_placeholder_transcript_is_invalid():
    call = SimpleNamespace(duration_seconds=60, language="en")
    result = validation.validate_transcript_for_qa(call, [segment("This is a placeholder transcript segment")])
    assert result["is_valid"] is False
    assert "placeholder_transcript" in result["flags"]


def test_too_short_transcript_is_invalid_for_duration():
    call = SimpleNamespace(duration_seconds=300, language="en")
    result = validation.validate_transcript_for_qa(call, [segment("hello customer")])
    assert result["is_valid"] is False
    assert "too_short" in result["flags"]
