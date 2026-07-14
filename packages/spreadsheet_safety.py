from __future__ import annotations

from collections.abc import Iterable
from typing import Any

DANGEROUS_PREFIXES = ("=", "+", "-", "@")


def safe_spreadsheet_value(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    stripped = value.lstrip()
    if stripped.startswith(DANGEROUS_PREFIXES):
        return f"'{value}"
    return value


def safe_spreadsheet_row(values: Iterable[Any]) -> list[Any]:
    return [safe_spreadsheet_value(value) for value in values]
