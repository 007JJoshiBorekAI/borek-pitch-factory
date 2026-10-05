"""BT-41 Discovery Paper. Structured pages filled from persisted intake and grounded sources."""

from __future__ import annotations

import copy
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

from jsonschema import Draft202012Validator, FormatChecker

from services.framework.company_facts import ground_company_facts
from services.framework.stage1_intake import meeting_purpose_source, resolve_meeting_purpose
from services.framework.stage1_research import generate_stage1_research

SCHEMA_PATH = (
    Path(__file__).resolve().parents[4] / "packages" / "contracts" / "discovery_paper.schema.json"
)
PAGE_SPECS = (
    ("cover", 1, "Cover"),
    ("client_context", 2, "Client context"),
    ("opportunity", 3, "Opportunity"),
    ("borek_approach", 4, "Borek approach"),
    ("relevant_use_case", 5, "Relevant use case"),
    ("pilot_proposal", 6, "Pilot proposal"),
    ("next_steps", 7, "Next steps"),
)
RESEARCH_FACT_FIELDS = (
    "description",
    "headquarters",
    "employee_headcount",
    "decision_makers",
    "revenue",
)
_COMMERCIAL_RE = re.compile(
    r"(EUR|USD|GBP|CHF|€|\bday rate\b|\blist price\b|\bFTE\b|concretis|concretiz)",
    re.IGNORECASE,
)
CompleteFn = Callable[[str, str, dict[str, Any]], dict[str, Any]]
PersistFn = Callable[[dict[str, Any]], None]
RenderFn = Callable[..., dict[str, Any]]


class DiscoveryPaperPageError(RuntimeError):
    """A page failed after earlier ready pages were persisted."""

    def __init__(self, page_key: str, message: str) -> None:
        self.page_key = page_key
        super().__init__(message)


def load_discovery_paper_schema() -> dict[str, Any]:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def validate_discovery_paper(payload: dict[str, Any]) -> dict[str, Any]:
    Draft202012Validator(
        load_discovery_paper_schema(), format_checker=FormatChecker()
    ).validate(payload)
    _assert_status_consistency(payload)
    rendered = json.dumps(payload)
    if _COMMERCIAL_RE.search(rendered):
        raise ValueError("Discovery Paper contains commercial or concretisation content")
    return payload


def _assert_status_consistency(payload: dict[str, Any]) -> None:
    page_statuses = [page["status"] for page in payload["pages"]]
    top = payload["status"]
    if any(status == "failed" for status in page_statuses) and top != "failed":
        raise ValueError("A failed page requires top-level status failed")
    if top == "ready" and any(status != "ready" for status in page_statuses):
        raise ValueError("Top-level ready requires every page to be ready")
    if page_statuses and all(status == "ready" for status in page_statuses) and top != "ready":
        raise ValueError("All ready pages require top-level status ready")


def empty_discovery_paper(opportunity: dict[str, Any]) -> dict[str, Any]:
    return validate_discovery_paper(
        {
            "schema_version": "1.0",
            "opportunity_id": str(opportunity["id"]),
            "document_id": None,
            "latest_approved_version_id": None,
            "status": "not_generated",
            "generated_at": None,
            "intake_context": _intake_context(opportunity),
            "pages": [_waiting_page(*spec) for spec in PAGE_SPECS],
        }
    )


def build_discovery_paper(
    opportunity: dict[str, Any],
    *,
    research: dict[str, Any] | None = None,
    company_grounding: dict[str, Any] | None = None,
    document_id: str | None = None,
    generated_at: str | None = None,
    complete: CompleteFn | None = None,
) -> dict[str, Any]:
    """Fill the seven pages from the saved opportunity. Does not write the row."""
    holder: dict[str, Any] = {}

    def persist(paper: dict[str, Any]) -> None:
        holder["paper"] = paper

    generate_discovery_paper_progressively(
        opportunity,
        persist=persist,
        research=research,
        company_grounding=company_grounding,
        document_id=document_id,
        generated_at=generated_at,
        complete=complete,
    )
    return holder["paper"]


