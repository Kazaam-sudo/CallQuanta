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
