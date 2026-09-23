"""Deterministic JJ-32-shaped JSON from TRANSCRIPT_SUMMARY (fixture / demo path)."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any

from services.followup.extraction import (
    PROMPT_VERSION,
    SCHEMA_VERSION,
    normalize_followup_extraction,
    validate_followup_extraction,
)

DATE_TOKEN = re.compile(r"\b(\d{2}\.\d{2}\.\d{4})\b")
OWNER_IN_ACTION = re.compile(
    r"^(?P<name>[A-Za-z][A-Za-z .'()/-]{1,60})\s*:\s*(?P<action>.+)$"
)


def default_meeting_date(summary: dict[str, Any]) -> str:
    narrative = str(summary.get("narrative") or "")
    found = DATE_TOKEN.findall(narrative)
    if found:
        return found[0]
    return datetime.now(UTC).strftime("%d.%m.%Y")


def normalize_topic(text: str) -> str:
    words = [part for part in (text or "").split() if part]
    if not words:
        return "Client meeting"
    return " ".join(words[:4])


def _clip_words(text: str, limit: int) -> str:
    words = [part for part in text.split() if part]
    return " ".join(words[:limit])


def _participants_from_summary(summary: dict[str, Any]) -> list[dict[str, Any | None]]:
    people: list[dict[str, Any | None]] = []
    for raw in summary.get("participants") or []:
        label = str(raw).strip()
        if not label:
            continue
        if "(" in label and label.endswith(")"):
            name, _, org = label.partition("(")
            people.append({"name": name.strip(), "organisation": org.rstrip(")").strip() or None})
        else:
            people.append({"name": label, "organisation": None})
    return people


def _key_points_from_summary(summary: dict[str, Any]) -> list[str]:
    points: list[str] = []
    for decision in summary.get("decisions") or []:
        text = _clip_words(str(decision).strip(), 20)
        if text and text not in points:
            points.append(text)
        if len(points) >= 3:
            return points
    narrative = str(summary.get("narrative") or "")
    for sentence in re.split(r"(?<=[.!?])\s+", narrative):
        cleaned = _clip_words(sentence.strip(), 20)
        if len(cleaned.split()) >= 4 and cleaned not in points:
            points.append(cleaned)
        if len(points) >= 3:
            break
    return points[:3]


def _action_items_from_sections(
    sections: list[dict[str, Any]],
    *,
    meeting_date: str,
) -> list[dict[str, str]]:
    from services.followup.extraction import resolve_relative_due

    items: list[dict[str, str]] = []
    for section in sections:
        owner = str(section.get("speaker_role") or section.get("speaker") or "").strip()
        action = str(section.get("content") or section.get("text") or "").strip()
        if not owner or not action or not re.search(r"\bwill\b", action, re.IGNORECASE):
            continue
        found = DATE_TOKEN.findall(action)
        due = resolve_relative_due(found[0] if found else "TBD", meeting_date)
        items.append({"action": action, "owner": owner, "due": due})
    return items[:5]


def _action_items_from_transcript(transcript: str, *, meeting_date: str) -> list[dict[str, str]]:
    from services.followup.extraction import resolve_relative_due

    items: list[dict[str, str]] = []
    for line in transcript.splitlines():
        if not re.search(r"\bwill\b", line, re.IGNORECASE):
            continue
        match = OWNER_IN_ACTION.match(line.strip())
        if not match:
            continue
        action = match.group("action").strip()
        owner = match.group("name").strip()
        found = DATE_TOKEN.findall(action)
        due = resolve_relative_due(found[0] if found else "TBD", meeting_date)
        items.append({"action": action, "owner": owner, "due": due})
    return items[:5]


def _action_items_from_summary(
    summary: dict[str, Any],
    *,
    meeting_date: str,
    transcript: str = "",
    sections: list[dict[str, Any]] | None = None,
) -> list[dict[str, str]]:
    from services.followup.extraction import resolve_relative_due

    if sections:
        items = _action_items_from_sections(sections, meeting_date=meeting_date)
    else:
        items = _action_items_from_transcript(transcript, meeting_date=meeting_date)
    seen = {item["action"] for item in items}
    for raw in summary.get("action_items") or []:
        if not isinstance(raw, dict):
            continue
        text = str(raw.get("text") or "").strip()
        if not text or text in seen:
            continue
        owner = str(raw.get("owner") or "").strip()
        action = text
        match = OWNER_IN_ACTION.match(text)
        if match:
            owner = owner or match.group("name").strip()
            action = match.group("action").strip()
        if not owner:
            continue
        due_raw = str(raw.get("due") or "").strip()
        if not due_raw:
            found = DATE_TOKEN.findall(text)
            due_raw = found[0] if found else "TBD"
        due = resolve_relative_due(due_raw, meeting_date)
        items.append({"action": action, "owner": owner, "due": due})
        seen.add(action)
    return items[:5]


def extract_followup_from_summary(
    summary: dict[str, Any],
    *,
    meeting_topic: str,
    calendar_meeting_date: str | None = None,
    transcript_haystack: str | None = None,
    sections: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build schema-valid follow-up extraction without a live LLM."""
    meeting_date = calendar_meeting_date or default_meeting_date(summary)
    transcript = (transcript_haystack or str(summary.get("narrative") or "")).strip()
    raw = {
        "meeting_topic": normalize_topic(meeting_topic),
        "meeting_date": meeting_date,
        "project_name": None,
        "participants": _participants_from_summary(summary),
        "key_points": _key_points_from_summary(summary),
        "decisions": [str(item).strip() for item in summary.get("decisions") or [] if str(item).strip()],
        "action_items": _action_items_from_summary(
            summary,
            meeting_date=meeting_date,
            transcript=transcript,
            sections=sections,
        ),
        "open_questions": [str(item).strip() for item in summary.get("open_questions") or [] if str(item).strip()],
        "next_meeting": None,
        "confidence": {"key_points": "high", "action_items": "high"},
        "review_flags": [],
    }
    payload = normalize_followup_extraction(
        raw,
        transcript=transcript,
        calendar_meeting_date=meeting_date,
    )
    payload["schema_version"] = SCHEMA_VERSION
    payload["prompt_version"] = PROMPT_VERSION
    return validate_followup_extraction(payload)
