"""BT-47: derived Discovery-first workflow status and document lineage. No deck generation."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

import jsonschema
from fastapi import HTTPException
from jsonschema import FormatChecker

from app.services.api_errors import bad_request
from app.services.audit import AuditAction, AuditObjectType, record_audit_event
from app.services.discovery_paper import get_latest_approved_discovery_paper
from services.framework.stage1_intake import intake_from_opportunity

CONTRACTS = Path(__file__).resolve().parents[5] / "packages" / "contracts"
STEP_KEYS = (
    "client_information",
    "discovery_prepared",
    "ppt1_ready",
    "first_meeting_completed",
    "transcript_added",
    "ppt2_generated",
    "owner_review",
    "finalized",
)
_FORMAT_CHECKER = FormatChecker()


def build_workflow_status(
    store: Any,
    *,
    opportunity_id: UUID,
    user_id: UUID,
) -> dict[str, Any]:
    """Read artifacts and milestone timestamps. This function does not write."""
    opportunity = store.get_opportunity(opportunity_id=opportunity_id, user_id=user_id)
    facts = _facts(store, opportunity=opportunity, opportunity_id=opportunity_id, user_id=user_id)
    return _status(opportunity_id, facts)


def mark_first_meeting_completed(
    store: Any,
    *,
    opportunity_id: UUID,
    user_id: UUID,
) -> dict[str, Any]:
    opportunity = store.get_opportunity(opportunity_id=opportunity_id, user_id=user_id)
    if _iso(opportunity.get("first_meeting_completed_at")):
        return build_workflow_status(store, opportunity_id=opportunity_id, user_id=user_id)
    facts = _facts(store, opportunity=opportunity, opportunity_id=opportunity_id, user_id=user_id)
    if not facts["ppt1_ready"]:
        raise bad_request(
            "PPT1_NOT_READY",
            "PPT #1 must be ready before the first meeting can be marked completed.",
        )
    _stamp(store, opportunity_id=opportunity_id, user_id=user_id, column="first_meeting_completed_at")
    record_audit_event(
        store,
        actor_id=user_id,
        action=AuditAction.WORKFLOW_FIRST_MEETING_COMPLETED,
        object_type=AuditObjectType.OPPORTUNITY,
        object_id=opportunity_id,
        document_id=facts["ppt1"]["latest_ready_version_id"],
    )
    return build_workflow_status(store, opportunity_id=opportunity_id, user_id=user_id)


def mark_owner_reviewed(
    store: Any,
    *,
    opportunity_id: UUID,
    user_id: UUID,
) -> dict[str, Any]:
    opportunity = store.get_opportunity(opportunity_id=opportunity_id, user_id=user_id)
    if _iso(opportunity.get("owner_reviewed_at")):
        return build_workflow_status(store, opportunity_id=opportunity_id, user_id=user_id)
    facts = _facts(store, opportunity=opportunity, opportunity_id=opportunity_id, user_id=user_id)
    if not facts["ppt2_generated"]:
        raise bad_request(
            "PPT2_NOT_GENERATED",
            "PPT #2 must be generated before owner review can be recorded.",
        )
    _stamp(store, opportunity_id=opportunity_id, user_id=user_id, column="owner_reviewed_at")
    record_audit_event(
        store,
        actor_id=user_id,
        action=AuditAction.WORKFLOW_OWNER_REVIEWED,
        object_type=AuditObjectType.OPPORTUNITY,
        object_id=opportunity_id,
        document_id=facts["ppt2"]["latest_ready_version_id"],
    )
    return build_workflow_status(store, opportunity_id=opportunity_id, user_id=user_id)


def mark_finalized(
    store: Any,
    *,
    opportunity_id: UUID,
    user_id: UUID,
) -> dict[str, Any]:
    opportunity = store.get_opportunity(opportunity_id=opportunity_id, user_id=user_id)
    if _iso(opportunity.get("finalized_at")):
        return build_workflow_status(store, opportunity_id=opportunity_id, user_id=user_id)
    if not _iso(opportunity.get("owner_reviewed_at")):
        raise bad_request(
            "OWNER_REVIEW_REQUIRED",
            "Owner review must be recorded before the workflow can be finalized.",
        )
    _stamp(store, opportunity_id=opportunity_id, user_id=user_id, column="finalized_at")
    record_audit_event(
        store,
        actor_id=user_id,
        action=AuditAction.WORKFLOW_FINALIZED,
        object_type=AuditObjectType.OPPORTUNITY,
        object_id=opportunity_id,
    )
    return build_workflow_status(store, opportunity_id=opportunity_id, user_id=user_id)


def _stamp(store: Any, *, opportunity_id: UUID, user_id: UUID, column: str) -> None:
    store.update_opportunity(
        opportunity_id=opportunity_id,
        user_id=user_id,
        updates={column: _now()},
    )


def _facts(
    store: Any,
    *,
    opportunity: dict[str, Any],
    opportunity_id: UUID,
    user_id: UUID,
) -> dict[str, Any]:
    approved = _approved_discovery(store, opportunity_id=opportunity_id, user_id=user_id)
    draft = _discovery_draft(store, opportunity=opportunity, opportunity_id=opportunity_id, user_id=user_id, approved=approved)
    ppt1 = _ppt1(store, opportunity=opportunity, opportunity_id=opportunity_id, user_id=user_id)
    transcripts = store.list_transcripts(opportunity_id=opportunity_id, user_id=user_id)
    ppt2 = _ppt2(
        store,
        opportunity_id=opportunity_id,
        user_id=user_id,
        ppt1_presentation_id=None if ppt1 is None else ppt1["presentation_id"],
    )
    return {
        "client_information": intake_from_opportunity(opportunity) is not None,
        "discovery_prepared": approved is not None,
        "ppt1_ready": ppt1 is not None and ppt1["latest_ready_version_id"] is not None,
        "first_meeting_completed": _iso(opportunity.get("first_meeting_completed_at")) is not None,
        "transcript_added": bool(transcripts),
        "ppt2_generated": ppt2 is not None and ppt2["latest_ready_version_id"] is not None,
        "owner_review": _iso(opportunity.get("owner_reviewed_at")) is not None,
        "finalized": _iso(opportunity.get("finalized_at")) is not None,
        "approved": approved,
        "draft": draft,
        "ppt1": ppt1,
        "ppt2": ppt2,
        "transcripts": transcripts,
        "first_meeting_completed_at": _iso(opportunity.get("first_meeting_completed_at")),
        "owner_reviewed_at": _iso(opportunity.get("owner_reviewed_at")),
        "finalized_at": _iso(opportunity.get("finalized_at")),
        "opportunity_id": str(opportunity_id),
    }


def _status(opportunity_id: UUID, facts: dict[str, Any]) -> dict[str, Any]:
    completed = {key: bool(facts[key]) for key in STEP_KEYS}
    incomplete = [key for key in STEP_KEYS if not completed[key]]
    current = incomplete[0] if incomplete else STEP_KEYS[-1]
    payload = {
        "schema_version": "1.0",
        "opportunity_id": str(opportunity_id),
        "current_status": current,
        "steps": [_step(key, completed=completed[key], current=current, facts=facts) for key in STEP_KEYS],
        "documents": {
            "discovery_draft": facts["draft"],
            "approved_discovery": _public_approved(facts["approved"]),
            "ppt1": _public_deck(facts["ppt1"]),
            "ppt2": _public_deck(facts["ppt2"]),
        },
    }
    return _validate(payload)


def _step(key: str, *, completed: bool, current: str, facts: dict[str, Any]) -> dict[str, Any]:
    if completed:
        state = "completed"
    elif key == current:
        state = "current"
    else:
        state = "pending"
    return {
        "key": key,
        "state": state,
        "completed_at": _completed_at(key, facts) if completed else None,
        "evidence": _evidence(key, facts) if completed or _has_partial_evidence(key, facts) else {},
    }


def _has_partial_evidence(key: str, facts: dict[str, Any]) -> bool:
    if key == "ppt1_ready":
        return facts["ppt1"] is not None
    if key == "transcript_added":
        return bool(facts["transcripts"])
    if key == "ppt2_generated":
        return facts["ppt2"] is not None
    if key == "discovery_prepared":
        return facts["draft"] is not None or facts["approved"] is not None
    return False


def _completed_at(key: str, facts: dict[str, Any]) -> str | None:
    if key == "discovery_prepared" and facts["approved"] is not None:
        return facts["approved"].get("approved_at")
    if key == "ppt1_ready" and facts["ppt1"] is not None:
        return facts["ppt1"].get("ready_at")
    if key == "first_meeting_completed":
        return facts["first_meeting_completed_at"]
    if key == "transcript_added" and facts["transcripts"]:
        return _iso(facts["transcripts"][0].get("created_at"))
    if key == "ppt2_generated" and facts["ppt2"] is not None:
        return facts["ppt2"].get("ready_at")
    if key == "owner_review":
        return facts["owner_reviewed_at"]
    if key == "finalized":
        return facts["finalized_at"]
    return None


def _public_approved(approved: dict[str, Any] | None) -> dict[str, Any] | None:
    if approved is None:
        return None
    return {
        "version_id": approved["version_id"],
        "version_number": approved["version_number"],
        "document_id": approved["document_id"],
    }


def _evidence(key: str, facts: dict[str, Any]) -> dict[str, Any]:
    if key == "client_information" and facts["client_information"]:
        return {"opportunity_id": facts["opportunity_id"]}
    if key == "discovery_prepared" and facts["approved"] is not None:
        approved = facts["approved"]
        return {
            "version_id": approved["version_id"],
            "version_number": approved["version_number"],
            "document_id": approved["document_id"],
        }
    if key == "ppt1_ready" and facts["ppt1"] is not None:
        return {
            "presentation_id": facts["ppt1"]["presentation_id"],
            "version_id": facts["ppt1"]["latest_ready_version_id"],
        }
    if key == "transcript_added" and facts["transcripts"]:
        earliest = facts["transcripts"][0]
        return {
            "transcript_id": str(earliest["id"]),
            "created_at": _iso(earliest.get("created_at")),
        }
    if key == "ppt2_generated" and facts["ppt2"] is not None:
        return {
            "presentation_id": facts["ppt2"]["presentation_id"],
            "version_id": facts["ppt2"]["latest_ready_version_id"],
        }
    return {}


def _public_deck(deck: dict[str, Any] | None) -> dict[str, Any] | None:
    if deck is None:
        return None
    return {
        "presentation_id": deck["presentation_id"],
        "latest_ready_version_id": deck["latest_ready_version_id"],
        "journey_stage": deck["journey_stage"],
        "status": deck["status"],
    }


def _approved_discovery(store: Any, *, opportunity_id: UUID, user_id: UUID) -> dict[str, Any] | None:
    try:
        approved = get_latest_approved_discovery_paper(
            store,
            opportunity_id=opportunity_id,
            user_id=user_id,
        )
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {}
        if exc.status_code == 404 and detail.get("code") == "DISCOVERY_PAPER_NOT_APPROVED":
            return None
        raise
    return {
        "version_id": str(approved["id"]),
        "version_number": approved["version_number"],
        "document_id": str(approved["document_id"]),
        "approved_at": _iso(approved.get("approved_at")),
    }


def _discovery_draft(
    store: Any,
    *,
    opportunity: dict[str, Any],
    opportunity_id: UUID,
    user_id: UUID,
    approved: dict[str, Any] | None,
) -> dict[str, Any] | None:
    versions = store.list_discovery_paper_versions(
        opportunity_id=opportunity_id,
        user_id=user_id,
    )
    drafts = [row for row in versions if row.get("status") == "draft"]
    if drafts:
        draft = drafts[-1]
        return {
            "document_id": str(draft["document_id"]),
            "status": "draft",
            "differs_from_approved": True if approved is not None else None,
        }
    paper = opportunity.get("discovery_paper")
    if not isinstance(paper, dict) or paper.get("document_id") is None or paper.get("status") == "not_generated":
        return None
    return {
        "document_id": str(paper["document_id"]),
        "status": str(paper.get("status") or "ready"),
        "differs_from_approved": False if approved is not None else None,
    }


def _ppt1(
    store: Any,
    *,
    opportunity: dict[str, Any],
    opportunity_id: UUID,
    user_id: UUID,
) -> dict[str, Any] | None:
    presentation_id = _stage1_presentation_id(opportunity)
    if presentation_id is None:
        return None
    versions = _versions_for(
        store,
        opportunity_id=opportunity_id,
        user_id=user_id,
        presentation_id=presentation_id,
    )
    ready = [
        row
        for row in versions
        if row.get("journey_stage") == "first_contact" and row.get("status") == "ready"
    ]
    latest = _latest(ready)
    pointer = _stage1_presentation(opportunity)
    status = "ready" if latest is not None else str((pointer or {}).get("status") or "missing")
    if latest is None and versions:
        status = str(versions[0].get("status") or status)
    return {
        "presentation_id": presentation_id,
        "latest_ready_version_id": None if latest is None else str(latest["id"]),
        "journey_stage": "first_contact",
        "status": status,
        "ready_at": None if latest is None else _iso(latest.get("created_at")),
    }


def _ppt2(
    store: Any,
    *,
    opportunity_id: UUID,
    user_id: UUID,
    ppt1_presentation_id: str | None,
) -> dict[str, Any] | None:
    versions = [
        row
        for row in store.list_presentation_versions_for_opportunity(
            opportunity_id=opportunity_id,
            user_id=user_id,
        )
        if row.get("journey_stage") == "post_meeting"
        and str(row.get("presentation_id")) != str(ppt1_presentation_id or "")
    ]
    if not versions:
        return None
    ready = [row for row in versions if row.get("status") == "ready"]
    latest = _latest(ready) or _latest(versions)
    assert latest is not None
    return {
        "presentation_id": str(latest["presentation_id"]),
        "latest_ready_version_id": None if not ready else str(_latest(ready)["id"]),
        "journey_stage": "post_meeting",
        "status": "ready" if ready else str(latest.get("status") or "missing"),
        "ready_at": None if not ready else _iso(_latest(ready).get("created_at")),
    }


def _versions_for(
    store: Any,
    *,
    opportunity_id: UUID,
    user_id: UUID,
    presentation_id: str,
) -> list[dict[str, Any]]:
    return [
        row
        for row in store.list_presentation_versions_for_opportunity(
            opportunity_id=opportunity_id,
            user_id=user_id,
        )
        if str(row.get("presentation_id")) == presentation_id
    ]


def _stage1_presentation(opportunity: dict[str, Any]) -> dict[str, Any] | None:
    envelope = opportunity.get("stage1_outputs")
    if not isinstance(envelope, dict):
        return None
    outputs = envelope.get("outputs")
    if not isinstance(outputs, dict):
        return None
    presentation = outputs.get("presentation")
    if not isinstance(presentation, dict):
        return None
    return presentation


def _stage1_presentation_id(opportunity: dict[str, Any]) -> str | None:
    presentation = _stage1_presentation(opportunity)
    if presentation is None:
        return None
    raw = presentation.get("presentation_id")
    if raw in (None, ""):
        return None
    return str(raw)


def _latest(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not rows:
        return None
    return max(rows, key=lambda row: (int(row.get("version_number") or 0), str(row.get("created_at") or "")))


def _now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


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
    schema = json.loads((CONTRACTS / "workflow_status.schema.json").read_text(encoding="utf-8"))
    jsonschema.Draft202012Validator(schema, format_checker=_FORMAT_CHECKER).validate(payload)
    return payload
