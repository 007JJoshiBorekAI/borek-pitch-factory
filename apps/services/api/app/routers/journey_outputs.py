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
from app.services.discovery_paper import (
    approve_discovery_paper,
    edit_discovery_paper,
    generate_discovery_paper,
    get_discovery_paper,
    get_discovery_paper_version,
    get_latest_approved_discovery_paper,
    list_discovery_paper_versions,
)
from app.services.stage1 import get_company_research_provider
from services.framework.stage1_research import CompanyResearchProvider
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
    regenerate_stage1_presentation,
    get_meeting_feedback,
)
from app.services.meeting_extraction import (
    empty_meeting_extraction,
    generate_meeting_extraction,
    get_meeting_extraction,
    personal_notes_view,
)
from app.services.ppt2_context import build_ppt2_context
from app.services.workflow_status import (
    build_workflow_status,
    mark_finalized,
    mark_first_meeting_completed,
    mark_owner_reviewed,
)
from app.services.use_case_selection import (
    get_selected_use_cases,
    list_available_use_cases,
    replace_selected_use_cases,
)

router = APIRouter(dependencies=[Depends(get_current_user)])


class MeetingFeedbackUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str | None = Field(default=None, max_length=20_000)


class PersonalNotesUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str | None = Field(default=None, max_length=20_000)


class MeetingExtractionGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transcript_id: UUID


class SelectedUseCasesUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    use_case_ids: list[str]


class EmailGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    journey_stage: Literal["first_contact", "deepening", "concretisation"]


class DiscoveryPaperPageEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: Literal[
        "cover",
        "client_context",
        "opportunity",
        "borek_approach",
        "relevant_use_case",
        "pilot_proposal",
        "next_steps",
    ]
    content: dict


class DiscoveryPaperEditRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_document_id: UUID | None = None
    pages: list[DiscoveryPaperPageEdit] = Field(min_length=1)


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


