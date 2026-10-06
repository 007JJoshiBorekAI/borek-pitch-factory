"""BT-41 generation and BT-42 draft edit, approval, and version lookup."""

from __future__ import annotations

import copy
from datetime import datetime
from typing import Any
from uuid import UUID

from jsonschema import ValidationError

from app.config import settings
from app.services.api_errors import bad_request, conflict, not_found
from app.services.knowledge_access import resolve_active_corpus
from services.framework.company_facts import ground_company_facts
from services.framework.discovery_paper import (
    DiscoveryPaperPageError,
    empty_discovery_paper,
    generate_discovery_paper_progressively,
    validate_discovery_paper,
)
from services.framework.stage1_intake import resolve_meeting_purpose
from services.framework.stage1_research import generate_stage1_research

_SYSTEM_FIELDS = (
    "opportunity_id",
    "document_id",
    "generated_at",
    "latest_approved_version_id",
    "schema_version",
    "status",
)


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
    approved = store.get_latest_approved_discovery_paper(
        opportunity_id=opportunity_id,
        user_id=user_id,
    )
    preserved_approval = str(approved["id"]) if approved is not None else None

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
        paper = generate_discovery_paper_progressively(
            opportunity,
            persist=persist,
            research_factory=research_factory,
            grounding_factory=grounding_factory,
            latest_approved_version_id=preserved_approval,
            complete=_live_complete() if settings.AI_EXECUTION_MODE == "live" else None,
        )
    except DiscoveryPaperPageError as exc:
        raise bad_request("DISCOVERY_PAPER_PAGE_FAILED", str(exc)) from exc
    if paper.get("status") == "ready":
        store.create_discovery_paper_version(
            opportunity_id=opportunity_id,
            user_id=user_id,
            document_id=UUID(str(paper["document_id"])),
            paper_json=paper,
        )
    return paper


def edit_discovery_paper(
    store: Any,
    *,
    opportunity_id: UUID,
    user_id: UUID,
    pages: list[dict[str, Any]],
    expected_document_id: str | None = None,
) -> tuple[dict[str, Any], UUID | None]:
    paper = _stored_paper(store, opportunity_id=opportunity_id, user_id=user_id)
    if expected_document_id is not None and str(paper.get("document_id")) != expected_document_id:
        raise conflict(
            "DISCOVERY_PAPER_STALE",
            "The Discovery Paper changed before this edit was saved",
        )
    original_system = {field: copy.deepcopy(paper.get(field)) for field in _SYSTEM_FIELDS}
    original_shells = [
        {field: page.get(field) for field in ("key", "order", "title", "status")}
        for page in paper["pages"]
    ]
    seen: set[str] = set()
    by_key = {page["key"]: page for page in paper["pages"]}
    for edit in pages:
        key = str(edit["key"])
        if key in seen:
            raise bad_request("DISCOVERY_PAPER_INVALID", f"Page {key} was edited more than once")
        seen.add(key)
        page = by_key.get(key)
        if page is None:
            raise bad_request("DISCOVERY_PAPER_UNKNOWN_PAGE", f"Unknown Discovery Paper page {key}")
        if page.get("status") != "ready":
            raise bad_request(
                "DISCOVERY_PAPER_PAGE_NOT_EDITABLE",
                f"Page {key} is not ready to edit",
            )
        page["content"] = copy.deepcopy(edit["content"])
    for field, value in original_system.items():
        paper[field] = value
    for page, shell in zip(paper["pages"], original_shells, strict=True):
        page.update(shell)
    _require_valid(paper)
    store.update_opportunity(
        opportunity_id=opportunity_id,
        user_id=user_id,
        updates={"discovery_paper": paper},
    )
    document_id = UUID(str(paper["document_id"]))
    draft = store.get_draft_discovery_paper_version(
        opportunity_id=opportunity_id,
        user_id=user_id,
        document_id=document_id,
    )
    if draft is None:
        created = store.create_discovery_paper_version(
            opportunity_id=opportunity_id,
            user_id=user_id,
            document_id=document_id,
            paper_json=paper,
        )
        return paper, created["id"]
    updated = store.update_discovery_paper_draft(
        version_id=draft["id"],
        user_id=user_id,
        paper_json=paper,
    )
    return paper, updated["id"]


