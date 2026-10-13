"""BT-44 meeting extraction. Transcript and owner notes stay separate sources."""

from __future__ import annotations

import copy
import json
import re
from collections.abc import Callable
from pathlib import Path
from typing import Any

import jsonschema

from llm.claude.client import (
    CLAUDE_STRUCTURED_MAX_TOKENS,
    ClaudeClientError,
    sonnet_model,
    structured_complete,
)
from services.observability.llm_logger import run_logged_llm_call

PROMPT_VERSION = "meeting-extraction:v1"
SCHEMA_VERSION = "1.0"
STAGE_MEETING_EXTRACTION = "meeting_extraction"
CATEGORIES = (
    "requirements",
    "challenges",
    "priorities",
    "opportunities",
    "discussed_solutions",
    "decisions",
    "follow_ups",
)
# The fixture extractor reads explicitly labelled statements only ("Requirement: ..."). It does
# not interpret conversation. In front of the label a line may carry a list bullet, a time stamp
# and a speaker name, as transcripts and notes usually do:
#     - [02:15] Daniel: Requirement: Reduce support response time
_LINE_LEAD = (
    r"(?i)^\s*(?:[-*\u2022]\s+)?"  # list bullet
    r"(?:[\[(]?\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?[\])]?\s*(?:[-\u2013\u2014]\s*)?)?"  # time stamp
    r"(?:[A-Za-z][A-Za-z0-9 .'\-_()]{0,80}:\s*)??"  # speaker name
)
_LABELS: tuple[tuple[str, str], ...] = (
    ("requirements", r"requirements?"),
    ("challenges", r"challenges?"),
    ("priorities", r"priorit(?:y|ies)"),
    ("opportunities", r"opportunit(?:y|ies)"),
    ("discussed_solutions", r"discussed solutions?"),
    ("decisions", r"decisions?"),
    ("follow_ups", r"follow[- ]?ups?"),
)
_LINE_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (category, re.compile(_LINE_LEAD + r"(?:" + label + r")\s*:\s*(.+)$")) for category, label in _LABELS
)

_REPO_ROOT = Path(__file__).resolve().parents[4]
_SCHEMA_PATH = _REPO_ROOT / "packages" / "contracts" / "meeting_extraction.schema.json"
_PROMPT_PATH = _REPO_ROOT / "apps" / "api" / "llm" / "claude" / "prompts" / "meeting_extraction_v1.txt"

ClaudeComplete = Callable[[str, str, dict[str, Any]], dict[str, Any]]


class MeetingExtractionError(ValueError):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.user_message = message


def load_meeting_extraction_schema() -> dict[str, Any]:
    return json.loads(_SCHEMA_PATH.read_text(encoding="utf-8"))


def validate_meeting_extraction(payload: dict[str, Any]) -> dict[str, Any]:
    jsonschema.Draft202012Validator(load_meeting_extraction_schema()).validate(payload)
    return payload


