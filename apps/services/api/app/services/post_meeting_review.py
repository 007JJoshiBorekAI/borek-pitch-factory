"""Post Meeting review: what was captured from the first meeting, and whether it is ready for V2.

Read side: one view of the four sources a future Master Presentation V2 is built from - the
approved Discovery, the selected transcript with its structured extraction, the owner's
personal notes, and the selected Borek use cases - with their identities, revisions and
freshness. Nothing is generated here and the sources are never merged.

Write side: the owner's confirmation. An extracted item is an interpretation until the owner
confirms it; the confirmation is stored with the source revisions it was given for, so a later
change to any source makes it visibly stale instead of silently carrying over.
"""

from __future__ import annotations

import copy
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

import jsonschema
from jsonschema import FormatChecker

from app.services.api_errors import bad_request, conflict
from app.services.meeting_extraction import (
    CATEGORIES,
    execution_mode,
    get_meeting_extraction,
    transcript_revision,
)
from app.services.ppt2_context import build_ppt2_context
from app.services.workflow_status import build_workflow_status
from services.meeting.extraction import MeetingExtractionError, classify_item_sources

CONTRACTS = Path(__file__).resolve().parents[5] / "packages" / "contracts"
SCHEMA_VERSION = "1.0"
_FORMAT_CHECKER = FormatChecker()


def build_post_meeting_review(store: Any, *, opportunity_id: UUID, user_id: UUID) -> dict[str, Any]:
    """Assemble the review view. Reads only."""
    opportunity = store.get_opportunity(opportunity_id=opportunity_id, user_id=user_id)
    context = build_ppt2_context(store, opportunity_id=opportunity_id, user_id=user_id)
    workflow = build_workflow_status(store, opportunity_id=opportunity_id, user_id=user_id)
    sources = {
        str(row["id"]): row
        for row in store.list_transcript_sources(opportunity_id=opportunity_id, user_id=user_id)
    }
    stored = get_meeting_extraction(store, opportunity_id=opportunity_id, user_id=user_id)
    notes = context["sources"]["personal_notes"]
    extraction = _extraction_view(stored, sources=sources, notes=notes)
    transcripts = [
        {
            "id": str(row["id"]),
            "file_name": str(row["file_name"]),
            "processing_status": str(row.get("processing_status") or "pending"),
            "created_at": _iso(row.get("created_at")),
            "revision": _revision(sources.get(str(row["id"]))),
            "turn_count": len((sources.get(str(row["id"])) or {}).get("sections") or []),
            "analysed": extraction["transcript_id"] == str(row["id"]),
        }
        for row in store.list_transcripts(opportunity_id=opportunity_id, user_id=user_id)
    ]
    discovery = _discovery_view(context["sources"]["approved_discovery"])
    use_cases = _use_cases_view(context["sources"]["selected_use_cases"])
    master = _master_view(store, workflow=workflow, user_id=user_id)
    confirmation = _confirmation_view(
        opportunity.get("meeting_review"),
        extraction=extraction,
        discovery=discovery,
        use_cases=use_cases,
    )
    first_meeting = _step_completed(workflow, "first_meeting_completed")
    blockers = _blockers(
        first_meeting=first_meeting,
        discovery=discovery,
        master=master,
        transcripts=transcripts,
        extraction=extraction,
        confirmation=confirmation,
    )
    view = {
        "schema_version": SCHEMA_VERSION,
        "opportunity_id": str(opportunity_id),
        "assembled_at": _now(),
        "execution_mode": execution_mode(),
        "first_meeting_completed": first_meeting,
        "finalized": workflow.get("finalization") is not None,
        "transcripts": transcripts,
        "personal_notes": {"status": notes["status"], "text": notes["text"], "updated_at": notes["updated_at"]},
        "extraction": extraction,
        "selected_use_cases": use_cases,
        "approved_discovery": discovery,
        "master_presentation": master,
        "confirmation": confirmation,
        "readiness": {"ready_for_v2": not blockers, "blockers": blockers},
        "v2_sources": None,
    }
    view["review_fingerprint"] = _review_fingerprint(view)
    if not blockers:
        view["v2_sources"] = _v2_sources(view)
    return _validate(view, "PostMeetingReview")


