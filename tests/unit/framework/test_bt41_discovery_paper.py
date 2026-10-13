"""BT-41 Discovery Paper contract, grounding, and BT-40 intake."""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest
from jsonschema import ValidationError

from services.framework.company_facts import ground_company_facts
from services.framework.discovery_paper import (
    PAGE_SPECS,
    DiscoveryPaperPageError,
    build_discovery_paper,
    empty_discovery_paper,
    generate_discovery_paper_progressively,
    render_page,
    validate_discovery_paper,
)
from services.framework.stage1_research import CompanyEvidence

OPPORTUNITY_ID = "11111111-1111-4111-8111-111111111111"


def opportunity(**overrides):
    base = {
        "id": OPPORTUNITY_ID,
        "client_name": "Northwind",
        "opportunity_name": "Quarterly title",
        "stage1_intake": {
            "poc_name": "Ada Lovelace",
            "client_web_page": "https://northwind.example",
            "sales_topic_description": "Warehouse slotting review",
            "about_company": "Family-owned distributor in Hamburg.",
        },
    }
    base.update(overrides)
    return base


def test_empty_and_ready_papers_have_seven_ordered_pages():
    waiting = empty_discovery_paper(opportunity())
    ready = build_discovery_paper(
        opportunity(),
        document_id="22222222-2222-4222-8222-222222222222",
        generated_at="2026-10-05T08:00:00Z",
    )
    assert [page["key"] for page in waiting["pages"]] == [spec[0] for spec in PAGE_SPECS]
    assert [page["order"] for page in ready["pages"]] == list(range(1, 8))
    assert [page["status"] for page in waiting["pages"]] == ["waiting"] * 7
    assert [page["status"] for page in ready["pages"]] == ["ready"] * 7
    assert all(page["content"] is None for page in waiting["pages"])
    assert all(isinstance(page["content"], dict) for page in ready["pages"])
    assert ready["latest_approved_version_id"] is None
    assert "approved_document_id" not in ready


def test_freeform_blob_is_rejected():
    ready = build_discovery_paper(opportunity())
    blob = copy.deepcopy(ready)
    blob["pages"][2]["content"] = "A single unstructured paragraph."
    with pytest.raises(ValidationError):
        validate_discovery_paper(blob)
    with pytest.raises(ValidationError):
        validate_discovery_paper({"markdown": "not a discovery paper"})


def test_failed_page_requires_top_level_failed_and_ready_requires_every_page():
    ready = build_discovery_paper(opportunity())
    mixed = copy.deepcopy(ready)
    mixed["pages"][4]["status"] = "failed"
    mixed["pages"][4]["content"] = None
    with pytest.raises(ValueError, match="top-level status failed"):
        validate_discovery_paper(mixed)
    mixed["status"] = "failed"
    validate_discovery_paper(mixed)
    assert mixed["pages"][3]["status"] == "ready"
    assert mixed["pages"][4]["status"] == "failed"
    incomplete = copy.deepcopy(ready)
    incomplete["pages"][6]["status"] = "waiting"
    incomplete["pages"][6]["content"] = None
    with pytest.raises(ValueError, match="every page to be ready"):
        validate_discovery_paper(incomplete)


def test_checked_in_fixture_matches_the_builder():
    fixture = json.loads(
        (Path(__file__).resolve().parents[3] / "packages/contracts/fixtures/discovery_paper.ready.json").read_text(
            encoding="utf-8"
        )
    )
    validate_discovery_paper(fixture)
    assert fixture == build_discovery_paper(
        opportunity(),
        document_id="22222222-2222-4222-8222-222222222222",
        generated_at="2026-10-05T08:00:00Z",
    )


def test_fixture_generation_is_deterministic():
    kwargs = {
        "document_id": "22222222-2222-4222-8222-222222222222",
        "generated_at": "2026-10-05T08:00:00Z",
    }
    first = build_discovery_paper(opportunity(), **kwargs)
    second = build_discovery_paper(opportunity(), **kwargs)
    assert first == second


