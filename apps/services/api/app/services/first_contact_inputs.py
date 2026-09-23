"""BT-35 First contact vs Deepening input requirements."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.services.api_errors import bad_request
from app.services.journey_stage import ENTRY_JOURNEY_STAGE, find_completed_stage_version


def is_first_contact_opportunity(
    store: Any,
    *,
    opportunity_id: UUID,
    user_id: UUID,
) -> bool:
    """True until a completed First contact presentation exists."""
    completed = find_completed_stage_version(
        store,
        opportunity_id=opportunity_id,
        user_id=user_id,
        journey_stage=ENTRY_JOURNEY_STAGE,
    )
    return completed is None


def list_processed_client_document_sources(
    store: Any,
    *,
    opportunity_id: UUID,
    user_id: UUID,
) -> list[dict[str, Any]]:
    lister = getattr(store, "list_client_document_sources", None)
    if not callable(lister):
        return []
    sources = lister(opportunity_id=opportunity_id, user_id=user_id)
    return [
        source
        for source in sources
        if str(source.get("processing_status") or "") == "processed"
    ]


def require_first_contact_client_documents(
    store: Any,
    *,
    opportunity_id: UUID,
    user_id: UUID,
) -> list[dict[str, Any]]:
    """First contact research/generation requires processed client documents."""
    if not is_first_contact_opportunity(
        store,
        opportunity_id=opportunity_id,
        user_id=user_id,
    ):
        return list_processed_client_document_sources(
            store,
            opportunity_id=opportunity_id,
            user_id=user_id,
        )

    processed = list_processed_client_document_sources(
        store,
        opportunity_id=opportunity_id,
        user_id=user_id,
    )
    if processed:
        return processed

    transcripts = store.list_transcripts(
        opportunity_id=opportunity_id,
        user_id=user_id,
    )
    if transcripts:
        raise bad_request(
            "TRANSCRIPT_NOT_ALLOWED_FOR_FIRST_CONTACT",
            "Meeting transcripts cannot be used for First contact. Upload client documents instead.",
        )
    raise bad_request(
        "CLIENT_DOCUMENT_REQUIRED",
        "Upload at least one client document before starting First contact research or generation.",
    )


def require_deepening_transcripts(
    store: Any,
    *,
    opportunity_id: UUID,
    user_id: UUID,
) -> None:
    """Deepening framework generation still requires meeting transcripts."""
    if is_first_contact_opportunity(
        store,
        opportunity_id=opportunity_id,
        user_id=user_id,
    ):
        return
    sources = store.list_transcript_sources(
        opportunity_id=opportunity_id,
        user_id=user_id,
    )
    if not sources:
        raise bad_request(
            "TRANSCRIPT_REQUIRED",
            "Upload at least one meeting transcript before generating a Deepening framework.",
        )


def assert_framework_generation_inputs(
    store: Any,
    *,
    opportunity_id: UUID,
    user_id: UUID,
) -> None:
    """Reject transcript-only First contact; preserve Deepening transcript requirement."""
    if is_first_contact_opportunity(
        store,
        opportunity_id=opportunity_id,
        user_id=user_id,
    ):
        processed = list_processed_client_document_sources(
            store,
            opportunity_id=opportunity_id,
            user_id=user_id,
        )
        transcripts = store.list_transcripts(
            opportunity_id=opportunity_id,
            user_id=user_id,
        )
        if transcripts and not processed:
            raise bad_request(
                "TRANSCRIPT_NOT_ALLOWED_FOR_FIRST_CONTACT",
                "Meeting transcripts cannot be used for First contact. Upload client documents instead.",
            )
        return
    require_deepening_transcripts(
        store,
        opportunity_id=opportunity_id,
        user_id=user_id,
    )