def confirm_meeting_review(
    store: Any,
    *,
    opportunity_id: UUID,
    user_id: UUID,
    transcript_id: UUID,
    extraction_generated_at: str,
    review_fingerprint: str,
    excluded: dict[str, list[str]],
) -> dict[str, Any]:
    """Store the owner's confirmation for exactly the sources they reviewed.

    ``review_fingerprint`` is the one the owner's review was loaded with. It covers every
    source of the review, so a change to the approved Discovery, the selected use cases, the
    transcript, the notes or the extraction between loading and confirming is refused: nothing
    the owner has not seen is ever confirmed.
    """
    view = build_post_meeting_review(store, opportunity_id=opportunity_id, user_id=user_id)
    if view["finalized"]:
        raise conflict("WORKFLOW_FINALIZED", "This package is finalized. The meeting review is read-only.")
    extraction = view["extraction"]
    if extraction["status"] == "missing":
        raise bad_request("MEETING_EXTRACTION_MISSING", "Analyse a transcript before confirming the meeting information.")
    if (
        extraction["status"] != "current"
        or extraction["transcript_id"] != str(transcript_id)
        or _iso(extraction["generated_at"]) != _iso(extraction_generated_at)
        or review_fingerprint != view["review_fingerprint"]
    ):
        raise conflict(
            "MEETING_REVIEW_STALE",
            "A source of this review changed after it was opened: the transcript, the notes, the analysis, "
            "the approved Discovery or the selected use cases. Reload the review and check it again before confirming.",
        )
    unknown_categories = sorted(set(excluded) - set(CATEGORIES))
    if unknown_categories:
        raise bad_request("MEETING_REVIEW_INVALID", f"Unknown categories: {', '.join(unknown_categories)}.")
    items: dict[str, list[dict[str, str]]] = {}
    for category in CATEGORIES:
        texts = [entry["text"] for entry in extraction["categories"][category]]
        unknown = [text for text in excluded.get(category, []) if text not in texts]
        if unknown:
            raise bad_request(
                "MEETING_REVIEW_INVALID",
                "Only findings of the current analysis can be excluded. Reload the review.",
            )
        items[category] = [
            {
                "text": entry["text"],
                "source": entry["source"],
                "status": "excluded" if entry["text"] in excluded.get(category, []) else "confirmed",
            }
            for entry in extraction["categories"][category]
        ]
    # Master Presentation V2 is built from confirmed findings. Confirming none - because the
    # analysis found nothing, or because every finding was excluded - would confirm an empty basis.
    if not any(entry["status"] == "confirmed" for entries in items.values() for entry in entries):
        raise bad_request(
            "MEETING_REVIEW_NO_FINDINGS",
            "There is no finding to confirm. Master Presentation V2 needs at least one confirmed finding from the meeting.",
        )
    record = {
        "schema_version": SCHEMA_VERSION,
        "opportunity_id": str(opportunity_id),
        "confirmed_at": _now(),
        "confirmed_by": str(user_id),
        "sources": {
            "approved_discovery_version_id": view["approved_discovery"]["version_id"],
            "transcript_id": extraction["transcript_id"],
            "transcript_revision": extraction["transcript_revision"],
            "extraction_generated_at": extraction["generated_at"],
            "personal_notes_updated_at": extraction["personal_notes_updated_at"],
            "selected_use_case_ids": list(view["selected_use_cases"]["use_case_ids"]),
        },
        "items": items,
    }
    store.update_opportunity(
        opportunity_id=opportunity_id,
        user_id=user_id,
        updates={"meeting_review": copy.deepcopy(_validate(record, "MeetingReviewRecord"))},
    )
    return build_post_meeting_review(store, opportunity_id=opportunity_id, user_id=user_id)


