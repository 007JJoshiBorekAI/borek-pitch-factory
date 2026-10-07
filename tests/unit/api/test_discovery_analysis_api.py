"""Discovery v2 over the API: generation, approval semantics, v1 compatibility, presentation hand-off."""

from __future__ import annotations

import copy
import json
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.auth import create_test_access_token
from app.config import settings
from app.main import create_app
from app.services.data.memory_store import get_memory_store, reset_memory_store
from services.framework.discovery_paper import build_discovery_paper
from services.presentation.borek_deck import fixture as deck_fixture
from services.presentation.borek_deck import sources as deck_sources
from services.presentation.discovery_brief_adapter import BRIEF_SECTION_KEYS
from services.presentation.first_pitch import planning_input_from_approved_paper
from services.presentation.ppt1_constraints import DISCOVERY_PAGE_KEYS

OWNER = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
POPULATED = {
    "client_name": "Nordwind Maschinenbau",
    "opportunity_name": "AI introduction",
    "department": "Sales",
    "stage1_intake": {
        "client_web_page": "https://nordwind.example",
        "poc_name": "Dana Weber",
        "sales_topic_description": "Reduce quote turnaround and invoice handling effort",
        "about_company": "Family-owned machine builder with 420 employees.",
    },
}


def headers() -> dict[str, str]:
    token = create_test_access_token(user_id=OWNER, email="sales@example.com", secret=settings.SUPABASE_JWT_SECRET)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def client() -> TestClient:
    reset_memory_store()
    return TestClient(create_app())


def create(client: TestClient, body: dict) -> str:
    response = client.post("/opportunities", headers=headers(), json=body)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def url(opportunity_id: str, suffix: str = "") -> str:
    return f"/opportunities/{opportunity_id}/discovery-paper{suffix}"


def generate(client: TestClient, opportunity_id: str) -> dict:
    response = client.post(url(opportunity_id, "/generate"), headers=headers())
    assert response.status_code == 200, response.text
    return response.json()


def approve(client: TestClient, opportunity_id: str) -> dict:
    response = client.post(url(opportunity_id, "/approve"), headers=headers())
    assert response.status_code == 200, response.text
    return response.json()


def version(client: TestClient, opportunity_id: str, version_id: str) -> dict:
    response = client.get(url(opportunity_id, f"/versions/{version_id}"), headers=headers())
    assert response.status_code == 200, response.text
    return response.json()