def test_intake_patch_changes_purpose_and_additional_information():
    original = opportunity()
    updated = opportunity()
    updated["stage1_intake"] = {
        **updated["stage1_intake"],
        "sales_topic_description": "Automate delivery matching",
        "about_company": "Logistics group with three warehouses.",
    }
    before = build_discovery_paper(original)
    after = build_discovery_paper(updated)
    assert before["intake_context"]["meeting_purpose"] == "Warehouse slotting review"
    assert before["intake_context"]["meeting_purpose_source"] == "sales_topic_description"
    assert before["intake_context"]["additional_information"] == "Family-owned distributor in Hamburg."
    assert after["intake_context"]["meeting_purpose"] == "Automate delivery matching"
    assert after["pages"][2]["content"]["statement"].endswith(
        "Additional information: Logistics group with three warehouses."
    )
    assert "Family-owned distributor in Hamburg." not in json.dumps(after)
    assert original["stage1_intake"]["sales_topic_description"] == "Warehouse slotting review"


def test_legacy_title_is_the_meeting_purpose_fallback_only():
    legacy = opportunity(
        opportunity_name="Legacy meeting purpose",
        stage1_intake={
            "poc_name": "Ada Lovelace",
            "about_company": "Family-owned distributor in Hamburg.",
        },
    )
    paper = build_discovery_paper(legacy)
    assert paper["intake_context"]["meeting_purpose"] == "Legacy meeting purpose"
    assert paper["intake_context"]["meeting_purpose_source"] == "opportunity_name"
    assert paper["intake_context"]["additional_information"] == "Family-owned distributor in Hamburg."
    assert "sales_topic_description" not in legacy["stage1_intake"]


def test_unknown_research_and_use_case_are_not_invented():
    paper = build_discovery_paper(opportunity())
    context = paper["pages"][1]["content"]
    assert context["unknowns"] == [
        "description",
        "headquarters",
        "employee_headcount",
        "decision_makers",
        "revenue",
    ]
    rendered = json.dumps(paper)
    assert "Berlin" not in rendered
    assert "EUR" not in rendered
    use_case = paper["pages"][4]["content"]
    assert use_case["availability"] == "unknown"
    assert use_case["title"] is None
    assert use_case["statement"] is None
    assert use_case["source_refs"] == []
    assert paper["pages"][5]["content"]["commercial_terms"] == "not_included"


def test_verified_research_is_kept_and_ungrounded_values_are_not():
    class Provider:
        def research(self, **kwargs):
            assert "poc_name" not in kwargs
            return [
                CompanyEvidence(
                    "headquarters",
                    "Hamburg",
                    "report",
                    "page:1",
                    "HQ: Hamburg",
                )
            ]

    from services.framework.stage1_research import generate_stage1_research

    research = generate_stage1_research(opportunity(), provider=Provider())
    paper = build_discovery_paper(opportunity(), research=research)
    facts = paper["pages"][1]["content"]["known_facts"]
    assert {"label": "headquarters", "value": "Hamburg", "origin": "SOURCE_FACT"} in facts
    assert "revenue" in paper["pages"][1]["content"]["unknowns"]
    assert "headquarters" not in paper["pages"][1]["content"]["unknowns"]


def test_grounded_invoice_use_case_is_copied_not_invented():
    subject = opportunity(
        stage1_intake={
            "sales_topic_description": "Invoice service reference review",
            "about_company": "Finance team.",
        }
    )
    paper = build_discovery_paper(
        subject,
        company_grounding=ground_company_facts("Invoice service reference review"),
    )
    use_case = paper["pages"][4]["content"]
    assert use_case["availability"] == "grounded"
    assert "Invoice 3-way Match" in use_case["statement"]
    assert use_case["source_refs"][0]["source_id"]
    assert "Acme" not in json.dumps(use_case)