# ------------------------------------------------------------------------------------- sources


def _revision(source: dict[str, Any] | None) -> str | None:
    return None if source is None else transcript_revision(list(source.get("sections") or []))


def _extraction_view(
    stored: dict[str, Any] | None,
    *,
    sources: dict[str, dict[str, Any]],
    notes: dict[str, Any],
) -> dict[str, Any]:
    if stored is None:
        return {
            "status": "missing",
            "stale_reasons": [],
            "transcript_id": None,
            "transcript_file_name": None,
            "transcript_revision": None,
            "generated_at": None,
            "personal_notes_updated_at": None,
            "execution_mode": None,
            "categories": {category: [] for category in CATEGORIES},
            "item_count": 0,
        }
    transcript_id = str(stored["transcript_id"])
    source = sources.get(transcript_id)
    recorded_revision = stored.get("transcript_revision")
    reasons: list[str] = []
    if source is None:
        reasons.append("TRANSCRIPT_REMOVED")
    elif recorded_revision is None:
        # Extractions stored before revisions were tracked cannot be proven current.
        reasons.append("TRANSCRIPT_REVISION_NOT_RECORDED")
    elif recorded_revision != _revision(source):
        reasons.append("TRANSCRIPT_CHANGED")
    # The extraction names the notes revision it read (null: no notes at that time).
    if _iso(stored.get("personal_notes_updated_at")) != (_iso(notes["updated_at"]) if notes["status"] == "available" else None):
        reasons.append("NOTES_CHANGED")
    labels = stored.get("item_sources")
    if not isinstance(labels, dict):
        labels = _derived_sources(stored, source=source, notes=notes)
    categories = {
        category: [
            {"text": text, "source": (labels.get(category) or [])[index] if index < len(labels.get(category) or []) else "unverified"}
            for index, text in enumerate(stored.get(category) or [])
        ]
        for category in CATEGORIES
    }
    return {
        "status": "stale" if reasons else "current",
        "stale_reasons": reasons,
        "transcript_id": transcript_id,
        "transcript_file_name": None if source is None else str(source.get("file_name") or ""),
        "transcript_revision": recorded_revision,
        "generated_at": _iso(stored.get("generated_at")),
        "personal_notes_updated_at": _iso(stored.get("personal_notes_updated_at")),
        "execution_mode": stored.get("execution_mode"),
        "categories": categories,
        "item_count": sum(len(items) for items in categories.values()),
    }


def _derived_sources(stored: dict[str, Any], *, source: dict[str, Any] | None, notes: dict[str, Any]) -> dict[str, list[str]]:
    """Sources for an extraction stored without them; unverified where they cannot be shown."""
    if source is not None:
        try:
            return classify_item_sources(
                {category: list(stored.get(category) or []) for category in CATEGORIES},
                sections=list(source.get("sections") or []),
                personal_notes=notes["text"],
            )
        except MeetingExtractionError:
            pass
    return {category: ["unverified"] * len(stored.get(category) or []) for category in CATEGORIES}


def _discovery_view(source: dict[str, Any]) -> dict[str, Any]:
    paper = source.get("paper_json") if isinstance(source.get("paper_json"), dict) else {}
    return {
        "status": source["status"],
        "version_id": source["version_id"],
        "version_number": source["version_number"],
        "document_id": source["document_id"],
        "approved_at": _iso(source["approved_at"]),
        "discovery_schema_version": None if source["status"] != "available" else str(paper.get("schema_version") or "1.0"),
    }


def _use_cases_view(source: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": source["status"],
        "use_case_ids": list(source["use_case_ids"]),
        "use_cases": [
            {
                "fact_id": item["fact_id"],
                "status": item["status"],
                "service_key": item.get("service_key"),
                "statement": item.get("statement"),
            }
            for item in source["use_cases"]
        ],
    }