def edit_title(client: TestClient, opportunity_id: str, title: str) -> dict:
    response = client.patch(
        url(opportunity_id),
        headers=headers(),
        json={"edits": [{"target": "framing", "value": {"document": {"title": title}}}]},
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_blank_and_populated_clients_generate_dynamic_page_counts(client: TestClient) -> None:
    blank = generate(client, create(client, {"department": "Sales"}))
    populated = generate(client, create(client, POPULATED))
    for paper in (blank, populated):
        assert paper["schema_version"] == "2.0"
        assert paper["status"] == "ready"
        assert paper["generation"]["mode"] == "fixture"
        assert len(paper["page_manifest"]) > 7
        assert {page["type"] for page in paper["page_manifest"]} <= {f"M{n}" for n in range(1, 10)}
        assert paper["analysis"]["optional_deep_dives"] == {
            "roles_employees": None,
            "decision_map": None,
            "system_interfaces": None,
        }
    assert blank["generation"]["specificity"] == "generic"
    assert blank["page_manifest"][0]["content"]["title"] == "AI opportunity analysis"
    assert populated["generation"]["specificity"] == "company"
    assert populated["page_manifest"][0]["content"]["title"] == "AI opportunities for Nordwind Maschinenbau"
    assert populated["analysis"]["areas"][0]["id"] == "sales_quoting"


def test_approval_binds_the_exact_version_and_never_changes_afterwards(client: TestClient) -> None:
    opportunity_id = create(client, POPULATED)
    first = generate(client, opportunity_id)
    edited = edit_title(client, opportunity_id, "Approved title")
    approved = approve(client, opportunity_id)
    assert approved["status"] == "approved"
    assert approved["document_id"] == first["document_id"]
    snapshot = copy.deepcopy(version(client, opportunity_id, approved["id"])["paper_json"])
    # The approved version is exactly the reviewed content, pages and brief included.
    assert snapshot == {**edited, "latest_approved_version_id": approved["id"]}
    assert snapshot["page_manifest"][0]["content"]["title"] == "Approved title"
    assert snapshot["presentation_brief"]["document_title"] == "Approved title"

    # A later edit lands in a new draft; a regeneration creates a new document.
    draft = edit_title(client, opportunity_id, "Draft title")
    assert draft["latest_approved_version_id"] == approved["id"]
    regenerated = generate(client, opportunity_id)
    assert regenerated["document_id"] != first["document_id"]
    assert regenerated["latest_approved_version_id"] == approved["id"]
    assert regenerated["analysis"]["framing"]["document"]["title"] == "AI opportunities for Nordwind Maschinenbau"
    assert version(client, opportunity_id, approved["id"])["paper_json"] == snapshot
    rows = client.get(url(opportunity_id, "/versions"), headers=headers()).json()["versions"]
    assert [(row["version_number"], row["status"]) for row in rows] == [(1, "approved"), (2, "draft"), (3, "draft")]
    latest = client.get(url(opportunity_id, "/approved"), headers=headers()).json()
    assert (latest["id"], latest["paper_json"]) == (approved["id"], snapshot)
    with pytest.raises(Exception, match="immutable"):
        get_memory_store().update_discovery_paper_draft(
            version_id=UUID(approved["id"]), user_id=OWNER, paper_json=regenerated
        )

    # Approving again binds the regenerated document, and the first approval stays as it was.
    second = approve(client, opportunity_id)
    assert second["id"] != approved["id"]
    assert second["document_id"] == regenerated["document_id"]
    assert version(client, opportunity_id, approved["id"])["paper_json"] == snapshot


def test_presentation_path_reads_the_brief_not_the_printed_pages(client: TestClient) -> None:
    opportunity_id = create(client, POPULATED)
    paper = generate(client, opportunity_id)
    approved = approve(client, opportunity_id)
    row = get_memory_store().get_discovery_paper_version(version_id=UUID(approved["id"]), user_id=OWNER)
    source = planning_input_from_approved_paper(row)
    assert source["source_kind"] == "approved_discovery"
    assert source["approved_discovery_version_id"] == approved["id"]
    assert [page["key"] for page in source["pages"]] == list(BRIEF_SECTION_KEYS)
    assert len(source["pages"]) == 4 < len(paper["page_manifest"])
    blob = json.dumps(source, ensure_ascii=False)
    brief = paper["presentation_brief"]
    assert brief["core_thesis"] in blob
    assert all(item["title"] in blob for item in brief["priority_opportunities"])
    assert all(signal in blob for signal in brief["opportunity_signals"])
    assert brief["target_picture_summary"]["statement"] in blob
    assert "page_manifest" not in blob and "discovery_questions" not in blob

    deck = deck_fixture.deterministic_pre_meeting_deck(source)
    assert len(deck["slides"]) <= 8 < len(paper["page_manifest"])
    assert [slide["layout"] for slide in deck["slides"]] == ["cover", "who_we_are", "contrast", "pillars", "closing"]
    assert "Nordwind Maschinenbau" in deck["slides"][0]["title"]
    allowed = deck_sources.pre_meeting_allowed_references(source)
    assert allowed == {f"discovery.{key}" for key in BRIEF_SECTION_KEYS}
    assert all(set(slide.get("sources", [])) <= allowed for slide in deck["slides"])

    # The real gate: PPT #1 is generated from the approved analysis.
    outputs = client.post(f"/opportunities/{opportunity_id}/stage1-outputs/generate", headers=headers())
    assert outputs.status_code == 200, outputs.text
    presentation = outputs.json()["outputs"]["presentation"]
    assert presentation["status"] == "ready"
    plan = next(iter(get_memory_store().presentation_plans.values()))["plan_json"]
    assert 1 <= len(plan["slides"]) <= 8


def test_presentation_gate_still_requires_an_approved_analysis(client: TestClient) -> None:
    opportunity_id = create(client, POPULATED)
    generate(client, opportunity_id)
    blocked = client.post(f"/opportunities/{opportunity_id}/stage1-outputs/generate", headers=headers())
    assert blocked.status_code == 400
    assert blocked.json()["error"]["code"] == "DISCOVERY_PAPER_APPROVAL_REQUIRED"


def seed_v1(client: TestClient) -> tuple[str, dict]:
    """A paper stored before the rewrite: schema 1.0 with seven fixed pages."""
    opportunity_id = create(client, POPULATED)
    store = get_memory_store()
    opportunity = store.get_opportunity(opportunity_id=UUID(opportunity_id), user_id=OWNER)
    paper = build_discovery_paper(opportunity, generated_at="2026-09-01T08:00:00Z")
    store.update_opportunity(opportunity_id=UUID(opportunity_id), user_id=OWNER, updates={"discovery_paper": paper})
    store.create_discovery_paper_version(
        opportunity_id=UUID(opportunity_id), user_id=OWNER, document_id=UUID(paper["document_id"]), paper_json=paper
    )
    return opportunity_id, paper


def test_stored_v1_paper_stays_readable_editable_and_approvable(client: TestClient) -> None:
    opportunity_id, paper = seed_v1(client)
    read = client.get(url(opportunity_id), headers=headers()).json()
    assert read == paper
    assert read["schema_version"] == "1.0" and len(read["pages"]) == 7

    cover = copy.deepcopy(read["pages"][0]["content"])
    cover["client_name"] = "Edited v1 name"
    edited = client.patch(url(opportunity_id), headers=headers(), json={"pages": [{"key": "cover", "content": cover}]})
    assert edited.status_code == 200, edited.text
    assert edited.json()["pages"][0]["content"]["client_name"] == "Edited v1 name"
    section_edit = client.patch(
        url(opportunity_id), headers=headers(), json={"edits": [{"target": "closing", "value": {"headline": "x"}}]}
    )
    assert section_edit.status_code == 400
    assert section_edit.json()["error"]["code"] == "DISCOVERY_PAPER_INVALID"

    approved = approve(client, opportunity_id)
    snapshot = copy.deepcopy(version(client, opportunity_id, approved["id"])["paper_json"])
    assert snapshot["schema_version"] == "1.0"
    row = get_memory_store().get_discovery_paper_version(version_id=UUID(approved["id"]), user_id=OWNER)
    source = planning_input_from_approved_paper(row)
    assert [page["key"] for page in source["pages"]] == list(DISCOVERY_PAGE_KEYS)
    outputs = client.post(f"/opportunities/{opportunity_id}/stage1-outputs/generate", headers=headers())
    assert outputs.status_code == 200, outputs.text

    # Regenerating produces a v2 analysis next to it; the approved v1 version is untouched.
    regenerated = generate(client, opportunity_id)
    assert regenerated["schema_version"] == "2.0"
    assert regenerated["latest_approved_version_id"] == approved["id"]
    assert version(client, opportunity_id, approved["id"])["paper_json"] == snapshot
    assert client.get(url(opportunity_id, "/approved"), headers=headers()).json()["paper_json"] == snapshot


def test_optional_parts_can_be_requested_and_stay_off_in_fixture_mode(client: TestClient) -> None:
    opportunity_id = create(client, POPULATED)
    response = client.post(
        url(opportunity_id, "/generate"), headers=headers(), json={"roles_employees": True, "decision_map": True}
    )
    assert response.status_code == 200, response.text
    paper = response.json()
    assert paper["generation"]["optional_parts"] == {
        "roles_employees": False,
        "decision_map": False,
        "system_interfaces": False,
    }
    assert [page["id"] for page in paper["page_manifest"] if page["type"] == "M3"] == [
        "ch-overview",
        "ch-deep-dive",
        "ch-shadow",
        "ch-target",
    ]
    unknown = client.post(url(opportunity_id, "/generate"), headers=headers(), json={"part_seven": True})
    assert unknown.status_code == 422


def test_discovery_endpoints_require_authentication(client: TestClient) -> None:
    opportunity_id = create(client, POPULATED)
    assert client.get(url(opportunity_id)).status_code == 401
    assert client.post(url(opportunity_id, "/generate")).status_code == 401
    assert client.post(url(opportunity_id, "/approve")).status_code == 401
    assert client.patch(url(opportunity_id), json={"edits": [{"target": "closing", "value": {}}]}).status_code == 401
    other = create_test_access_token(
        user_id=UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"), email="other@example.com", secret=settings.SUPABASE_JWT_SECRET
    )
    foreign = client.get(url(opportunity_id), headers={"Authorization": f"Bearer {other}"})
    assert foreign.status_code in {403, 404}
