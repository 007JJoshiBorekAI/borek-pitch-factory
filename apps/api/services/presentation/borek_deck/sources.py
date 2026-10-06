"""Turn the frozen PPT #1 / PPT #2 inputs into the text materials the deck prompt reads.

Both inputs are the same in-memory adapters the existing planners use:

* PPT #1 (pre-meeting): ``first_pitch.planning_input_from_approved_paper``
* PPT #2 (post-meeting): ``post_meeting.planning_input_from_ppt2_context``

Rules carried over from ``post_meeting.py``: the four PPT #2 sources stay separate
(one labelled block each), a missing source is omitted, ``source_priority`` is only an
authority order for conflicting claims, and every block header carries the reference id
(``discovery.<page>``, ``notes``, ``meeting.<section>``, ``use_case.<fact_id>``) that a
slide must cite in its ``sources`` list.
"""

from __future__ import annotations

from typing import Any

from services.presentation.post_meeting import (
    MEETING_SECTION_KEYS,
    ppt2_allowed_references,
)
from services.presentation.ppt1_constraints import DISCOVERY_PAGE_KEYS

_SKIP_KEYS = frozenset({"origin", "status", "schema_version", "source_refs", "order"})
_NO_CONTENT = "(no approved content - do not invent any)"


def pre_meeting_allowed_references(approved_discovery: dict[str, Any]) -> frozenset[str]:
    return frozenset(f"discovery.{page['key']}" for page in approved_discovery["pages"])


def post_meeting_allowed_references(ppt2_input: dict[str, Any]) -> frozenset[str]:
    return frozenset(ppt2_allowed_references(ppt2_input))


def client_name(pages: list[dict[str, Any]]) -> str:
    cover = next((page for page in pages if page.get("key") == "cover"), None)
    content = cover.get("content") if isinstance(cover, dict) else None
    if isinstance(content, dict):
        return str(content.get("client_name") or "").strip()
    return ""


def pre_meeting_materials(approved_discovery: dict[str, Any]) -> dict[str, str]:
    """One block with the approved Discovery pages: the only client-fact source for PPT #1."""
    return {
        "Approved Discovery Paper (the only source for facts about the client)": _discovery_block(
            approved_discovery["pages"]
        ),
    }


def post_meeting_materials(ppt2_input: dict[str, Any]) -> dict[str, str]:
    """Four separate blocks, in source-priority order. Sources that are null or empty are left out."""
    materials: dict[str, str] = {
        "Approved Discovery (baseline: the approved pre-meeting narrative)": _discovery_block(
            ppt2_input["approved_discovery"]["pages"]
        ),
    }
    notes = ppt2_input.get("personal_notes")
    text = str((notes or {}).get("text") or "").strip()
    if text:
        materials["Personal notes (reference id: notes) - the owner's direct post-meeting observations"] = text
    meeting = _meeting_block(ppt2_input.get("meeting_extraction"))
    if meeting:
        materials["Meeting extraction (reference ids: meeting.<section>) - structured evidence from the meeting"] = meeting
    use_cases = _use_case_block(ppt2_input.get("selected_use_cases"))
    if use_cases:
        materials["Selected Borek use cases (reference ids: use_case.<fact_id>) - approved reusable supporting material"] = use_cases
    notes_meta = _priority_block(ppt2_input)
    if notes_meta:
        materials["Source priority and warnings"] = notes_meta
    return materials


def _discovery_block(pages: list[dict[str, Any]]) -> str:
    blocks: list[str] = []
    for page in sorted(pages, key=lambda item: int(item.get("order") or 0)):
        key = str(page.get("key"))
        if key not in DISCOVERY_PAGE_KEYS:
            continue
        lines = _lines(page.get("content"))
        body = "\n".join(lines) if lines else _NO_CONTENT
        blocks.append(f"[discovery.{key}] {page.get('title') or key}\n{body}")
    return "\n\n".join(blocks)


def _meeting_block(meeting: dict[str, Any] | None) -> str:
    extraction = (meeting or {}).get("extraction") or {}
    blocks: list[str] = []
    for key in MEETING_SECTION_KEYS:
        items = [str(item).strip() for item in extraction.get(key) or [] if str(item).strip()]
        if items:
            blocks.append(f"[meeting.{key}]\n" + "\n".join(f"- {item}" for item in items))
    return "\n\n".join(blocks)


def _use_case_block(selected: dict[str, Any] | None) -> str:
    blocks: list[str] = []
    for item in (selected or {}).get("use_cases") or []:
        if not isinstance(item, dict) or not item.get("fact_id"):
            continue
        statement = str(item.get("statement") or "").strip()
        if not statement:
            continue
        title = str(item.get("title") or "").strip()
        head = f"[use_case.{item['fact_id']}]" + (f" {title}" if title else "")
        blocks.append(f"{head}\n{statement}")
    return "\n\n".join(blocks)


def _priority_block(ppt2_input: dict[str, Any]) -> str:
    lines: list[str] = []
    priority = [str(item) for item in ppt2_input.get("source_priority") or []]
    if priority:
        lines.append(
            "Authority order when claims conflict (earlier wins; never concatenate or replace text): "
            + " > ".join(priority)
        )
    codes = [str(item.get("code")) for item in ppt2_input.get("warnings") or [] if isinstance(item, dict)]
    if codes:
        lines.append("Warnings (informational, do not block the deck): " + ", ".join(codes))
    return "\n".join(lines)


def _lines(value: Any, label: str = "") -> list[str]:
    """Flatten a page body into ``label: text`` lines. Null/empty values and bookkeeping keys are dropped."""
    if value is None:
        return []
    if isinstance(value, str):
        text = " ".join(value.split())
        if not text:
            return []
        return [f"{label}: {text}" if label else text]
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return [f"{label}: {value}" if label else str(value)]
    if isinstance(value, list):
        lines: list[str] = []
        for item in value:
            lines.extend(_lines(item, label))
        return lines
    if isinstance(value, dict):
        # {"label": "Company Name", "value": "Northwind"} reads better as one line
        if set(value) - _SKIP_KEYS <= {"label", "value"} and value.get("value") not in (None, ""):
            return _lines(value.get("value"), str(value.get("label") or label))
        lines = []
        for key, item in value.items():
            if key in _SKIP_KEYS:
                continue
            lines.extend(_lines(item, str(key).replace("_", " ")))
        return lines
    return []
