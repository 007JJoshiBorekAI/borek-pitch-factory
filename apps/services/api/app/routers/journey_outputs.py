"""BT-36 / TSK-013 retrieval APIs for MS-35."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from app.auth import get_current_user
from app.dependencies import AuthUserDep, DataStoreDep
from app.services.api_errors import bad_request
from app.services.audit import AuditAction, AuditObjectType, record_audit_event
from app.services.journey_generation import (
    JOURNEY_STAGES,
    client_preparation_envelope,
    confirm_email_draft,
    empty_stage1,
    empty_stage2,
    envelope_from_stored,
    generate_client_preparation_email,
    generate_email_draft,
    generate_stage1_outputs,
    generate_stage2_outputs,
    get_meeting_feedback,
)

router = APIRouter(dependencies=[Depends(get_current_user)])


class MeetingFeedbackUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str | None = Field(default=None, max_length=20_000)


class EmailGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    journey_stage: Literal["first_contact", "deepening", "concretisation"]


class EmailConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    selected_length: Literal["short", "medium", "extensive"]


@router.get("/{opportunity_id}/stage1-outputs")
def get_stage1_outputs(
    opportunity_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    opportunity = store.get_opportunity(opportunity_id=opportunity_id, user_id=user.id)
    return opportunity.get("stage1_outputs") or empty_stage1(opportunity_id)


@router.post("/{opportunity_id}/stage1-outputs/generate")
def post_stage1_outputs(
    opportunity_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    record_audit_event(
        store,
        actor_id=user.id,
        action=AuditAction.STAGE1_OUTPUTS_GENERATE,
        object_type=AuditObjectType.OPPORTUNITY,
        object_id=opportunity_id,
    )
    return generate_stage1_outputs(store, opportunity_id=opportunity_id, user_id=user.id)


@router.get("/{opportunity_id}/stage2-outputs")
def get_stage2_outputs(
    opportunity_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    opportunity = store.get_opportunity(opportunity_id=opportunity_id, user_id=user.id)
    return opportunity.get("stage2_outputs") or empty_stage2(opportunity_id)


@router.post("/{opportunity_id}/stage2-outputs/generate")
def post_stage2_outputs(
    opportunity_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    record_audit_event(
        store,
        actor_id=user.id,
        action=AuditAction.STAGE2_OUTPUTS_GENERATE,
        object_type=AuditObjectType.OPPORTUNITY,
        object_id=opportunity_id,
    )
    return generate_stage2_outputs(store, opportunity_id=opportunity_id, user_id=user.id)


@router.get("/{opportunity_id}/meeting-feedback")
def read_meeting_feedback(
    opportunity_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    opportunity = store.get_opportunity(opportunity_id=opportunity_id, user_id=user.id)
    return get_meeting_feedback(opportunity)


@router.put("/{opportunity_id}/meeting-feedback")
def write_meeting_feedback(
    opportunity_id: UUID,
    body: MeetingFeedbackUpdate,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    from datetime import UTC, datetime

    text = None if body.text is None else body.text.strip() or None
    store.update_opportunity(
        opportunity_id=opportunity_id,
        user_id=user.id,
        updates={
            "meeting_feedback_text": text,
            "meeting_feedback_updated_at": datetime.now(UTC),
        },
    )
    record_audit_event(
        store,
        actor_id=user.id,
        action=AuditAction.MEETING_FEEDBACK_UPDATE,
        object_type=AuditObjectType.OPPORTUNITY,
        object_id=opportunity_id,
    )
    opportunity = store.get_opportunity(opportunity_id=opportunity_id, user_id=user.id)
    return get_meeting_feedback(opportunity)


@router.get("/{opportunity_id}/client-preparation-email")
def get_client_preparation_email(
    opportunity_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    opportunity = store.get_opportunity(opportunity_id=opportunity_id, user_id=user.id)
    stored = opportunity.get("client_preparation_email")
    return client_preparation_envelope(opportunity_id, stored)


@router.post("/{opportunity_id}/client-preparation-email/generate")
def post_client_preparation_email_generate(
    opportunity_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    record_audit_event(
        store,
        actor_id=user.id,
        action=AuditAction.CLIENT_PREPARATION_EMAIL_GENERATE,
        object_type=AuditObjectType.OPPORTUNITY,
        object_id=opportunity_id,
    )
    return generate_client_preparation_email(
        store,
        opportunity_id=opportunity_id,
        user_id=user.id,
    )


@router.get("/{opportunity_id}/email-drafts")
def get_email_drafts(
    opportunity_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
    journey_stage: Literal["first_contact", "deepening", "concretisation"],
) -> dict:
    stored = store.get_email_draft(
        opportunity_id=opportunity_id,
        user_id=user.id,
        journey_stage=journey_stage,
    )
    return envelope_from_stored(opportunity_id, journey_stage, stored)


@router.post("/{opportunity_id}/email-drafts/generate")
def post_email_drafts(
    opportunity_id: UUID,
    body: EmailGenerateRequest,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    record_audit_event(
        store,
        actor_id=user.id,
        action=AuditAction.EMAIL_DRAFT_GENERATE,
        object_type=AuditObjectType.OPPORTUNITY,
        object_id=opportunity_id,
    )
    return generate_email_draft(
        store,
        opportunity_id=opportunity_id,
        user_id=user.id,
        journey_stage=body.journey_stage,
    )


@router.post("/{opportunity_id}/email-drafts/{draft_id}/confirm")
def post_email_confirm(
    opportunity_id: UUID,
    draft_id: UUID,
    body: EmailConfirmRequest,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    record_audit_event(
        store,
        actor_id=user.id,
        action=AuditAction.EMAIL_DRAFT_CONFIRM,
        object_type=AuditObjectType.OPPORTUNITY,
        object_id=opportunity_id,
    )
    return confirm_email_draft(
        store,
        opportunity_id=opportunity_id,
        user_id=user.id,
        draft_id=draft_id,
        selected_length=body.selected_length,
    )


@router.post("/{opportunity_id}/email-drafts/{draft_id}/send")
def post_email_send(
    opportunity_id: UUID,
    draft_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    store.get_opportunity(opportunity_id=opportunity_id, user_id=user.id)
    store.get_email_draft_by_id(
        opportunity_id=opportunity_id,
        user_id=user.id,
        draft_id=draft_id,
    )
    raise bad_request(
        "EMAIL_SEND_FORBIDDEN",
        "Confirm stores the review state only. This API never sends mail.",
    )


__all__ = ["router", "JOURNEY_STAGES"]