def _master_view(store: Any, *, workflow: dict[str, Any], user_id: UUID) -> dict[str, Any]:
    """The Master Presentation V1 that V2 will become a new version of."""
    missing = {"status": "missing", "presentation_id": None, "version_id": None, "product_version": None}
    deck = (workflow.get("documents") or {}).get("ppt1")
    if not deck or not deck.get("latest_ready_version_id"):
        return missing
    row = store.get_presentation_version(
        presentation_version_id=UUID(str(deck["latest_ready_version_id"])),
        user_id=user_id,
    )
    manifest = row.get("generation_source_manifest")
    if not isinstance(manifest, dict) or manifest.get("kind") != "master_presentation_v1":
        # A deck from before the Master Presentation: there is no canonical base to extend.
        return {**missing, "status": "legacy"}
    return {
        "status": "ready",
        "presentation_id": str(deck["presentation_id"]),
        "version_id": str(deck["latest_ready_version_id"]),
        "product_version": str(manifest.get("product_version") or "V1"),
    }


def _confirmation_view(
    raw: Any,
    *,
    extraction: dict[str, Any],
    discovery: dict[str, Any],
    use_cases: dict[str, Any],
) -> dict[str, Any]:
    if isinstance(raw, str):
        raw = json.loads(raw)
    if not isinstance(raw, dict):
        return {
            "status": "none",
            "stale_reasons": [],
            "confirmed_at": None,
            "confirmed_by": None,
            "sources": None,
            "items": None,
            "confirmed_count": 0,
            "excluded_count": 0,
        }
    record = copy.deepcopy(raw)
    confirmed = record["sources"]
    reasons: list[str] = []
    if extraction["status"] == "missing" or (
        confirmed["transcript_id"],
        confirmed["transcript_revision"],
        _iso(confirmed["extraction_generated_at"]),
    ) != (extraction["transcript_id"], extraction["transcript_revision"], extraction["generated_at"]):
        reasons.append("EXTRACTION_REPLACED")
    reasons.extend(reason for reason in extraction["stale_reasons"] if reason not in reasons)
    if confirmed["approved_discovery_version_id"] != discovery["version_id"]:
        reasons.append("APPROVED_DISCOVERY_CHANGED")
    if list(confirmed["selected_use_case_ids"]) != list(use_cases["use_case_ids"]):
        reasons.append("USE_CASES_CHANGED")
    statuses = [entry["status"] for items in record["items"].values() for entry in items]
    return {
        "status": "stale" if reasons else "current",
        "stale_reasons": reasons,
        "confirmed_at": _iso(record["confirmed_at"]),
        "confirmed_by": record["confirmed_by"],
        "sources": confirmed,
        "items": record["items"],
        "confirmed_count": statuses.count("confirmed"),
        "excluded_count": statuses.count("excluded"),
    }


def _blockers(
    *,
    first_meeting: bool,
    discovery: dict[str, Any],
    master: dict[str, Any],
    transcripts: list[dict[str, Any]],
    extraction: dict[str, Any],
    confirmation: dict[str, Any],
) -> list[str]:
    blockers: list[str] = []
    if discovery["status"] != "available":
        blockers.append("DISCOVERY_NOT_APPROVED")
    if master["status"] != "ready":
        blockers.append("MASTER_PRESENTATION_V1_NOT_READY")
    if not first_meeting:
        blockers.append("FIRST_MEETING_NOT_COMPLETED")
    if not transcripts:
        blockers.append("TRANSCRIPT_MISSING")
    if extraction["status"] == "missing":
        blockers.append("MEETING_EXTRACTION_MISSING")
    elif extraction["status"] == "stale":
        blockers.append("MEETING_EXTRACTION_STALE")
    if extraction["status"] == "current" and not extraction["item_count"]:
        blockers.append("MEETING_FINDINGS_EMPTY")
    if confirmation["status"] == "none":
        blockers.append("MEETING_REVIEW_NOT_CONFIRMED")
    elif confirmation["status"] == "stale":
        blockers.append("MEETING_REVIEW_STALE")
    elif not confirmation["confirmed_count"]:
        # A confirmation without a single confirmed finding (possible before this rule existed).
        blockers.append("MEETING_FINDINGS_NONE_CONFIRMED")
    return blockers


