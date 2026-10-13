"""BT-46: assemble one read-only PPT #2 context. No writes and no generation."""

from __future__ import annotations

import copy
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

import jsonschema
from fastapi import HTTPException
from jsonschema import FormatChecker

from app.services.discovery_paper import get_latest_approved_discovery_paper
from app.services.meeting_extraction import get_meeting_extraction, personal_notes_view
from app.services.use_case_selection import get_selected_use_cases

CONTRACTS = Path(__file__).resolve().parents[5] / "packages" / "contracts"
SOURCE_PRIORITY = (
    "approved_discovery",
    "personal_notes",
    "meeting_extraction",
    "selected_use_cases",
)
_FORMAT_CHECKER = FormatChecker()


def build_ppt2_context(
    store: Any,
    *,
    opportunity_id: UUID,
    user_id: UUID,
) -> dict[str, Any]:
    """Compose the four PPT #2 sources without mutating them."""
    opportunity = store.get_opportunity(opportunity_id=opportunity_id, user_id=user_id)
    discovery = _discovery_source(store, opportunity_id=opportunity_id, user_id=user_id)
    notes = _notes_source(opportunity)
    extraction = _extraction_source(
        get_meeting_extraction(store, opportunity_id=opportunity_id, user_id=user_id)
    )
    selected = _use_case_source(
        get_selected_use_cases(store, opportunity_id=opportunity_id, user_id=user_id)
    )
    notes_match = _notes_revision_match(extraction, notes)
    sources = {
        "approved_discovery": discovery,
        "personal_notes": notes,
        "meeting_extraction": extraction,
        "selected_use_cases": selected,
    }
    context = {
        "schema_version": "1.0",
        "opportunity_id": str(opportunity_id),
        "assembled_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "source_priority": list(SOURCE_PRIORITY),
        "notes_revision_matches_extraction": notes_match,
        "sources": sources,
        "missing_sources": [
            name
            for name in ("approved_discovery", "personal_notes", "meeting_extraction")
            if sources[name]["status"] == "missing"
        ],
        "warnings": _warnings(sources, notes_match=notes_match),
    }
    return _validate(copy.deepcopy(context))


def _discovery_source(store: Any, *, opportunity_id: UUID, user_id: UUID) -> dict[str, Any]:
    try:
        approved = get_latest_approved_discovery_paper(
            store,
            opportunity_id=opportunity_id,
            user_id=user_id,
        )
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {}
        if exc.status_code == 404 and detail.get("code") == "DISCOVERY_PAPER_NOT_APPROVED":
            return _missing_discovery()
        raise
    return {
        "status": "available",
        "version_id": str(approved["id"]),
        "version_number": approved["version_number"],
        "document_id": str(approved["document_id"]),
        "approved_at": approved["approved_at"],
        "paper_json": copy.deepcopy(approved["paper_json"]),
    }


def _missing_discovery() -> dict[str, Any]:
    return {
        "status": "missing",
        "version_id": None,
        "version_number": None,
        "document_id": None,
        "approved_at": None,
        "paper_json": None,
    }


def _notes_source(opportunity: dict[str, Any]) -> dict[str, Any]:
    view = personal_notes_view(opportunity)
    if view["text"] is None:
        return {"status": "missing", "text": None, "updated_at": None}
    return {
        "status": "available",
        "text": view["text"],
        "updated_at": view["updated_at"],
    }


def _extraction_source(stored: dict[str, Any] | None) -> dict[str, Any]:
    if stored is None:
        return {
            "status": "missing",
            "transcript_id": None,
            "personal_notes_updated_at": None,
            "extraction": None,
        }
    extraction = copy.deepcopy(stored)
    return {
        "status": "available",
        "transcript_id": extraction["transcript_id"],
        "personal_notes_updated_at": extraction.get("personal_notes_updated_at"),
        "extraction": extraction,
    }


def _use_case_source(selected: dict[str, Any]) -> dict[str, Any]:
    use_cases = copy.deepcopy(selected["use_cases"])
    ids = list(selected["use_case_ids"])
    if not ids:
        status = "empty"
    elif any(item["status"] != "resolved" for item in use_cases):
        status = "partial"
    else:
        status = "available"
    return {
        "status": status,
        "use_case_ids": ids,
        "use_cases": use_cases,
    }


def _notes_revision_match(extraction: dict[str, Any], notes: dict[str, Any]) -> bool | str:
    if extraction["status"] != "available":
        return "not_applicable"
    used = _iso(extraction["personal_notes_updated_at"])
    current = _iso(notes["updated_at"])
    return used == current


def _warnings(sources: dict[str, Any], *, notes_match: bool | str) -> list[dict[str, Any]]:
    warnings: list[dict[str, Any]] = []
    if sources["approved_discovery"]["status"] == "missing":
        warnings.append({"code": "DISCOVERY_NOT_APPROVED"})
    if sources["meeting_extraction"]["status"] == "missing":
        warnings.append({"code": "MEETING_EXTRACTION_MISSING"})
    if notes_match is False:
        warnings.append({"code": "MEETING_EXTRACTION_NOTES_STALE"})
    unresolved = [
        item["fact_id"]
        for item in sources["selected_use_cases"]["use_cases"]
        if item["status"] != "resolved"
    ]
    if unresolved:
        warnings.append({"code": "USE_CASE_UNRESOLVED", "fact_ids": unresolved})
    return warnings


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        text = value.isoformat()
    else:
        text = str(value).strip()
    if not text:
        return None
    return text.replace("+00:00", "Z")


def _validate(payload: dict[str, Any]) -> dict[str, Any]:
    schema = json.loads((CONTRACTS / "ppt2_context.schema.json").read_text(encoding="utf-8"))
    jsonschema.Draft202012Validator(schema, format_checker=_FORMAT_CHECKER).validate(payload)
    return payload
