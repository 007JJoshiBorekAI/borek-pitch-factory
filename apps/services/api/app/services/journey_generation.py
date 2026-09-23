"""BT-36 / TSK-013 fixture-backed Stage 1/2 outputs and email drafts."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

import jsonschema

from app.config import settings
from app.services.api_errors import bad_request
from app.services.first_contact_inputs import require_first_contact_client_documents
from app.services.knowledge_access import resolve_active_corpus
from app.services.stage1 import get_company_research_provider
from services.framework.stage1_research import generate_stage1_research
from services.transcript.summarize import (
    format_transcript_summary_for_prompt,
    summarize_speaker_sections,
)

CONTRACTS = Path(__file__).resolve().parents[5] / "packages" / "contracts"
SHORT_WORD_CAP = 150
MEDIUM_WORD_CAP = 300
EXTENSIVE_WORD_CAP = 500
JOURNEY_STAGES = ("first_contact", "deepening", "concretisation")
QUESTION_TEMPLATES = (
    "What problem does {topic} currently create for the operating teams?",
    "Who owns {topic} decisions today, and who must be in the first meeting?",
    "Which systems or vendors sit next to {topic} in the current process?",
    "What does a successful first meeting on {topic} look like for you?",
    "Where does {topic} already work well, and where does it fail?",
    "What evidence or KPIs do you already collect around {topic}?",
    "Which constraints (security, works council, budget cycle) apply to {topic}?",
    "What happens if {topic} is not improved in the next 12 months?",
    "Which neighbouring processes must stay unchanged if we discuss {topic}?",
    "What have you already tried for {topic}, and what did you learn?",
    "How should Borek prepare for a first conversation about {topic}?",
    "What would you want a first-meeting agenda on {topic} to cover first?",
)


def _now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _schema(name: str) -> dict[str, Any]:
    return json.loads((CONTRACTS / name).read_text(encoding="utf-8"))


def _validate(name: str, payload: dict[str, Any]) -> dict[str, Any]:
    jsonschema.Draft202012Validator(_schema(name)).validate(payload)
    return payload


def empty_stage1(opportunity_id: UUID) -> dict[str, Any]:
    return _validate(
        "stage1_outputs.schema.json",
        {
            "schema_version": "1.0",
            "opportunity_id": str(opportunity_id),
            "status": "not_generated",
            "outputs": None,
        },
    )


def empty_stage2(opportunity_id: UUID) -> dict[str, Any]:
    return _validate(
        "stage2_outputs.schema.json",
        {
            "schema_version": "1.0",
            "opportunity_id": str(opportunity_id),
            "status": "not_generated",
            "outputs": None,
        },
    )


def empty_email(opportunity_id: UUID, journey_stage: str) -> dict[str, Any]:
    return _validate(
        "email_draft.schema.json",
        {
            "schema_version": "1.0",
            "opportunity_id": str(opportunity_id),
            "journey_stage": journey_stage,
            "draft": None,
        },
    )


def get_meeting_feedback(opportunity: dict[str, Any]) -> dict[str, Any]:
    updated = opportunity.get("meeting_feedback_updated_at")
    if hasattr(updated, "isoformat"):
        updated = updated.isoformat().replace("+00:00", "Z")
    return _validate(
        "meeting_feedback.schema.json",
        {
            "schema_version": "1.0",
            "opportunity_id": str(opportunity["id"]),
            "text": opportunity.get("meeting_feedback_text"),
            "updated_at": updated,
        },
    )


def generate_stage1_outputs(store: Any, *, opportunity_id: UUID, user_id: UUID) -> dict[str, Any]:
    opportunity = store.get_opportunity(opportunity_id=opportunity_id, user_id=user_id)
    client_document_sources = require_first_contact_client_documents(
        store,
        opportunity_id=opportunity_id,
        user_id=user_id,
    )
    research = generate_stage1_research(
        opportunity,
        corpus=resolve_active_corpus(store),
        provider=get_company_research_provider(),
        use_llm=settings.AI_EXECUTION_MODE == "live",
        client_document_sources=client_document_sources,
    )
    intake = opportunity.get("stage1_intake") or {}
    topic = str(intake.get("sales_topic_description") or opportunity.get("opportunity_name") or "this engagement").strip()
    questions = [
        {"id": f"Q{index + 1}", "text": template.format(topic=topic)}
        for index, template in enumerate(QUESTION_TEMPLATES[:12])
    ]
    envelope = {
        "schema_version": "1.0",
        "opportunity_id": str(opportunity_id),
        "status": "ready",
        "outputs": {
            "hypothesis": {
                "statement": str(research.get("hypothesis", {}).get("text") or ""),
                "origin": "AI_HYPOTHESIS",
            },
            "product_relevance": {
                "statement": str(research.get("product_relevance", {}).get("text") or ""),
                "origin": "AI_HYPOTHESIS",
            },
            "discovery_questions": questions,
            "use_cases": [
                {
                    "title": "Past Borek use cases",
                    "rationale": "No approved use-case match is stored for this opportunity yet.",
                    "availability": "unknown",
                }
            ],
            "agenda": {
                "title": f"First meeting agenda — {topic}",
                "items": [
                    {"order": 1, "label": "Confirm the sales topic and desired outcomes"},
                    {"order": 2, "label": "Walk the discovery questions grounded in uploaded client documents"},
                    {"order": 3, "label": "Agree next step; no invented commercial terms"},
                ],
            },
            "presentation": {
                "status": "unfrozen",
                "profile": "first_meeting_3",
                "code": "FIRST_MEETING_PPT_PROFILE_UNFROZEN",
                "presentation_id": None,
                "download_url": None,
            },
            "research": research,
            "generated_at": _now(),
        },
    }
    payload = _validate("stage1_outputs.schema.json", envelope)
    store.update_opportunity(
        opportunity_id=opportunity_id,
        user_id=user_id,
        updates={"stage1_outputs": payload},
    )
    return payload


def generate_stage2_outputs(store: Any, *, opportunity_id: UUID, user_id: UUID) -> dict[str, Any]:
    opportunity = store.get_opportunity(opportunity_id=opportunity_id, user_id=user_id)
    sources = store.list_transcript_sources(opportunity_id=opportunity_id, user_id=user_id)
    if not sources:
        raise bad_request(
            "TRANSCRIPT_REQUIRED",
            "Upload at least one meeting transcript before generating Deepening outputs.",
        )
    source = sources[-1]
    summary = summarize_speaker_sections(
        source.get("sections") or [],
        opportunity_id=opportunity_id,
        transcript_id=source["id"],
    )
    feedback = opportunity.get("meeting_feedback_text")
    call_summary_parts = [summary.get("narrative") or "No narrative facts were extracted from the transcript."]
    if feedback:
        call_summary_parts.append("Sales meeting feedback: " + str(feedback).strip())
    mom = {
        "title": f"Minutes — {opportunity.get('opportunity_name')}",
        "participants": list(summary.get("participants") or []),
        "decisions": list(summary.get("decisions") or []),
        "action_items": [
            str(item.get("text") or "").strip()
            for item in summary.get("action_items") or []
            if str(item.get("text") or "").strip()
        ],
        "open_questions": list(summary.get("open_questions") or []),
        "meeting_feedback": feedback,
    }
    envelope = {
        "schema_version": "1.0",
        "opportunity_id": str(opportunity_id),
        "status": "ready",
        "outputs": {
            "call_summary": "\n\n".join(call_summary_parts).strip(),
            "mom": mom,
            "presentation": {
                "status": "unfrozen",
                "code": "ADJUSTED_PPT_PENDING_EXISTING_DECK_PATH",
                "presentation_id": None,
                "download_url": None,
            },
            "transcript_summary": summary,
            "generated_at": _now(),
        },
    }
    payload = _validate("stage2_outputs.schema.json", envelope)
    store.update_opportunity(
        opportunity_id=opportunity_id,
        user_id=user_id,
        updates={"stage2_outputs": payload},
    )
    return payload


def _clip(text: str, cap: int) -> tuple[str, int]:
    words = text.split()
    clipped = " ".join(words[:cap])
    return clipped, len(clipped.split())


def generate_email_draft(
    store: Any,
    *,
    opportunity_id: UUID,
    user_id: UUID,
    journey_stage: str,
) -> dict[str, Any]:
    if journey_stage not in JOURNEY_STAGES:
        raise bad_request("INVALID_JOURNEY_STAGE", "journey_stage must be first_contact, deepening, or concretisation")
    opportunity = store.get_opportunity(opportunity_id=opportunity_id, user_id=user_id)
    client = str(opportunity.get("client_name") or "the client")
    name = str(opportunity.get("opportunity_name") or "this opportunity")
    intake = opportunity.get("stage1_intake") or {}
    topic = str(intake.get("sales_topic_description") or name).strip()
    facts: list[str] = [
        f"This note is about {name} with {client}.",
        f"The stated sales topic is {topic}.",
        "Confirm stores the chosen length only. This API never sends mail.",
    ]
    if journey_stage == "deepening":
        sources = store.list_transcript_sources(opportunity_id=opportunity_id, user_id=user_id)
        if not sources:
            raise bad_request(
                "TRANSCRIPT_REQUIRED",
                "Upload a meeting transcript before generating the Deepening email draft.",
            )
        summary = summarize_speaker_sections(
            sources[-1].get("sections") or [],
            opportunity_id=opportunity_id,
            transcript_id=sources[-1]["id"],
        )
        facts.append("The draft uses TRANSCRIPT_SUMMARY only; raw speaker turns are not included.")
        for decision in summary.get("decisions") or []:
            facts.append(str(decision))
        for item in summary.get("action_items") or []:
            facts.append(str(item.get("text") or ""))
        feedback = opportunity.get("meeting_feedback_text")
        if feedback:
            facts.append("Meeting feedback: " + str(feedback).strip())
    elif journey_stage == "first_contact":
        facts.append("This is an optional pre-meeting note. It does not invent company facts.")
    else:
        facts.append("This is an optional post-proposal note. It does not invent prices or commercial terms.")

    base = " ".join(part.strip() for part in facts if part.strip())
    subject = f"{name} — {journey_stage.replace('_', ' ')} follow-up"
    short_body, short_count = _clip(base, SHORT_WORD_CAP)
    medium_body, medium_count = _clip(base + " We will keep the next conversation aligned to stated facts only.", MEDIUM_WORD_CAP)
    extensive_body, extensive_count = _clip(
        base
        + " Review the checklist before confirm. Confirm does not send. Outlook draft creation is out of this endpoint.",
        EXTENSIVE_WORD_CAP,
    )
    lengths = {
        "short": {"subject": subject, "body": short_body, "word_count": short_count},
        "medium": {"subject": subject, "body": medium_body, "word_count": medium_count},
        "extensive": {"subject": subject, "body": extensive_body, "word_count": extensive_count},
    }
    existing = store.get_email_draft(
        opportunity_id=opportunity_id,
        user_id=user_id,
        journey_stage=journey_stage,
    )
    stored = store.upsert_email_draft(
        opportunity_id=opportunity_id,
        user_id=user_id,
        journey_stage=journey_stage,
        payload={
            "status": "draft",
            "selected_length": existing.get("selected_length") if existing else None,
            "lengths": lengths,
            "confirmed_at": None,
        },
    )
    return envelope_from_stored(opportunity_id, journey_stage, stored)


def envelope_from_stored(opportunity_id: UUID, journey_stage: str, stored: dict[str, Any] | None) -> dict[str, Any]:
    if stored is None:
        return empty_email(opportunity_id, journey_stage)
    created = stored.get("created_at")
    updated = stored.get("updated_at")
    confirmed = stored.get("confirmed_at")
    draft = {
        "id": str(stored["id"]),
        "status": stored.get("status") or "draft",
        "send_status": "not_sent",
        "selected_length": stored.get("selected_length"),
        "lengths": stored["lengths"],
        "confirmed_at": confirmed.isoformat().replace("+00:00", "Z") if hasattr(confirmed, "isoformat") else confirmed,
        "created_at": created.isoformat().replace("+00:00", "Z") if hasattr(created, "isoformat") else str(created),
        "updated_at": updated.isoformat().replace("+00:00", "Z") if hasattr(updated, "isoformat") else str(updated),
    }
    return _validate(
        "email_draft.schema.json",
        {
            "schema_version": "1.0",
            "opportunity_id": str(opportunity_id),
            "journey_stage": journey_stage,
            "draft": draft,
        },
    )


def confirm_email_draft(
    store: Any,
    *,
    opportunity_id: UUID,
    user_id: UUID,
    draft_id: UUID,
    selected_length: str,
) -> dict[str, Any]:
    if selected_length not in {"short", "medium", "extensive"}:
        raise bad_request("INVALID_EMAIL_LENGTH", "selected_length must be short, medium, or extensive")
    stored = store.get_email_draft_by_id(
        opportunity_id=opportunity_id,
        user_id=user_id,
        draft_id=draft_id,
    )
    journey_stage = stored["journey_stage"]
    updated = store.upsert_email_draft(
        opportunity_id=opportunity_id,
        user_id=user_id,
        journey_stage=journey_stage,
        payload={
            "status": "confirmed",
            "selected_length": selected_length,
            "lengths": stored["lengths"],
            "confirmed_at": _now(),
        },
    )
    return envelope_from_stored(opportunity_id, journey_stage, updated)


def prompt_uses_summary_only(prompt: str) -> None:
    if "UNTRUSTED_TRANSCRIPT_BEGIN" in prompt or "TRANSCRIPT_SUMMARY_BEGIN" not in prompt:
        raise AssertionError("LLM prompt must use TRANSCRIPT_SUMMARY only")


def summary_prompt_block(summary: dict[str, Any]) -> str:
    return format_transcript_summary_for_prompt(summary)
