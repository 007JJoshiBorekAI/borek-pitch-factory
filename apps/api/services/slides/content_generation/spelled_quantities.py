"""Rewrite digit forms that only restate a spelled quantity in the source chapters."""

from __future__ import annotations

import re
from typing import Any

_ONES = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
    "seventeen": 17,
    "eighteen": 18,
    "nineteen": 19,
    "twenty": 20,
    "thirty": 30,
    "forty": 40,
    "fifty": 50,
    "sixty": 60,
    "seventy": 70,
    "eighty": 80,
    "ninety": 90,
}

_THOUSAND = re.compile(
    r"\b(" + "|".join(_ONES) + r")\s+thousand\b",
    re.IGNORECASE,
)
_DAY = re.compile(
    r"\b(" + "|".join(_ONES) + r")-day\b",
    re.IGNORECASE,
)


def _source_text(chapters: Any) -> str:
    parts: list[str] = []

    def walk(value: Any) -> None:
        if isinstance(value, str):
            parts.append(value)
            return
        if isinstance(value, dict):
            for item in value.values():
                walk(item)
            return
        if isinstance(value, (list, tuple)):
            for item in value:
                walk(item)

    walk(chapters)
    return "\n".join(parts)


def restore_spelled_quantities(value: Any, chapters: Any) -> Any:
    """Rewrite spelled-quantity digits throughout a slide spec or chapter tree."""
    if isinstance(value, str):
        return restore_spelled_quantity_text(value, chapters)
    if isinstance(value, list):
        for index, item in enumerate(value):
            value[index] = restore_spelled_quantities(item, chapters)
        return value
    if isinstance(value, dict):
        for key, item in list(value.items()):
            value[key] = restore_spelled_quantities(item, chapters)
        return value
    return value


def restore_spelled_quantity_text(text: str, chapters: Any) -> str:
    """Turn 3.000 back into 'three thousand' when that phrase is in the source.

    German-style 3.000 and English 3,000 both mean three thousand. Leaving the
    digits in place fails grounding, and 3.000 reads as three on an English slide.
    Bare digits such as 3 in '3-way' are left alone.
    """
    source = _source_text(chapters)
    updated = text
    for match in _THOUSAND.finditer(source):
        word = match.group(1).lower()
        amount = _ONES[word] * 1000
        grouped = f"{amount:,}"
        german = grouped.replace(",", ".")
        pattern = re.compile(
            rf"\b(?:{amount}|{re.escape(grouped)}|{re.escape(german)})\b"
        )
        updated = pattern.sub(f"{word} thousand", updated)
    for match in _DAY.finditer(source):
        word = match.group(1).lower()
        pattern = re.compile(rf"\b{_ONES[word]}-day\b", re.IGNORECASE)
        updated = pattern.sub(f"{word}-day", updated)
    return updated
