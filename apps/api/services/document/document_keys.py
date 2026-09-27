"""Stable document keys for First contact client-document provenance."""

from __future__ import annotations

import re

_DOCUMENT_KEY_RE = re.compile(r"^D(\d+)$")


def next_document_key(existing: list[str]) -> str:
    numbers = [
        int(match.group(1))
        for value in existing
        if (match := _DOCUMENT_KEY_RE.match(str(value or "").strip()))
    ]
    return f"D{(max(numbers) + 1) if numbers else 1}"