@router.post("/{opportunity_id}/stage1-outputs/presentation/regenerate")
def post_regenerate_stage1_presentation(
    opportunity_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    record_audit_event(
        store,
        actor_id=user.id,
        action=AuditAction.STAGE1_PRESENTATION_REGENERATE,
        object_type=AuditObjectType.OPPORTUNITY,
        object_id=opportunity_id,
    )
    return regenerate_stage1_presentation(
        store,
        opportunity_id=opportunity_id,
        user_id=user.id,
    )


@router.get("/{opportunity_id}/discovery-paper")
def get_opportunity_discovery_paper(
    opportunity_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    return get_discovery_paper(store, opportunity_id=opportunity_id, user_id=user.id)


@router.post("/{opportunity_id}/discovery-paper/generate")
def post_opportunity_discovery_paper(
    opportunity_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
    provider: CompanyResearchProvider | None = Depends(get_company_research_provider),
) -> dict:
    record_audit_event(
        store,
        actor_id=user.id,
        action=AuditAction.DISCOVERY_PAPER_GENERATE,
        object_type=AuditObjectType.OPPORTUNITY,
        object_id=opportunity_id,
    )
    return generate_discovery_paper(
        store,
        opportunity_id=opportunity_id,
        user_id=user.id,
        provider=provider,
    )


@router.patch("/{opportunity_id}/discovery-paper")
def patch_opportunity_discovery_paper(
    opportunity_id: UUID,
    body: DiscoveryPaperEditRequest,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    paper, version_id = edit_discovery_paper(
        store,
        opportunity_id=opportunity_id,
        user_id=user.id,
        pages=[page.model_dump() for page in body.pages],
        expected_document_id=str(body.expected_document_id) if body.expected_document_id else None,
    )
    record_audit_event(
        store,
        actor_id=user.id,
        action=AuditAction.DISCOVERY_PAPER_EDIT,
        object_type=AuditObjectType.OPPORTUNITY,
        object_id=opportunity_id,
        document_id=str(paper["document_id"]),
        version_id=version_id,
    )
    return paper


@router.post("/{opportunity_id}/discovery-paper/approve")
def post_opportunity_discovery_paper_approve(
    opportunity_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    approved = approve_discovery_paper(
        store,
        opportunity_id=opportunity_id,
        user_id=user.id,
    )
    record_audit_event(
        store,
        actor_id=user.id,
        action=AuditAction.DISCOVERY_PAPER_APPROVE,
        object_type=AuditObjectType.OPPORTUNITY,
        object_id=opportunity_id,
        document_id=str(approved["document_id"]),
        version_id=UUID(approved["id"]),
    )
    return approved


@router.get("/{opportunity_id}/discovery-paper/approved")
def get_opportunity_approved_discovery_paper(
    opportunity_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    return get_latest_approved_discovery_paper(
        store,
        opportunity_id=opportunity_id,
        user_id=user.id,
    )


@router.get("/{opportunity_id}/discovery-paper/versions")
def get_opportunity_discovery_paper_versions(
    opportunity_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    return {
        "versions": list_discovery_paper_versions(
            store,
            opportunity_id=opportunity_id,
            user_id=user.id,
        )
    }


@router.get("/{opportunity_id}/discovery-paper/versions/{version_id}")
def get_opportunity_discovery_paper_version(
    opportunity_id: UUID,
    version_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    return get_discovery_paper_version(
        store,
        opportunity_id=opportunity_id,
        version_id=version_id,
        user_id=user.id,
    )


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


@router.get("/{opportunity_id}/personal-notes")
def read_personal_notes(
    opportunity_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    opportunity = store.get_opportunity(opportunity_id=opportunity_id, user_id=user.id)
    return personal_notes_view(opportunity)


@router.put("/{opportunity_id}/personal-notes")
def write_personal_notes(
    opportunity_id: UUID,
    body: PersonalNotesUpdate,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    from datetime import UTC, datetime

    text = None if body.text is None else body.text.strip() or None
    store.update_opportunity(
        opportunity_id=opportunity_id,
        user_id=user.id,
        updates={
            "personal_notes": text,
            "personal_notes_updated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        },
    )
    record_audit_event(
        store,
        actor_id=user.id,
        action=AuditAction.PERSONAL_NOTES_UPDATE,
        object_type=AuditObjectType.OPPORTUNITY,
        object_id=opportunity_id,
    )
    opportunity = store.get_opportunity(opportunity_id=opportunity_id, user_id=user.id)
    return personal_notes_view(opportunity)


@router.get("/{opportunity_id}/meeting-extraction")
def read_meeting_extraction(
    opportunity_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    stored = get_meeting_extraction(
        store,
        opportunity_id=opportunity_id,
        user_id=user.id,
    )
    return stored if stored is not None else empty_meeting_extraction(opportunity_id)


@router.post("/{opportunity_id}/meeting-extraction/generate")
def post_meeting_extraction(
    opportunity_id: UUID,
    body: MeetingExtractionGenerateRequest,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    stored = generate_meeting_extraction(
        store,
        opportunity_id=opportunity_id,
        user_id=user.id,
        transcript_id=body.transcript_id,
    )
    record_audit_event(
        store,
        actor_id=user.id,
        action=AuditAction.MEETING_EXTRACTION_GENERATE,
        object_type=AuditObjectType.OPPORTUNITY,
        object_id=opportunity_id,
        document_id=str(body.transcript_id),
    )
    return stored


@router.get("/{opportunity_id}/available-use-cases")
def read_available_use_cases(
    opportunity_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    return list_available_use_cases(
        store,
        opportunity_id=opportunity_id,
        user_id=user.id,
    )


@router.get("/{opportunity_id}/selected-use-cases")
def read_selected_use_cases(
    opportunity_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    return get_selected_use_cases(
        store,
        opportunity_id=opportunity_id,
        user_id=user.id,
    )


@router.put("/{opportunity_id}/selected-use-cases")
def write_selected_use_cases(
    opportunity_id: UUID,
    body: SelectedUseCasesUpdate,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    stored = replace_selected_use_cases(
        store,
        opportunity_id=opportunity_id,
        user_id=user.id,
        use_case_ids=body.use_case_ids,
    )
    record_audit_event(
        store,
        actor_id=user.id,
        action=AuditAction.SELECTED_USE_CASES_UPDATE,
        object_type=AuditObjectType.OPPORTUNITY,
        object_id=opportunity_id,
        document_id=",".join(stored["use_case_ids"]) if stored["use_case_ids"] else "0",
    )
    return stored


@router.get("/{opportunity_id}/ppt2-context")
def read_ppt2_context(
    opportunity_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    return build_ppt2_context(
        store,
        opportunity_id=opportunity_id,
        user_id=user.id,
    )


@router.get("/{opportunity_id}/workflow-status")
def read_workflow_status(
    opportunity_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    return build_workflow_status(
        store,
        opportunity_id=opportunity_id,
        user_id=user.id,
    )


@router.post("/{opportunity_id}/workflow/first-meeting-completed")
def post_first_meeting_completed(
    opportunity_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    return mark_first_meeting_completed(
        store,
        opportunity_id=opportunity_id,
        user_id=user.id,
    )


@router.post("/{opportunity_id}/workflow/owner-reviewed")
def post_owner_reviewed(
    opportunity_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    return mark_owner_reviewed(
        store,
        opportunity_id=opportunity_id,
        user_id=user.id,
    )


@router.post("/{opportunity_id}/ppt2/generate")
def post_ppt2_generate(
    opportunity_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    from app.services.presentation_generation import (
        enqueue_post_meeting_presentation_generate,
    )

    record_audit_event(
        store,
        actor_id=user.id,
        action=AuditAction.PPT2_PRESENTATION_GENERATE,
        object_type=AuditObjectType.OPPORTUNITY,
        object_id=opportunity_id,
    )
    return enqueue_post_meeting_presentation_generate(
        store,
        opportunity_id=opportunity_id,
        user_id=user.id,
    )


@router.post("/{opportunity_id}/ppt2/{presentation_id}/regenerate")
def post_ppt2_regenerate(
    opportunity_id: UUID,
    presentation_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    from app.services.presentation_generation import (
        enqueue_post_meeting_presentation_generate,
    )

    record_audit_event(
        store,
        actor_id=user.id,
        action=AuditAction.PPT2_PRESENTATION_REGENERATE,
        object_type=AuditObjectType.OPPORTUNITY,
        object_id=opportunity_id,
    )
    return enqueue_post_meeting_presentation_generate(
        store,
        opportunity_id=opportunity_id,
        user_id=user.id,
        presentation_id=presentation_id,
    )


@router.post("/{opportunity_id}/workflow/finalize")
def post_workflow_finalized(
    opportunity_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> dict:
    return mark_finalized(
        store,
        opportunity_id=opportunity_id,
        user_id=user.id,
    )


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
    from app.services.journey_stage import reject_owner_concretisation

    reject_owner_concretisation(body.journey_stage)
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
