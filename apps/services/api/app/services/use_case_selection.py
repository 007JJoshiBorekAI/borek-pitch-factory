"""BT-45: reference-only selection of existing approved Borek use cases."""

from __future__ import annotations

import copy
from typing import Any
from uuid import UUID

from app.services.api_errors import bad_request
from app.services.knowledge_access import resolve_active_corpus
from services.borek_rag.identity import is_demo_corpus, live_corpus_id
from services.borek_rag.models import Corpus, CorpusFact

REFERENCE_KIND = "reference"


def _stored_ids(opportunity: dict[str, Any]) -> list[str]:
    raw = opportunity.get("selected_use_case_ids")
    if not isinstance(raw, list):
        return []
    ids: list[str] = []
    for item in raw:
        fact_id = str(item or "").strip()
        if fact_id and fact_id not in ids:
            ids.append(fact_id)
    return ids


def _is_attachable(fact: CorpusFact) -> bool:
    return (
        fact.kind == REFERENCE_KIND
        and fact.source.document_type == REFERENCE_KIND
        and fact.source.corpus_id == live_corpus_id()
        and not is_demo_corpus(fact.source.corpus_id)
    )


def _attachable_facts(corpus: Corpus) -> list[CorpusFact]:
    return sorted(
        (fact for fact in corpus.facts if _is_attachable(fact)),
        key=lambda fact: fact.fact_id,
    )


def _display_title(fact: CorpusFact) -> str | None:
    for key in ("title", "name"):
        value = fact.payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _public_fact(fact: CorpusFact, *, selected: bool) -> dict[str, Any]:
    return {
        "fact_id": fact.fact_id,
        "document_id": fact.source.document_id,
        "document_version": fact.source.document_version,
        "service_key": fact.service_key or None,
        "statement": fact.statement,
        "title": _display_title(fact),
        "selected": selected,
    }


def _canonical_fact(fact: CorpusFact) -> dict[str, Any]:
    return {
        "fact_id": fact.fact_id,
        "status": "resolved",
        "document_id": fact.source.document_id,
        "document_version": fact.source.document_version,
        "document_type": fact.source.document_type,
        "service_key": fact.service_key or None,
        "statement": fact.statement,
        "payload": copy.deepcopy(fact.payload),
        "corpus_id": fact.source.corpus_id,
        "corpus_version": fact.source.corpus_version,
    }


def _unresolved(fact_id: str) -> dict[str, Any]:
    return {
        "fact_id": fact_id,
        "status": "unresolved",
        "document_id": None,
        "document_version": None,
        "document_type": None,
        "service_key": None,
        "statement": None,
        "payload": None,
        "corpus_id": None,
        "corpus_version": None,
    }


def _demo_fact_ids(store: Any) -> set[str]:
    lister = getattr(store, "list_approved_knowledge_facts", None)
    if not callable(lister):
        return set()
    return {
        str(row.get("fact_key") or "").strip()
        for row in lister()
        if is_demo_corpus(str(row.get("corpus_key") or ""))
        and str(row.get("fact_key") or "").strip()
    }


def _rejection_reason(
    fact_id: str,
    *,
    active: Corpus,
    demo_ids: set[str],
) -> str | None:
    if not fact_id:
        return "blank id"
    match = next((fact for fact in active.facts if fact.fact_id == fact_id), None)
    if match is not None:
        if _is_attachable(match):
            return None
        if is_demo_corpus(match.source.corpus_id):
            return "demo corpus"
        return "not a reference fact"
    if fact_id in demo_ids:
        return "demo corpus"
    return "unknown"


def list_available_use_cases(
    store: Any,
    *,
    opportunity_id: UUID,
    user_id: UUID,
) -> dict[str, Any]:
    opportunity = store.get_opportunity(opportunity_id=opportunity_id, user_id=user_id)
    selected = set(_stored_ids(opportunity))
    facts = _attachable_facts(resolve_active_corpus(store))
    return {
        "opportunity_id": str(opportunity_id),
        "use_cases": [_public_fact(fact, selected=fact.fact_id in selected) for fact in facts],
    }


def replace_selected_use_cases(
    store: Any,
    *,
    opportunity_id: UUID,
    user_id: UUID,
    use_case_ids: list[str],
) -> dict[str, Any]:
    store.get_opportunity(opportunity_id=opportunity_id, user_id=user_id)
    active = resolve_active_corpus(store)
    demo_ids = _demo_fact_ids(store)
    ordered: list[str] = []
    rejected: list[str] = []
    for raw in use_case_ids:
        fact_id = str(raw or "").strip()
        if fact_id in ordered:
            continue
        reason = _rejection_reason(fact_id, active=active, demo_ids=demo_ids)
        if reason is not None:
            rejected.append(f"{fact_id or '(blank)'} ({reason})")
            continue
        ordered.append(fact_id)
    if rejected:
        raise bad_request(
            "USE_CASE_NOT_ATTACHABLE",
            "Every selected id must be an approved borek-internal reference fact. "
            "Rejected: " + ", ".join(rejected) + ".",
        )
    store.update_opportunity(
        opportunity_id=opportunity_id,
        user_id=user_id,
        updates={"selected_use_case_ids": ordered},
    )
    return get_selected_use_cases(store, opportunity_id=opportunity_id, user_id=user_id)


def get_selected_use_cases(
    store: Any,
    *,
    opportunity_id: UUID,
    user_id: UUID,
) -> dict[str, Any]:
    """Resolve stored fact ids against the active corpus without retrieval or generation."""
    opportunity = store.get_opportunity(opportunity_id=opportunity_id, user_id=user_id)
    ids = _stored_ids(opportunity)
    by_id = {fact.fact_id: fact for fact in _attachable_facts(resolve_active_corpus(store))}
    use_cases = [
        _canonical_fact(by_id[fact_id]) if fact_id in by_id else _unresolved(fact_id)
        for fact_id in ids
    ]
    return {
        "opportunity_id": str(opportunity_id),
        "use_case_ids": ids,
        "use_cases": use_cases,
    }