def generate_discovery_paper_progressively(
    opportunity: dict[str, Any],
    *,
    persist: PersistFn,
    research: dict[str, Any] | None = None,
    company_grounding: dict[str, Any] | None = None,
    research_factory: Callable[[], dict[str, Any]] | None = None,
    grounding_factory: Callable[[], dict[str, Any]] | None = None,
    document_id: str | None = None,
    generated_at: str | None = None,
    complete: CompleteFn | None = None,
    render: RenderFn | None = None,
) -> dict[str, Any]:
    """Persist waiting, then each page as generating and ready. Keep earlier pages on failure."""
    context = _intake_context(opportunity)
    state: dict[str, Any] = {
        "research": research,
        "grounding": company_grounding,
        "research_factory": research_factory,
        "grounding_factory": grounding_factory,
        "next_steps": None,
    }
    paper = {
        "schema_version": "1.0",
        "opportunity_id": str(opportunity["id"]),
        "document_id": document_id or str(uuid4()),
        "latest_approved_version_id": None,
        "status": "generating",
        "generated_at": generated_at or datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "intake_context": context,
        "pages": [_waiting_page(*spec) for spec in PAGE_SPECS],
    }
    _emit(paper, persist)
    render_fn = render or render_page
    for index, (key, _order, _title) in enumerate(PAGE_SPECS):
        paper["pages"][index]["status"] = "generating"
        paper["pages"][index]["content"] = None
        paper["status"] = "generating"
        _emit(paper, persist)
        try:
            content = render_fn(
                key,
                opportunity=opportunity,
                context=context,
                state=state,
                complete=complete,
            )
        except Exception as exc:
            paper["pages"][index]["status"] = "failed"
            paper["pages"][index]["content"] = None
            paper["status"] = "failed"
            _emit(paper, persist)
            raise DiscoveryPaperPageError(key, f"Discovery Paper page {key} failed") from exc
        paper["pages"][index]["status"] = "ready"
        paper["pages"][index]["content"] = content
        if all(page["status"] == "ready" for page in paper["pages"]):
            paper["status"] = "ready"
        _emit(paper, persist)
    return paper


def render_page(
    key: str,
    *,
    opportunity: dict[str, Any],
    context: dict[str, Any],
    state: dict[str, Any],
    complete: CompleteFn | None,
) -> dict[str, Any]:
    if key == "cover":
        return _cover(context)
    if key == "client_context":
        return _client_context(context, _research(opportunity, state))
    if key == "opportunity":
        return _opportunity(context)
    if key == "borek_approach":
        return _grounded(_lookup(_grounding(opportunity, state), "service"))
    if key == "relevant_use_case":
        return _grounded(_lookup(_grounding(opportunity, state), "reference"))
    if key == "pilot_proposal":
        concept, steps = _pilot_and_steps(context, complete)
        state["next_steps"] = steps
        return {
            "concept": concept,
            "commercial_terms": "not_included",
            "origin": "GROUNDED_TEMPLATE",
        }
    if key == "next_steps":
        steps = state.get("next_steps")
        if not isinstance(steps, list):
            _concept, steps = _pilot_and_steps(context, complete)
            state["next_steps"] = steps
        return {"items": steps}
    raise KeyError(key)


def _emit(paper: dict[str, Any], persist: PersistFn) -> None:
    validate_discovery_paper(paper)
    persist(copy.deepcopy(paper))