def approve_discovery_paper(
    store: Any,
    *,
    opportunity_id: UUID,
    user_id: UUID,
) -> dict[str, Any]:
    paper = _stored_paper(store, opportunity_id=opportunity_id, user_id=user_id)
    if paper.get("status") != "ready" or any(page.get("status") != "ready" for page in paper["pages"]):
        raise bad_request(
            "DISCOVERY_PAPER_NOT_READY",
            "Only a fully ready Discovery Paper can be approved",
        )
    _require_valid(paper)
    draft = store.get_draft_discovery_paper_version(
        opportunity_id=opportunity_id,
        user_id=user_id,
        document_id=UUID(str(paper["document_id"])),
    )
    if draft is None:
        raise bad_request(
            "DISCOVERY_PAPER_DRAFT_NOT_FOUND",
            "No draft Discovery Paper version matches the current document",
        )
    approved_paper = copy.deepcopy(paper)
    approved_paper["latest_approved_version_id"] = str(draft["id"])
    _require_valid(approved_paper)
    approved = store.approve_discovery_paper_version(
        version_id=draft["id"],
        user_id=user_id,
        paper_json=approved_paper,
    )
    store.update_opportunity(
        opportunity_id=opportunity_id,
        user_id=user_id,
        updates={"discovery_paper": approved_paper},
    )
    return _public_version(approved)


def get_discovery_paper_version(
    store: Any,
    *,
    opportunity_id: UUID,
    version_id: UUID,
    user_id: UUID,
) -> dict[str, Any]:
    row = store.get_discovery_paper_version(version_id=version_id, user_id=user_id)
    if row["opportunity_id"] != opportunity_id:
        raise not_found(
            "DISCOVERY_PAPER_VERSION_NOT_FOUND",
            f"Discovery Paper version {version_id} was not found",
        )
    return _public_version(row)


def list_discovery_paper_versions(
    store: Any,
    *,
    opportunity_id: UUID,
    user_id: UUID,
) -> list[dict[str, Any]]:
    return [
        _public_version(row, include_paper=False)
        for row in store.list_discovery_paper_versions(
            opportunity_id=opportunity_id,
            user_id=user_id,
        )
    ]


def get_latest_approved_discovery_paper(
    store: Any,
    *,
    opportunity_id: UUID,
    user_id: UUID,
) -> dict[str, Any]:
    """Authoritative lookup for the latest approved Discovery Paper version."""
    row = store.get_latest_approved_discovery_paper(
        opportunity_id=opportunity_id,
        user_id=user_id,
    )
    if row is None:
        raise not_found(
            "DISCOVERY_PAPER_NOT_APPROVED",
            f"No approved Discovery Paper exists for opportunity {opportunity_id}",
        )
    return _public_version(row)


def _stored_paper(store: Any, *, opportunity_id: UUID, user_id: UUID) -> dict[str, Any]:
    opportunity = store.get_opportunity(opportunity_id=opportunity_id, user_id=user_id)
    stored = opportunity.get("discovery_paper")
    if not isinstance(stored, dict) or stored.get("status") == "not_generated" or stored.get("document_id") is None:
        raise bad_request(
            "DISCOVERY_PAPER_NOT_GENERATED",
            "Generate a Discovery Paper before editing or approving it",
        )
    return copy.deepcopy(stored)


def _require_valid(paper: dict[str, Any]) -> None:
    try:
        validate_discovery_paper(paper)
    except (ValidationError, ValueError) as exc:
        raise bad_request("DISCOVERY_PAPER_INVALID", str(exc).splitlines()[0]) from exc


def _public_version(row: dict[str, Any], *, include_paper: bool = True) -> dict[str, Any]:
    payload = {
        "id": str(row["id"]),
        "opportunity_id": str(row["opportunity_id"]),
        "version_number": row["version_number"],
        "document_id": str(row["document_id"]),
        "status": row["status"],
        "created_at": _iso(row["created_at"]),
        "updated_at": _iso(row["updated_at"]),
        "approved_at": _iso(row["approved_at"]) if row.get("approved_at") else None,
    }
    if include_paper:
        payload["paper_json"] = copy.deepcopy(row["paper_json"])
    return payload


def _iso(value: datetime | str) -> str:
    if isinstance(value, datetime):
        return value.isoformat().replace("+00:00", "Z")
    return str(value)


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