def transcript_text_from_sections(sections: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for section in sections:
        speaker = str(section.get("speaker_role") or section.get("speaker") or "Speaker").strip()
        text = str(section.get("content") or section.get("text") or "").strip()
        if text:
            lines.append(f"{speaker}: {text}")
    return "\n".join(lines)


def build_separated_user_message(*, transcript_text: str, personal_notes: str | None) -> str:
    """Label the two sources. Do not join them into one unlabeled blob."""
    notes = (personal_notes or "").strip()
    return "\n".join(
        [
            "TRANSCRIPT:",
            transcript_text.strip() or "(none)",
            "",
            "OWNER PERSONAL NOTES:",
            notes or "(none)",
        ]
    )


def extract_meeting_categories(
    *,
    sections: list[dict[str, Any]],
    personal_notes: str | None,
    live: bool,
    opportunity_id: str | None = None,
    complete: ClaudeComplete | None = None,
) -> dict[str, list[str]]:
    transcript_text = transcript_text_from_sections(sections)
    if live:
        return _extract_live(
            transcript_text=transcript_text,
            personal_notes=personal_notes,
            opportunity_id=opportunity_id,
            complete=complete,
        )
    return _extract_fixture(sections=sections, personal_notes=personal_notes)


def _empty_categories() -> dict[str, list[str]]:
    return {category: [] for category in CATEGORIES}


def _append_unique(items: list[str], value: str) -> None:
    """Keep the first wording of a statement; a repeat that differs only in case, spacing or the
    final full stop is the same finding."""
    text = value.strip()
    key = " ".join(text.casefold().split()).rstrip(".")
    if text and key not in {" ".join(item.casefold().split()).rstrip(".") for item in items}:
        items.append(text)


def _collect_marked_lines(source: str, categories: dict[str, list[str]]) -> None:
    for raw_line in source.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        for category, pattern in _LINE_PATTERNS:
            match = pattern.match(line)
            if match:
                _append_unique(categories[category], match.group(1))
                break


def _extract_fixture(
    *,
    sections: list[dict[str, Any]],
    personal_notes: str | None,
) -> dict[str, list[str]]:
    categories = _empty_categories()
    for section in sections:
        _collect_marked_lines(str(section.get("content") or section.get("text") or ""), categories)
    if personal_notes and personal_notes.strip():
        _collect_marked_lines(personal_notes, categories)
    return categories


def _category_tool_schema() -> dict[str, Any]:
    string_array = {
        "type": "array",
        "items": {"type": "string", "minLength": 1},
    }
    return {
        "type": "object",
        "additionalProperties": False,
        "required": list(CATEGORIES),
        "properties": {category: string_array for category in CATEGORIES},
    }


def _string_items(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    items: list[str] = []
    for item in value:
        if isinstance(item, str):
            _append_unique(items, item)
    return items


def _is_grounded(item: str, transcript_text: str, personal_notes: str | None) -> bool:
    needle = item.casefold()
    if needle in transcript_text.casefold():
        return True
    notes = (personal_notes or "").casefold()
    return bool(notes) and needle in notes


ITEM_SOURCES = ("transcript", "personal_notes", "both")


def classify_item_sources(
    categories: dict[str, list[str]],
    *,
    sections: list[dict[str, Any]],
    personal_notes: str | None,
) -> dict[str, list[str]]:
    """Where each extracted item is found: the transcript, the owner's notes, or both.

    Aligned with ``categories`` item by item. Both extraction modes only keep items that occur
    verbatim in one of the two sources, so every item resolves to at least one of them.
    """
    transcript = transcript_text_from_sections(sections).casefold()
    notes = (personal_notes or "").casefold()
    sources: dict[str, list[str]] = {}
    for category in CATEGORIES:
        labels: list[str] = []
        for item in categories.get(category, []):
            needle = item.casefold()
            in_transcript = needle in transcript
            in_notes = bool(notes) and needle in notes
            if in_transcript and in_notes:
                labels.append("both")
            elif in_notes:
                labels.append("personal_notes")
            elif in_transcript:
                labels.append("transcript")
            else:
                raise MeetingExtractionError("An extracted item is not supported by the transcript or the notes.")
        sources[category] = labels
    return sources


def _extract_live(
    *,
    transcript_text: str,
    personal_notes: str | None,
    opportunity_id: str | None,
    complete: ClaudeComplete | None,
) -> dict[str, list[str]]:
    system = _PROMPT_PATH.read_text(encoding="utf-8")
    user = build_separated_user_message(
        transcript_text=transcript_text,
        personal_notes=personal_notes,
    )
    tool_schema = _category_tool_schema()
    runner = complete or _anthropic_complete

    def invoke() -> dict[str, Any]:
        return _anthropic_complete(system, user, tool_schema)

    if complete is None:
        raw = run_logged_llm_call(
            stage=STAGE_MEETING_EXTRACTION,
            prompt_version=PROMPT_VERSION,
            model=sonnet_model(),
            attempt=1,
            opportunity_id=opportunity_id,
            invoke=invoke,
        )
    else:
        raw = runner(system, user, tool_schema)
    if not isinstance(raw, dict):
        raise MeetingExtractionError("Claude did not return a JSON object for the meeting extraction.")
    categories = _empty_categories()
    for category in CATEGORIES:
        for item in _string_items(raw.get(category)):
            if _is_grounded(item, transcript_text, personal_notes):
                _append_unique(categories[category], item)
    return categories


def _anthropic_complete(system: str, user: str, schema: dict[str, Any]) -> dict[str, Any]:
    try:
        raw = structured_complete(
            system,
            user,
            schema,
            tool_name="submit_meeting_extraction",
            tool_description="Submit the seven meeting-extraction arrays. Empty arrays are valid.",
            max_tokens=CLAUDE_STRUCTURED_MAX_TOKENS,
            temperature=0,
        )
    except ClaudeClientError as exc:
        raise MeetingExtractionError(exc.user_message) from exc
    if not isinstance(raw, dict):
        raise MeetingExtractionError("Claude did not return a JSON object for the meeting extraction.")
    return copy.deepcopy(raw)
