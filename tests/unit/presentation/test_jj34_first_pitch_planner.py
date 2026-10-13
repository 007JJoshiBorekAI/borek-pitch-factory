"""JJ-34 planner and slide-content rules for approved Discovery."""

from __future__ import annotations

import copy

import pytest

from services.presentation.discovery_slide_content import build_discovery_slide_specs
from services.presentation.first_pitch import (
    deterministic_discovery_plan,
    plan_first_pitch_from_discovery,
    planning_input_from_approved_paper,
)
from services.presentation.planner import PresentationPlanValidationError
from services.presentation.ppt1_constraints import (
    Ppt1CommercialContentError,
    is_ppt1_commercial_text,
    reject_ppt1_slide_content,
)


def _version(client_name: str = "Northwind") -> dict:
    pages = []
    for order, key in enumerate(
        (
            "cover",
            "client_context",
            "opportunity",
            "borek_approach",
            "relevant_use_case",
            "pilot_proposal",
            "next_steps",
        ),
        start=1,
    ):
        content = {"note": f"{key} for {client_name}"}
        if key == "cover":
            content = {
                "client_name": client_name,
                "document_title": "Discovery Paper",
                "meeting_purpose": "Warehouse slotting review",
            }
        pages.append(
            {
                "key": key,
                "order": order,
                "title": key.replace("_", " ").title(),
                "content": content,
            }
        )
    return {
        "id": "11111111-1111-4111-8111-111111111111",
        "document_id": "22222222-2222-4222-8222-222222222222",
        "status": "approved",
        "paper_json": {"document_id": "22222222-2222-4222-8222-222222222222", "pages": pages},
    }


class _ScriptedPlanner:
    def __init__(self, plans: list[dict]) -> None:
        self.plans = list(plans)
        self.inputs: list[dict] = []

    def complete_planning(self, *, planning_input, prompt_version, retry_count) -> dict:
        _ = (prompt_version, retry_count)
        self.inputs.append(copy.deepcopy(planning_input))
        return copy.deepcopy(self.plans.pop(0))


def test_planner_receives_the_approved_discovery_body() -> None:
    source = planning_input_from_approved_paper(_version("Northwind"))
    planner = _ScriptedPlanner([deterministic_discovery_plan(source)])
    plan = plan_first_pitch_from_discovery(source, planner=planner)
    seen = planner.inputs[0]["approvedDiscovery"]
    assert seen["source_kind"] == "approved_discovery"
    assert seen["pages"][0]["content"]["client_name"] == "Northwind"
    assert [page["key"] for page in seen["pages"]] == [
        "cover",
        "client_context",
        "opportunity",
        "borek_approach",
        "relevant_use_case",
        "pilot_proposal",
        "next_steps",
    ]
    assert seen["constraints"] == {"max_slides": 8, "commercial_content": "deny"}
    dumped = plan.model_dump(mode="json")
    assert len(dumped["slides"]) == 7
    assert dumped["slides"][0]["frameworkReferences"] == ["discovery.cover"]
    assert "chapter_" not in dumped["slides"][0]["frameworkReferences"][0]


def test_plan_over_eight_slides_is_retried_then_accepted() -> None:
    source = planning_input_from_approved_paper(_version())
    too_long = deterministic_discovery_plan(source)
    extra = copy.deepcopy(too_long["slides"][0])
    extra["layoutId"] = "OPEN_QUESTIONS_01"
    extra["frameworkReferences"] = ["discovery.opportunity"]
    too_long["slides"].append(extra)
    too_long["slides"].append({**copy.deepcopy(extra), "layoutId": "COMPLIANCE_01"})
    for index, slide in enumerate(too_long["slides"], start=1):
        slide["order"] = index
    assert len(too_long["slides"]) == 9
    valid = deterministic_discovery_plan(source)
    planner = _ScriptedPlanner([too_long, valid])
    plan = plan_first_pitch_from_discovery(source, planner=planner)
    assert len(planner.inputs) == 2
    assert "maximum is 8" in planner.inputs[1]["retryValidationErrors"]["message"]
    assert len(plan.model_dump(mode="json")["slides"]) == 7


def test_plan_stays_invalid_after_retries() -> None:
    source = planning_input_from_approved_paper(_version())
    too_long = deterministic_discovery_plan(source)
    while len(too_long["slides"]) < 9:
        slide = copy.deepcopy(too_long["slides"][-1])
        slide["layoutId"] = "COMPLIANCE_01" if len(too_long["slides"]) == 7 else "OPEN_QUESTIONS_01"
        too_long["slides"].append(slide)
    for index, slide in enumerate(too_long["slides"], start=1):
        slide["order"] = index
    planner = _ScriptedPlanner([copy.deepcopy(too_long) for _ in range(3)])
    with pytest.raises(PresentationPlanValidationError):
        plan_first_pitch_from_discovery(source, planner=planner)
    assert len(planner.inputs) == 3


def test_budget_approved_is_not_commercial_but_currency_is() -> None:
    assert is_ppt1_commercial_text("budget approved") is False
    assert is_ppt1_commercial_text("The price is EUR 500") is True
    source = planning_input_from_approved_paper(_version())
    pages = source["pages"]
    pages[2]["content"] = {"note": "budget approved"}
    specs = build_discovery_slide_specs(deterministic_discovery_plan(source), pages)
    blob = str(specs)
    assert "budget approved" in blob
    assert "EUR" not in blob
    priced = copy.deepcopy(specs)
    priced[0]["title"] = "Offer EUR 500"
    with pytest.raises(Ppt1CommercialContentError):
        reject_ppt1_slide_content(priced)


def test_discovery_content_uses_page_text_not_a_framework() -> None:
    source = planning_input_from_approved_paper(_version("Harbor Mills"))
    specs = build_discovery_slide_specs(deterministic_discovery_plan(source), source["pages"])
    assert specs[0]["title"] == "Harbor Mills"
    assert specs[0]["sourceChapterIds"] == ["discovery.cover"]
    assert specs[1]["problem"]["description"] == "client_context for Harbor Mills"
    assert "framework" not in specs[0]["sourceChapterIds"][0]