def _review_fingerprint(view: dict[str, Any]) -> str:
    """Identity of everything the owner sees in the review; changes when any source changes.

    Covers the approved Discovery version, the Master Presentation version, every transcript
    revision, the current notes revision, the selected use cases, and the extraction with its
    findings and freshness. The stored confirmation and the time of reading are not part of it.
    """
    extraction = view["extraction"]
    reviewed = {
        "approved_discovery_version_id": view["approved_discovery"]["version_id"],
        "master_presentation_version_id": view["master_presentation"]["version_id"],
        "transcripts": [[item["id"], item["revision"]] for item in view["transcripts"]],
        "personal_notes_updated_at": view["personal_notes"]["updated_at"],
        "selected_use_case_ids": list(view["selected_use_cases"]["use_case_ids"]),
        "selected_use_case_status": [item["status"] for item in view["selected_use_cases"]["use_cases"]],
        "extraction": {
            "status": extraction["status"],
            "stale_reasons": extraction["stale_reasons"],
            "transcript_id": extraction["transcript_id"],
            "transcript_revision": extraction["transcript_revision"],
            "generated_at": extraction["generated_at"],
            "personal_notes_updated_at": extraction["personal_notes_updated_at"],
            "categories": extraction["categories"],
        },
    }
    canonical = json.dumps(reviewed, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _v2_sources(view: dict[str, Any]) -> dict[str, Any]:
    """Identities and revisions a V2 generation would freeze. Identifiers only, no content."""
    confirmation = view["confirmation"]
    snapshot = {
        "presentation_id": view["master_presentation"]["presentation_id"],
        "base_presentation_version_id": view["master_presentation"]["version_id"],
        "approved_discovery_version_id": view["approved_discovery"]["version_id"],
        "approved_discovery_document_id": view["approved_discovery"]["document_id"],
        "discovery_schema_version": view["approved_discovery"]["discovery_schema_version"],
        "transcript_id": view["extraction"]["transcript_id"],
        "transcript_revision": view["extraction"]["transcript_revision"],
        "extraction_generated_at": view["extraction"]["generated_at"],
        "extraction_execution_mode": view["extraction"]["execution_mode"],
        "personal_notes_updated_at": view["extraction"]["personal_notes_updated_at"],
        "selected_use_case_ids": list(view["selected_use_cases"]["use_case_ids"]),
        "meeting_review_confirmed_at": confirmation["confirmed_at"],
    }
    confirmed_items = {
        category: [entry["text"] for entry in confirmation["items"][category] if entry["status"] == "confirmed"]
        for category in CATEGORIES
    }
    canonical = json.dumps({**snapshot, "confirmed_items": confirmed_items}, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return {**snapshot, "source_hash": hashlib.sha256(canonical.encode("utf-8")).hexdigest()}


# ------------------------------------------------------------------------------------- helpers


def _step_completed(workflow: dict[str, Any], key: str) -> bool:
    return any(step["key"] == key and step["state"] == "completed" for step in workflow["steps"])


def _now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    text = value.isoformat() if hasattr(value, "isoformat") else str(value).strip()
    return text.replace("+00:00", "Z") or None


def _validate(payload: dict[str, Any], definition: str) -> dict[str, Any]:
    schema = json.loads((CONTRACTS / "post_meeting_review.schema.json").read_text(encoding="utf-8"))
    target = schema if definition == "PostMeetingReview" else {"$ref": f"#/$defs/{definition}", "$defs": schema["$defs"]}
    jsonschema.Draft202012Validator(target, format_checker=_FORMAT_CHECKER).validate(payload)
    return payload
