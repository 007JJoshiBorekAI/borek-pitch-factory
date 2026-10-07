"""Staged generation of the AI Opportunity Analysis, persisted after every stage."""

from __future__ import annotations

import copy
from datetime import UTC, datetime
from typing import Any, Callable
from uuid import uuid4

from services.framework.discovery_analysis import live
from services.framework.discovery_analysis.brief import build_presentation_brief
from services.framework.discovery_analysis.fixture import build_fixture_analysis, load_library
from services.framework.discovery_analysis.layout import build_page_manifest
from services.framework.discovery_analysis.model import (
    SCHEMA_VERSION,
    DiscoveryAnalysisError,
    content_problems,
    default_optional_parts,
    initial_stages,
    intake_context,
    specificity,
    validate_discovery_analysis,
)

PersistFn = Callable[[dict[str, Any]], None]


class DiscoveryAnalysisStageError(RuntimeError):
    """A stage failed; the paper was persisted with that stage and the status marked failed."""

    def __init__(self, stage_key: str, message: str) -> None:
        self.stage_key = stage_key
        super().__init__(message)


def finalize(paper: dict[str, Any]) -> dict[str, Any]:
    """Derive the page manifest and the presentation brief from the content, then validate."""
    paper["presentation_brief"] = build_presentation_brief(paper)
    paper["page_manifest"] = build_page_manifest(paper)
    return validate_discovery_analysis(paper)


def generate_discovery_analysis(
    opportunity: dict[str, Any],
    *,
    persist: PersistFn,
    complete: live.CompleteFn | None = None,
    research_provider: Any = None,
    optional_parts: dict[str, bool] | None = None,
    latest_approved_version_id: str | None = None,
    document_id: str | None = None,
    generated_at: str | None = None,
) -> dict[str, Any]:
    """Fixture mode when ``complete`` is None, otherwise one model call per stage.

    Sparse or empty input never blocks generation: the analysis becomes less specific and
    says so, and unknown company facts stay unknown.
    """
    context = intake_context(opportunity)
    requested = {**default_optional_parts(), **(optional_parts or {})}
    if complete is None:
        # The library holds no role or system knowledge, so fixture mode cannot write parts 5-6.
        requested = default_optional_parts()
    paper: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "opportunity_id": str(opportunity["id"]),
        "document_id": document_id or str(uuid4()),
        "latest_approved_version_id": latest_approved_version_id,
        "status": "generating",
        "generated_at": generated_at or datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "language": "en",
        "intake_context": context,
        "generation": {
            "mode": "fixture" if complete is None else "live",
            "specificity": specificity(context),
            "research_mode": "user_context_only",
            "optional_parts": requested,
            "stages": initial_stages(requested),
        },
        "analysis": None,
        "presentation_brief": None,
        "page_manifest": [],
    }
    persist(copy.deepcopy(paper))
    # Both modes start from the same skeleton: user-provided facts, unknowns, benchmark framing.
    draft = build_fixture_analysis(context, requested)

    def research() -> None:
        _apply_research(paper, draft, context, research_provider)
        if complete is not None:
            live.research_stage(complete, context, draft)

    def validation() -> None:
        if complete is not None:
            _settle_live(draft)
        problems = content_problems({**paper, "analysis": draft, "status": "ready"})
        if problems:
            raise DiscoveryAnalysisError("; ".join(problems))
        paper["analysis"] = draft

    def layout() -> None:
        paper["presentation_brief"] = build_presentation_brief(paper)
        paper["page_manifest"] = build_page_manifest(paper)

    live_steps: dict[str, Callable[[], None]] = (
        {}
        if complete is None
        else {
            "overview": lambda: live.overview_stage(complete, context, draft),
            "deep_dives": lambda: live.deep_dives_stage(complete, context, draft),
            "shadow_processes": lambda: live.shadow_stage(complete, context, draft),
            "target_picture": lambda: live.target_stage(complete, context, draft),
            "optional_parts": lambda: live.optional_stage(complete, context, draft, requested),
            "closing": lambda: live.closing_stage(complete, context, draft),
        }
    )
    steps = {"research": research, "validation": validation, "layout": layout, **live_steps}
    for stage in paper["generation"]["stages"]:
        if stage["status"] == "skipped":
            continue
        stage["status"] = "generating"
        persist(copy.deepcopy(paper))
        try:
            steps.get(stage["key"], lambda: None)()
        except Exception as exc:
            stage["status"] = "failed"
            paper["status"] = "failed"
            paper["analysis"] = None
            paper["presentation_brief"] = None
            paper["page_manifest"] = []
            persist(copy.deepcopy(paper))
            raise DiscoveryAnalysisStageError(stage["key"], f"{stage['label']} failed: {exc}") from exc
        stage["status"] = "ready"
        if stage["key"] == "layout":
            paper["status"] = "ready"
            validate_discovery_analysis(paper)
        persist(copy.deepcopy(paper))
    return paper


def _apply_research(paper: dict[str, Any], draft: dict[str, Any], context: dict[str, Any], provider: Any) -> None:
    """Cited evidence from an approved research provider, if one exists. Otherwise nothing:
    researched fields stay unknown and the analysis says that no research was performed."""
    if provider is None or not context["client_name"]:
        return
    evidence = provider.research(client_name=context["client_name"], client_web_page=context["website_url"])
    if not evidence:
        return
    research = draft["research"]
    sources = []
    for item in evidence:
        ref = {"source_id": item.source_id, "locator": item.locator, "excerpt": item.excerpt}
        sources.append(ref)
        research["known_facts"].append(
            {"label": item.field.replace("_", " ").capitalize(), "value": item.value, "origin": "SOURCE_FACT", "source_refs": [ref]}
        )
    research["web_research"] = {"performed": True, "note": f"Company research returned {len(evidence)} cited facts."}
    draft["provenance"]["sources"] = sources
    draft["provenance"]["customer_facts_origin"] = "user_input_and_cited_research"
    paper["generation"]["research_mode"] = "provider"


def _settle_live(draft: dict[str, Any]) -> None:
    """Make model output structurally safe: unique ids and count-based texts that match."""
    seen: set[str] = set()
    for group in (draft["areas"], [item for area in draft["areas"] for item in area["opportunities"]], draft["shadow_processes"], draft["target_workflows"]):
        for item in group:
            base, candidate, suffix = item["id"], item["id"], 2
            while candidate in seen:
                candidate = f"{base[:60]}_{suffix}"
                suffix += 1
            item["id"] = candidate
            seen.add(candidate)
    for area in draft["areas"]:
        area.pop("_titles", None)
    library = load_library()
    counts = {
        "area_count": len(draft["areas"]),
        "opportunity_count": sum(len(area["opportunities"]) for area in draft["areas"]),
    }
    document = draft["framing"]["document"]
    document["subtitle"] = library["cover"]["subtitle"].format(**counts)
    document["in_short"][0] = library["in_short"]["first_statement"].format(**counts)
    draft["framing"]["leads"]["map"] = library["chapters"]["overview"]["map_lead"].format(count=counts["opportunity_count"])
    draft["provenance"]["content_origin"] = "live_model"
    draft["provenance"]["notes"] = [
        "Opportunities, shadow processes and workflow chains were written by the model from the user's context; they are hypotheses, not findings about this company.",
        library["research"]["notes"][1],
    ]
