"""Deterministic Borek decks for ``AI_EXECUTION_MODE=fixture`` (local dev and tests).

No model is called. The output has exactly the shape of the model reply
(``{"slides": [...]}``), so it goes through the same normalisation, validation,
rendering and persistence as a live plan. Text is copied from the frozen sources and
clipped to what the ``matrix_notes`` layout can hold on one line per row.
"""

from __future__ import annotations

import re
from typing import Any

from services.presentation.borek_deck.sources import client_name
from services.presentation.post_meeting import MEETING_SECTION_KEYS
from services.presentation.ppt1_constraints import is_ppt1_commercial_text

_PAGE_KICKERS = {
    "client_context": ("Client context", "What we know about you"),
    "opportunity": ("Opportunity", "What we want to explore"),
    "borek_approach": ("Our approach", "How Borek would approach it"),
    "relevant_use_case": ("Use case", "A relevant Borek use case"),
    "pilot_proposal": ("Pilot", "A possible pilot"),
    "next_steps": ("Next steps", "How we proceed"),
}
_SECTION_TITLES = {
    "requirements": "What we heard: requirements",
    "challenges": "What we heard: challenges",
    "priorities": "What we heard: priorities",
    "opportunities": "Opportunities from the meeting",
    "discussed_solutions": "Solutions we discussed",
    "decisions": "Decisions from the meeting",
    "follow_ups": "Follow-ups",
}
_SKIP_KEYS = frozenset({"origin", "status", "schema_version", "source_refs", "order"})
_PRE_MAX_PAGES = 5  # cover + who_we_are + pages + closing must stay within 8 slides
_ROWS = 7
_ROW_TEXT = 56
_ROW_TITLE = 22


def deterministic_pre_meeting_deck(approved_discovery: dict[str, Any]) -> dict[str, Any]:
    pages = _pages_by_key(approved_discovery["pages"])
    name = client_name(approved_discovery["pages"]) or "Borek Solutions Group"
    cover_lines = _lines(pages.get("cover", {}).get("content"), drop=is_ppt1_commercial_text)
    purpose = _field(pages.get("cover", {}).get("content"), "meeting_purpose")
    if is_ppt1_commercial_text(purpose):
        purpose = ""
    slides: list[dict[str, Any]] = [
        {
            "layout": "cover",
            "kicker": _clip("Borek AI Tech" + (f" · {purpose}" if purpose else ""), 56),
            "title": f"{_clip(name, 28)}\nFirst meeting",
            "intro": _clip(purpose or (cover_lines[0] if cover_lines else ""), 220),
            "sources": ["discovery.cover"],
        },
        {"layout": "who_we_are"},
    ]
    content_pages = []
    for key in _PAGE_KICKERS:
        lines = _lines(pages.get(key, {}).get("content"), drop=is_ppt1_commercial_text)
        if lines:
            content_pages.append((key, lines))
    if len(content_pages) > _PRE_MAX_PAGES:
        content_pages = content_pages[: _PRE_MAX_PAGES - 1] + content_pages[-1:]
    for key, lines in content_pages:
        slides.append(_list_slide(*_PAGE_KICKERS[key], lines, [f"discovery.{key}"]))
    slides.append({"layout": "closing", "title": "Let’s talk", "tagline": "We look forward to the conversation.", "sources": []})
    return {"slides": slides}