def test_commercial_narration_is_discarded():
    def complete(system, user, schema):
        return {
            "pilot_concept": "Warehouse slotting review for EUR 1000 per day.",
            "next_step_labels": ["Sign the concretisation.", "Send the rate card.", "Book FTE."],
        }

    paper = build_discovery_paper(opportunity(), complete=complete)
    assert "EUR" not in json.dumps(paper)
    assert paper["pages"][5]["content"]["concept"].startswith("A discovery pilot would explore")


def test_safe_narration_keeps_the_meeting_purpose():
    def complete(system, user, schema):
        return {
            "pilot_concept": "A short discovery pilot for Warehouse slotting review with Northwind.",
            "next_step_labels": [
                "Confirm Warehouse slotting review.",
                "Review verified facts only.",
                "Collect missing context in the first meeting.",
            ],
        }

    paper = build_discovery_paper(opportunity(), complete=complete)
    assert paper["pages"][5]["content"]["concept"].startswith("A short discovery pilot")
    assert paper["pages"][6]["content"]["items"][0]["label"] == "Confirm Warehouse slotting review."


def test_progressive_snapshots_persist_before_the_next_page():
    saved: list[dict] = []

    def persist(paper: dict) -> None:
        saved.append(paper)

    def render(key: str, **kwargs):
        if key == "opportunity":
            saved.append({"observed": copy.deepcopy(saved[-1])})
        return render_page(key, **kwargs)

    paper = generate_discovery_paper_progressively(
        opportunity(),
        persist=persist,
        render=render,
        document_id="22222222-2222-4222-8222-222222222222",
        generated_at="2026-10-05T08:00:00Z",
    )
    snapshots = [item for item in saved if "pages" in item]
    observed = next(item["observed"] for item in saved if "observed" in item)
    initial = snapshots[0]
    assert initial["status"] == "generating"
    assert initial["document_id"] == "22222222-2222-4222-8222-222222222222"
    assert initial["generated_at"] == "2026-10-05T08:00:00Z"
    assert initial["latest_approved_version_id"] is None
    assert [page["status"] for page in initial["pages"]] == ["waiting"] * 7
    assert [page["status"] for page in observed["pages"]] == [
        "ready",
        "ready",
        "generating",
        "waiting",
        "waiting",
        "waiting",
        "waiting",
    ]
    assert observed["pages"][0]["content"]["client_name"] == "Northwind"
    assert observed["pages"][2]["content"] is None

    def first_index(predicate) -> int:
        return next(index for index, snap in enumerate(snapshots) if predicate(snap))

    for index in range(6):
        ready_at = first_index(lambda snap, index=index: snap["pages"][index]["status"] == "ready")
        next_generating = first_index(
            lambda snap, index=index: snap["pages"][index + 1]["status"] == "generating"
        )
        assert ready_at < next_generating
    assert paper["status"] == "ready"
    assert [page["status"] for page in paper["pages"]] == ["ready"] * 7
    assert snapshots[-1]["status"] == "ready"


def test_page_five_failure_keeps_earlier_ready_pages():
    saved: list[dict] = []

    def render(key: str, **kwargs):
        if key == "relevant_use_case":
            raise RuntimeError("page five failed")
        return render_page(key, **kwargs)

    with pytest.raises(DiscoveryPaperPageError, match="relevant_use_case"):
        generate_discovery_paper_progressively(opportunity(), persist=saved.append, render=render)
    final = saved[-1]
    assert final["status"] == "failed"
    assert [page["status"] for page in final["pages"]] == [
        "ready",
        "ready",
        "ready",
        "ready",
        "failed",
        "waiting",
        "waiting",
    ]
    assert final["pages"][3]["content"]["availability"] in {"grounded", "unknown"}
    assert final["pages"][4]["content"] is None
    assert final["pages"][5]["content"] is None
    assert final["latest_approved_version_id"] is None
