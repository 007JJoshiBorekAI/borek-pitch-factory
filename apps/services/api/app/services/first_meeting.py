"""Build First Meeting review fields without inventing transcript facts."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.services.api_errors import bad_request
from app.services.journey_generation import generate_stage2_outputs


def empty_first_meeting(opportunity_id: UUID) -> dict[str, Any]:
    return {
        "schema_version": "1.0",
        "opportunity_id": str(opportunity_id),
        "status": "not_generated",
        "generated": None,
        "reviewed": None,
        "effective": None,
        "transcript_id": None,
        "generated_by": None,
        "generated_at": None,
        "reviewed_by": None,
        "reviewed_at": None,
        "provenance": {},
    }


def first_meeting_response(opportunity: dict[str, Any]) -> dict[str, Any]:
    stored = opportunity.get("first_meeting_details")
    if not stored:
        return empty_first_meeting(opportunity["id"])
    payload = dict(stored)
    payload["effective"] = payload.get("reviewed") or payload.get("generated")
    return payload


def generate_first_meeting_details(
    store: Any,
    *,
    opportunity_id: UUID,
    user_id: UUID,
) -> dict[str, Any]:
    stage2 = generate_stage2_outputs(
        store,
        opportunity_id=opportunity_id,
        user_id=user_id,
    )
    opportunity = store.get_opportunity(opportunity_id=opportunity_id, user_id=user_id)
    outputs = stage2["outputs"]
    summary = outputs["transcript_summary"]
    sources = store.list_transcript_sources(opportunity_id=opportunity_id, user_id=user_id)
    if not sources:
        raise bad_request("TRANSCRIPT_REQUIRED", "Upload a meeting transcript first.")
    source = sources[-1]
    intake = opportunity.get("stage1_intake") or {}
    owner = opportunity.get("pitch_owner") or {}
    responsible = owner.get("name") if owner.get("source") == "manual" else None
    if owner.get("source") == "employee":
        employee_id = str(owner.get("employee_id") or "")
        employee = next(
            (
                row
                for row in store.list_user_roles()
                if str(row.get("user_id")) == employee_id
            ),
            None,
        )
        responsible = str((employee or {}).get("email") or employee_id) or None
    generated = {
        "meeting_date": None,
        "participants": list(summary.get("participants") or []),
        "meeting_summary": outputs.get("call_summary"),
        "pain_points": [],
        "requirements": [],
        "questions_concerns": list(summary.get("open_questions") or []),
        "business_opportunity": opportunity.get("business_need"),
        "proposed_solution": opportunity.get("service_solution"),
        "relevant_borek_services": (
            [opportunity["department"]] if opportunity.get("department") else []
        ),
        "estimated_scope": None,
        "expected_timeline": None,
        "estimated_budget": None,
        "decision_makers": [],
        "key_stakeholders": list(summary.get("participants") or []),
        "primary_point_of_contact": intake.get("poc_name"),
        "next_steps": list(summary.get("decisions") or []),
        "next_meeting_date": None,
        "action_items": [
            str(item.get("text") or "").strip()
            for item in summary.get("action_items") or []
            if str(item.get("text") or "").strip()
        ],
        "responsible_team_member": responsible,
    }
    now = datetime.now(UTC).isoformat()
    previous = opportunity.get("first_meeting_details") or {}
    payload = {
        "schema_version": "1.0",
        "opportunity_id": str(opportunity_id),
        "status": "generated",
        "generated": generated,
        "reviewed": None,
        "effective": generated,
        "transcript_id": str(source["id"]),
        "generated_by": str(user_id),
        "generated_at": now,
        "reviewed_by": None,
        "reviewed_at": None,
        "provenance": {
            "source": "TRANSCRIPT_SUMMARY",
            "summary_prompt_version": "transcript-summarizing:v1",
            "replaces_status": previous.get("status"),
        },
    }
    store.update_opportunity(
        opportunity_id=opportunity_id,
        user_id=user_id,
        updates={"first_meeting_details": payload},
    )
    return payload


def review_first_meeting_details(
    store: Any,
    *,
    opportunity_id: UUID,
    user_id: UUID,
    reviewed: dict[str, Any],
) -> dict[str, Any]:
    opportunity = store.get_opportunity(opportunity_id=opportunity_id, user_id=user_id)
    stored = opportunity.get("first_meeting_details")
    if not stored or not stored.get("generated"):
        raise bad_request(
            "FIRST_MEETING_DETAILS_REQUIRED",
            "Generate First Meeting details from a transcript before reviewing them.",
        )
    payload = dict(stored)
    payload.update(
        {
            "status": "reviewed",
            "reviewed": reviewed,
            "effective": reviewed,
            "reviewed_by": str(user_id),
            "reviewed_at": datetime.now(UTC).isoformat(),
        }
    )
    store.update_opportunity(
        opportunity_id=opportunity_id,
        user_id=user_id,
        updates={"first_meeting_details": payload},
    )
    return payload
