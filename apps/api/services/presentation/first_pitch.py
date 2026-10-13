"""PPT #1 planning input and planner entry. Not a stored intake model."""

from __future__ import annotations

import copy
from typing import Any

from services.presentation.chapter_layout_guidance import (
    prepare_chapter_layout_guidance_for_planner,
)
from services.presentation.generatable_layouts import planning_target_schema
from services.presentation.planner import (
    PROMPT_PATH,
    PlanningClient,
    PresentationPlan,
    run_planning_attempts,
)
from packages.contracts.validators import ContractValidationError
from services.presentation.discovery_brief_adapter import (
    is_opportunity_analysis,
    planner_pages_from_brief,
)
from services.presentation.ppt1_constraints import (
    DISCOVERY_PAGE_KEYS,
    PPT1_MAX_SLIDES,
    assert_ppt1_plan,
)

PAGE_LAYOUTS: dict[str, str] = {
    "cover": "COVER_01",
    "client_context": "CONTEXT_01",
    "opportunity": "PROBLEM_SOLUTION_01",
    "borek_approach": "SCOPE_01",
    "relevant_use_case": "EXECUTIVE_SUMMARY_01",
    "pilot_proposal": "MILESTONES_01",
    "next_steps": "NEXT_STEPS_01",
}

_PAGE_PURPOSE = {
    "cover": "Open the first meeting from the approved Discovery cover",
    "client_context": "Present the approved Discovery client context",
    "opportunity": "State the approved Discovery opportunity",
    "borek_approach": "Explain the approved Discovery Borek approach",
    "relevant_use_case": "Connect the approved Discovery use case",
    "pilot_proposal": "Outline the approved Discovery pilot",
    "next_steps": "Close with the approved Discovery next steps",
}

PPT1_INSTRUCTIONS = """
PPT #1 ADDITIONAL RULES
- The only content source is approvedDiscovery.pages. Do not use a FrameworkObject.
- Emit at most 8 slides. One slide per Discovery page, in the supplied page order.
- frameworkReferences must be discovery page ids: discovery.cover, discovery.client_context, discovery.opportunity, discovery.borek_approach, discovery.relevant_use_case, discovery.pilot_proposal, discovery.next_steps.
- Do not invent framework chapter ids.
- Title and purpose must not contain prices, pricing, currency amounts, ROI, or numbered cost or budget figures.
- Source phrases such as "budget approved" are not an offer. Do not copy them into the plan.
""".strip()


def planning_input_from_approved_paper(version_row: dict[str, Any]) -> dict[str, Any]:
    """Adapt one approved Discovery version into the in-memory planner input."""
    paper = version_row.get("paper_json") or {}
    by_key = {
        str(page.get("key")): page
        for page in paper.get("pages") or []
        if isinstance(page, dict)
    }
    pages: list[dict[str, Any]] = []
    if is_opportunity_analysis(paper):
        # Discovery v2 hands over its presentation brief, not its printed pages.
        pages = planner_pages_from_brief(paper)
    for order, key in enumerate(() if pages else DISCOVERY_PAGE_KEYS, start=1):
        page = by_key.get(key)
        if page is None:
            raise ValueError(f"Approved Discovery is missing page {key}")
        pages.append(
            {
                "key": key,
                "order": order,
                "title": str(page.get("title") or key),
                "content": copy.deepcopy(page.get("content")),
            }
        )
    return {
        "source_kind": "approved_discovery",
        "approved_discovery_version_id": str(version_row["id"]),
        "document_id": str(version_row.get("document_id") or paper.get("document_id") or ""),
        "pages": pages,
        "constraints": {
            "max_slides": PPT1_MAX_SLIDES,
            "commercial_content": "deny",
        },
    }


def ppt1_generation_manifest(version_id: str) -> dict[str, str]:
    """Identity of the approved Discovery version used for one PPT #1 run."""
    return {
        "schema_version": "1.0",
        "kind": "ppt1",
        "approved_discovery_version_id": str(version_id),
    }


def plan_first_pitch_from_discovery(
    approved_discovery: dict[str, Any],
    *,
    planner: PlanningClient | None = None,
) -> PresentationPlan:
    """Plan PPT #1 from an approved Discovery adapter. Does not read a framework."""
    if planner is None:
        from llm.client import LlmClient

        planner = LlmClient()
    return run_planning_attempts(
        _planner_payload(approved_discovery),
        client=planner,
        extra_validator=_validate_ppt1_plan,
        retry_validation_errors=True,
    )


def _validate_ppt1_plan(plan: dict[str, Any]) -> None:
    assert_ppt1_plan(plan)
    for slide in plan.get("slides") or []:
        reference = str((slide.get("frameworkReferences") or [""])[0])
        key = reference.removeprefix("discovery.")
        expected = PAGE_LAYOUTS.get(key)
        if expected is None or slide.get("layoutId") != expected:
            raise ContractValidationError(
                f"PPT #1 page {key} must use layout {expected}"
            )


def deterministic_discovery_plan(approved_discovery: dict[str, Any]) -> dict[str, Any]:
    """Fixture plan: one slide per approved page, in canonical order, at most 8."""
    pages = list(approved_discovery.get("pages") or [])
    ordered = sorted(pages, key=lambda page: int(page.get("order") or 0))
    slides = []
    for page in ordered[:PPT1_MAX_SLIDES]:
        key = str(page["key"])
        slides.append(
            {
                "order": len(slides) + 1,
                "purpose": _PAGE_PURPOSE[key],
                "layoutId": PAGE_LAYOUTS[key],
                "frameworkReferences": [f"discovery.{key}"],
            }
        )
    title = _title_from_pages(ordered)
    return {
        "schema_version": "1.0",
        "title": title,
        "slides": slides,
    }


def _planner_payload(approved_discovery: dict[str, Any]) -> dict[str, Any]:
    instructions = PROMPT_PATH.read_text(encoding="utf-8").rstrip() + "\n\n" + PPT1_INSTRUCTIONS
    return {
        "instructions": instructions,
        "approvedDiscovery": copy.deepcopy(approved_discovery),
        "chapterLayoutGuidance": prepare_chapter_layout_guidance_for_planner(),
        "targetSchema": planning_target_schema(),
    }


def _title_from_pages(pages: list[dict[str, Any]]) -> str:
    cover = next((page for page in pages if page.get("key") == "cover"), None)
    content = cover.get("content") if isinstance(cover, dict) else None
    client_name = ""
    if isinstance(content, dict):
        client_name = str(content.get("client_name") or "").strip()
    if client_name:
        return f"First meeting — {client_name}"
    return "First meeting"