def _research(opportunity: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    if state.get("research") is None:
        factory = state.get("research_factory")
        state["research"] = (
            factory() if factory is not None else generate_stage1_research(opportunity)
        )
    return state["research"]


def _grounding(opportunity: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    if state.get("grounding") is None:
        factory = state.get("grounding_factory")
        if factory is not None:
            state["grounding"] = factory()
        else:
            purpose = resolve_meeting_purpose(opportunity)
            state["grounding"] = ground_company_facts(
                purpose or str(opportunity.get("client_name") or "")
            )
    return state["grounding"]


def _pilot_and_steps(
    context: dict[str, Any],
    complete: CompleteFn | None,
) -> tuple[str, list[dict[str, Any]]]:
    concept = _pilot_concept(context)
    steps = _next_steps(context)
    if complete is None:
        return concept, steps
    return _narrate(context, concept, steps, complete)


def _intake_context(opportunity: dict[str, Any]) -> dict[str, Any]:
    raw = opportunity.get("stage1_intake")
    nested = raw if isinstance(raw, dict) else {}
    source = meeting_purpose_source(opportunity) or "unavailable"
    additional = str(nested.get("about_company") or "").strip()
    contact = str(nested.get("poc_name") or "").strip()
    website = str(nested.get("client_web_page") or "").strip()
    return {
        "client_name": str(opportunity.get("client_name") or "").strip(),
        "contact_name": contact or None,
        "website_url": website or None,
        "meeting_purpose": resolve_meeting_purpose(opportunity),
        "meeting_purpose_source": source,
        "additional_information": additional or None,
    }


def _waiting_page(key: str, order: int, title: str) -> dict[str, Any]:
    return {"key": key, "order": order, "title": title, "status": "waiting", "content": None}


def _cover(context: dict[str, Any]) -> dict[str, Any]:
    return {
        "client_name": context["client_name"],
        "document_title": "Discovery Paper",
        "meeting_purpose": context["meeting_purpose"],
        "contact_name": context["contact_name"],
        "website_url": context["website_url"],
        "origin": "USER_INPUT",
    }


def _client_context(context: dict[str, Any], research: dict[str, Any]) -> dict[str, Any]:
    known: list[dict[str, str]] = []
    if context["client_name"]:
        known.append(
            {"label": "Company Name", "value": context["client_name"], "origin": "USER_INPUT"}
        )
    if context["contact_name"]:
        known.append(
            {"label": "Contact Person", "value": context["contact_name"], "origin": "USER_INPUT"}
        )
    if context["website_url"]:
        known.append(
            {"label": "Website URL", "value": context["website_url"], "origin": "USER_INPUT"}
        )
    if context["additional_information"]:
        known.append(
            {
                "label": "Additional Information",
                "value": context["additional_information"],
                "origin": "USER_INPUT",
            }
        )
    unknowns: list[str] = []
    facts = (research or {}).get("company_facts") or {}
    for field in RESEARCH_FACT_FIELDS:
        fact = facts.get(field) or {}
        if fact.get("status") == "verified" and fact.get("value"):
            known.append(
                {
                    "label": field.replace("_", " "),
                    "value": str(fact["value"]),
                    "origin": "SOURCE_FACT",
                }
            )
        else:
            unknowns.append(field)
    summary = (
        "Client context uses only stored intake and verified research. "
        "Unknown company facts are listed and not filled in."
    )
    return {
        "summary": summary,
        "known_facts": known,
        "unknowns": unknowns,
        "additional_information": context["additional_information"],
    }


def _opportunity(context: dict[str, Any]) -> dict[str, Any]:
    purpose = context["meeting_purpose"]
    if purpose:
        statement = f"Meeting purpose: {purpose}"
    else:
        statement = "No meeting purpose is stored for this opportunity."
    if context["additional_information"]:
        statement += f" Additional information: {context['additional_information']}"
    return {
        "meeting_purpose": purpose,
        "meeting_purpose_source": context["meeting_purpose_source"],
        "statement": statement,
        "origin": "USER_INPUT",
    }


def _lookup(grounding: dict[str, Any] | None, kind: str) -> dict[str, Any] | None:
    for item in (grounding or {}).get("lookups") or []:
        if item.get("kind") == kind:
            return item
    return None


def _grounded(lookup: dict[str, Any] | None) -> dict[str, Any]:
    if not lookup or lookup.get("status") != "answered" or not str(lookup.get("statement") or "").strip():
        return {
            "availability": "unknown",
            "title": None,
            "statement": None,
            "origin": "UNKNOWN",
            "source_refs": [],
        }
    refs = []
    statement = str(lookup["statement"]).strip()
    for source in lookup.get("sources") or []:
        if not isinstance(source, dict):
            continue
        fact_id = str(source.get("fact_id") or "").strip()
        corpus_version = str(source.get("corpus_version") or "").strip()
        document_id = str(source.get("document_id") or "").strip()
        if fact_id and corpus_version and document_id:
            refs.append(
                {
                    "source_id": fact_id,
                    "locator": f"{corpus_version}/{document_id}",
                    "excerpt": statement,
                }
            )
    if not refs:
        return {
            "availability": "unknown",
            "title": None,
            "statement": None,
            "origin": "UNKNOWN",
            "source_refs": [],
        }
    return {
        "availability": "grounded",
        "title": statement,
        "statement": statement,
        "origin": "SOURCE_FACT",
        "source_refs": refs,
    }


def _pilot_concept(context: dict[str, Any]) -> str:
    subject = context["meeting_purpose"] or "the stored opportunity"
    client = context["client_name"] or "the client"
    return (
        f"A discovery pilot would explore {subject} with {client}. "
        "Duration and commercial terms are not included."
    )


def _next_steps(context: dict[str, Any]) -> list[dict[str, Any]]:
    purpose = context["meeting_purpose"] or "the stored meeting purpose"
    contact = context["contact_name"] or "the client contact"
    return [
        {
            "order": 1,
            "label": f"Confirm {purpose} with {contact} before the first meeting.",
            "origin": "GROUNDED_TEMPLATE",
        },
        {
            "order": 2,
            "label": "Review only company facts that are marked verified.",
            "origin": "GROUNDED_TEMPLATE",
        },
        {
            "order": 3,
            "label": "Use the first meeting to collect missing context. This paper is not a commitment.",
            "origin": "GROUNDED_TEMPLATE",
        },
    ]


def _narrate(
    context: dict[str, Any],
    pilot_concept: str,
    next_steps: list[dict[str, Any]],
    complete: CompleteFn,
) -> tuple[str, list[dict[str, Any]]]:
    schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["pilot_concept", "next_step_labels"],
        "properties": {
            "pilot_concept": {"type": "string", "minLength": 1},
            "next_step_labels": {
                "type": "array",
                "minItems": 3,
                "maxItems": 3,
                "items": {"type": "string", "minLength": 1},
            },
        },
    }
    allowed = " ".join(
        part
        for part in (
            context["client_name"],
            context["contact_name"],
            context["meeting_purpose"],
            context["additional_information"],
            pilot_concept,
        )
        if part
    )
    try:
        output = complete(
            "Rewrite only the pilot concept and three next steps. Do not add prices, "
            "rates, headcount, or concretisation. Use only the supplied client context.",
            allowed,
            schema,
        )
    except Exception:
        return pilot_concept, next_steps
    concept = str(output.get("pilot_concept") or "").strip()
    labels = output.get("next_step_labels")
    if (
        not concept
        or not isinstance(labels, list)
        or len(labels) != 3
        or _COMMERCIAL_RE.search(concept + " " + " ".join(str(item) for item in labels))
        or (context["meeting_purpose"] and context["meeting_purpose"] not in concept)
    ):
        return pilot_concept, next_steps
    return concept, [
        {"order": index + 1, "label": str(label).strip(), "origin": "GROUNDED_TEMPLATE"}
        for index, label in enumerate(labels)
        if str(label).strip()
    ] if all(str(label).strip() for label in labels) else next_steps