def deterministic_post_meeting_deck(ppt2_input: dict[str, Any]) -> dict[str, Any]:
    pages = _pages_by_key(ppt2_input["approved_discovery"]["pages"])
    name = client_name(ppt2_input["approved_discovery"]["pages"]) or "Borek Solutions Group"
    purpose = _field(pages.get("cover", {}).get("content"), "meeting_purpose")
    slides: list[dict[str, Any]] = [
        {
            "layout": "cover",
            "kicker": _clip("Borek" + (f" · {purpose}" if purpose else ""), 56),
            "title": f"{_clip(name, 28)}\nAfter our meeting",
            "intro": _clip(purpose, 220),
            "sources": ["discovery.cover"],
        },
        {"layout": "who_we_are"},
    ]
    for key, (kicker, title) in _PAGE_KICKERS.items():
        lines = _lines(pages.get(key, {}).get("content"))
        if lines:
            slides.append(_list_slide(kicker, title, lines, [f"discovery.{key}"]))
    notes = str((ppt2_input.get("personal_notes") or {}).get("text") or "").strip()
    if notes:
        slides.append(_list_slide("Our notes", "Notes from the meeting", _sentences(notes), ["notes"]))
    extraction = (ppt2_input.get("meeting_extraction") or {}).get("extraction") or {}
    for key in MEETING_SECTION_KEYS:
        items = [str(item).strip() for item in extraction.get(key) or [] if str(item).strip()]
        for index in range(0, len(items), _ROWS):
            chunk = items[index : index + _ROWS]
            title = _SECTION_TITLES[key] + (f" ({index // _ROWS + 1})" if len(items) > _ROWS else "")
            slides.append(_list_slide("Meeting", title, chunk, [f"meeting.{key}"]))
    use_cases = [
        item
        for item in (ppt2_input.get("selected_use_cases") or {}).get("use_cases") or []
        if isinstance(item, dict) and item.get("fact_id") and str(item.get("statement") or "").strip()
    ]
    for index in range(0, len(use_cases), 2):
        chunk = use_cases[index : index + 2]
        slides.append(
            {
                "layout": "matrix_notes",
                "kicker": "Use cases",
                "title": "Relevant Borek use cases",
                "lead": "Approved reference material from earlier Borek projects.",
                "rows": [],
                "notes": [
                    {
                        "title": _clip(_use_case_title(item), 40),
                        "text": _clip(str(item["statement"]), 300),
                    }
                    for item in chunk
                ],
                "sources": [f"use_case.{item['fact_id']}" for item in chunk],
            }
        )
    slides.append({"layout": "closing", "title": "Let’s talk", "tagline": "Thank you for the conversation.", "sources": []})
    return {"slides": slides}


def _list_slide(kicker: str, title: str, lines: list[str], sources: list[str]) -> dict[str, Any]:
    lead, rest = lines[0], lines[1:]
    rows = []
    for index, line in enumerate(rest[:_ROWS], start=1):
        label, _, value = line.partition(": ")
        if value and len(label) <= _ROW_TITLE:
            rows.append({"code": f"{index:02d}", "title": label, "text": _clip(value, _ROW_TEXT)})
        else:
            rows.append({"code": f"{index:02d}", "title": "", "text": _clip(line, _ROW_TEXT + _ROW_TITLE)})
    return {
        "layout": "matrix_notes",
        "kicker": kicker,
        "title": _clip(title, 60),
        "lead": _clip(lead.partition(": ")[2] or lead, 200),
        "rows": rows,
        "sources": sources,
    }


def _use_case_title(item: dict[str, Any]) -> str:
    """``reference.warehouse.delivery-pattern`` -> ``Warehouse`` when the use case has no title."""
    title = str(item.get("title") or "").strip()
    if title:
        return title
    parts = str(item["fact_id"]).split(".")
    return (parts[1] if len(parts) > 2 else parts[-1]).replace("-", " ").capitalize()


def _pages_by_key(pages: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {str(page.get("key")): page for page in pages if isinstance(page, dict)}


def _field(content: Any, key: str) -> str:
    if isinstance(content, dict):
        return " ".join(str(content.get(key) or "").split())
    return ""


def _lines(content: Any, *, drop=None, label: str = "") -> list[str]:
    found: list[str] = []

    def walk(node: Any, name: str) -> None:
        if isinstance(node, str):
            text = " ".join(node.split())
            if text and not (drop and drop(text)):
                found.append(f"{name}: {text}" if name else text)
        elif isinstance(node, list):
            for item in node:
                walk(item, name)
        elif isinstance(node, dict):
            if set(node) - _SKIP_KEYS <= {"label", "value"} and node.get("value"):
                walk(node["value"], str(node.get("label") or name))
                return
            for key, item in node.items():
                if key not in _SKIP_KEYS:
                    walk(item, str(key).replace("_", " "))

    walk(content, label)
    return found


def _sentences(text: str) -> list[str]:
    parts = [part.strip() for part in re.split(r"(?<=[.!?])\s+|\n+", text) if part.strip()]
    return parts or [text]


def _clip(text: str, limit: int) -> str:
    compact = " ".join(str(text).split())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1].rstrip() + "…"
