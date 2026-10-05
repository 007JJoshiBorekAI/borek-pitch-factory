"""BT-41 opportunity-scoped Discovery Paper generation."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.config import settings
from app.services.api_errors import bad_request
from app.services.knowledge_access import resolve_active_corpus
from services.framework.company_facts import ground_company_facts
from services.framework.discovery_paper import (
    DiscoveryPaperPageError,
    empty_discovery_paper,
    generate_discovery_paper_progressively,
)
from services.framework.stage1_intake import resolve_meeting_purpose
from services.framework.stage1_research import generate_stage1_research


def get_discovery_paper(store: Any, *, opportunity_id: UUID, user_id: UUID) -> dict[str, Any]:
    opportunity = store.get_opportunity(opportunity_id=opportunity_id, user_id=user_id)
    stored = opportunity.get("discovery_paper")
    if isinstance(stored, dict):
        return stored
    return empty_discovery_paper(opportunity)


def generate_discovery_paper(
    store: Any,
    *,
    opportunity_id: UUID,
    user_id: UUID,
    provider: Any = None,
) -> dict[str, Any]:
    opportunity = store.get_opportunity(opportunity_id=opportunity_id, user_id=user_id)
    corpus = resolve_active_corpus(store)

    def persist(paper: dict[str, Any]) -> None:
        store.update_opportunity(
            opportunity_id=opportunity_id,
            user_id=user_id,
            updates={"discovery_paper": paper},
        )

    def research_factory() -> dict[str, Any]:
        return generate_stage1_research(
            opportunity,
            corpus=corpus,
            provider=provider,
            use_llm=False,
        )

    def grounding_factory() -> dict[str, Any]:
        purpose = resolve_meeting_purpose(opportunity)
        return ground_company_facts(
            purpose or str(opportunity.get("client_name") or ""),
            corpus=corpus,
        )

    try:
        return generate_discovery_paper_progressively(
            opportunity,
            persist=persist,
            research_factory=research_factory,
            grounding_factory=grounding_factory,
            complete=_live_complete() if settings.AI_EXECUTION_MODE == "live" else None,
        )
    except DiscoveryPaperPageError as exc:
        raise bad_request("DISCOVERY_PAPER_PAGE_FAILED", str(exc)) from exc


def _live_complete():
    from llm.claude.client import structured_complete

    def complete(system: str, user: str, schema: dict[str, Any]) -> dict[str, Any]:
        return structured_complete(
            system,
            user,
            schema,
            tool_name="submit_discovery_narration",
            tool_description="Submit a non-priced discovery pilot concept and three next steps.",
            max_tokens=1024,
        )

    return complete
