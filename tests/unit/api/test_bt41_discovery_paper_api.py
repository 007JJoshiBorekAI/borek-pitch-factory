"""BT-41 Discovery Paper API: persisted intake in, structured paper out."""

from __future__ import annotations

import copy
from datetime import UTC, datetime
from uuid import UUID, uuid4

import httpx
from fastapi.testclient import TestClient

from app.auth import create_test_access_token
from app.config import settings
from app.main import create_app
from app.services.data.memory_store import get_memory_store, reset_memory_store
from app.services.data.supabase_store import SupabaseDataStore
from app.services.discovery_paper import get_discovery_paper
from services.framework.discovery_analysis import pipeline as analysis_pipeline

OWNER = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")


def headers() -> dict[str, str]:
    return {
        "Authorization": "Bearer "
        + create_test_access_token(
            user_id=OWNER,
            email="sales@example.com",
            secret=settings.SUPABASE_JWT_SECRET,
        )
    }


def create_payload(**overrides: object) -> dict:
    body = {
        "client_name": "Northwind",
        "opportunity_name": "Quarterly title",
        "department": "Sales",
        "stage1_intake": {
            "client_web_page": "https://northwind.example",
            "poc_name": "Ada Lovelace",
            "sales_topic_description": "Warehouse slotting review",
            "about_company": "Family-owned distributor in Hamburg.",
        },
    }
    body.update(overrides)
    return body


def test_generate_reads_persisted_intake_after_patch() -> None:
    reset_memory_store()
    with TestClient(create_app()) as client:
        created = client.post("/opportunities", headers=headers(), json=create_payload())
        assert created.status_code == 201, created.text
        opportunity_id = created.json()["id"]
        waiting = client.get(
            f"/opportunities/{opportunity_id}/discovery-paper",
            headers=headers(),
        )
        assert waiting.status_code == 200, waiting.text
        assert waiting.json()["status"] == "not_generated"
        assert waiting.json()["schema_version"] == "2.0"
        assert waiting.json()["analysis"] is None
        assert waiting.json()["page_manifest"] == []
        assert {stage["status"] for stage in waiting.json()["generation"]["stages"]} == {"waiting", "skipped"}

        discarded = copy.deepcopy(create_payload())
        discarded["stage1_intake"]["sales_topic_description"] = "SHOULD NOT APPEAR"
        patched = client.patch(
            f"/opportunities/{opportunity_id}",
            headers=headers(),
            json={
                "client_name": "Contoso",
                "opportunity_name": "Retitled opportunity",
                "stage1_intake": {
                    "client_web_page": "https://contoso.example",
                    "poc_name": "Grace Hopper",
                    "sales_topic_description": "Automate delivery matching",
                    "about_company": "Logistics group with three warehouses.",
                },
            },
        )
        assert patched.status_code == 200, patched.text
        generated = client.post(
            f"/opportunities/{opportunity_id}/discovery-paper/generate",
            headers=headers(),
        )
        assert generated.status_code == 200, generated.text
        paper = generated.json()
        assert paper["status"] == "ready"
        assert paper["latest_approved_version_id"] is None
        assert "approved_document_id" not in paper
        assert "pages" not in paper
        assert len(paper["page_manifest"]) > 7
        assert paper["page_manifest"][0]["content"]["title"] == "AI opportunities for Contoso"
        assert paper["intake_context"]["client_name"] == "Contoso"
        assert paper["intake_context"]["contact_name"] == "Grace Hopper"
        assert paper["intake_context"]["website_url"] == "https://contoso.example"
        assert paper["intake_context"]["meeting_purpose"] == "Automate delivery matching"
        assert paper["intake_context"]["meeting_purpose_source"] == "sales_topic_description"
        assert paper["intake_context"]["additional_information"] == (
            "Logistics group with three warehouses."
        )
        rendered = str(paper)
        assert "SHOULD NOT APPEAR" not in rendered
        assert "Warehouse slotting review" not in rendered
        assert "Family-owned distributor in Hamburg." not in rendered
        stored = client.get(
            f"/opportunities/{opportunity_id}/discovery-paper",
            headers=headers(),
        ).json()
        assert stored["document_id"] == paper["document_id"]
        assert get_memory_store().opportunities[UUID(opportunity_id)]["discovery_paper"]["status"] == "ready"
        assert discarded["stage1_intake"]["sales_topic_description"] == "SHOULD NOT APPEAR"


def test_discovery_paper_requires_auth_and_does_not_replace_stage1() -> None:
    reset_memory_store()
    with TestClient(create_app()) as client:
        created = client.post("/opportunities", headers=headers(), json=create_payload())
        opportunity_id = created.json()["id"]
        assert (
            client.post(f"/opportunities/{opportunity_id}/discovery-paper/generate").status_code
            == 401
        )
        generated = client.post(
            f"/opportunities/{opportunity_id}/discovery-paper/generate",
            headers=headers(),
        )
        assert generated.status_code == 200, generated.text
        stage1 = client.get(
            f"/opportunities/{opportunity_id}/stage1-outputs",
            headers=headers(),
        )
        assert stage1.status_code == 200
        assert stage1.json()["status"] == "not_generated"


def test_supabase_adapter_stores_the_discovery_paper_column(monkeypatch) -> None:
    db: dict = {}

    def request(self, method, table, *, json_body=None, params=None):
        assert table == "opportunities"
        if method == "POST":
            db.clear()
            db.update(copy.deepcopy(json_body))
            db.update(
                id=str(uuid4()),
                created_at=datetime.now(UTC).isoformat(),
                updated_at=datetime.now(UTC).isoformat(),
            )
        elif method == "PATCH":
            db.update(copy.deepcopy(json_body))
        return httpx.Response(201 if method == "POST" else 200, json=[copy.deepcopy(db)])

    monkeypatch.setattr(SupabaseDataStore, "_request", request)
    store = SupabaseDataStore("test-token")
    created = store.create_opportunity(
        user_id=OWNER,
        client_name="Northwind",
        opportunity_name="Quarterly title",
        department="Sales",
        language="en",
        stage1_intake={"about_company": "Stored notes"},
    )
    paper = {"schema_version": "1.0", "status": "ready", "pages": []}
    store.update_opportunity(
        opportunity_id=created["id"],
        user_id=OWNER,
        updates={"discovery_paper": paper},
    )
    assert db["discovery_paper"] == paper
    loaded = store.get_opportunity(opportunity_id=created["id"], user_id=OWNER)
    assert loaded["discovery_paper"]["status"] == "ready"


def test_get_returns_persisted_progress_and_failed_paper(monkeypatch) -> None:
    reset_memory_store()
    captured: dict[str, dict] = {}

    def failing_manifest(paper: dict):
        captured["intermediate"] = copy.deepcopy(
            get_discovery_paper(
                get_memory_store(),
                opportunity_id=UUID(captured["opportunity_id"]),
                user_id=OWNER,
            )
        )
        raise RuntimeError("layout failed")

    monkeypatch.setattr(analysis_pipeline, "build_page_manifest", failing_manifest)
    with TestClient(create_app()) as client:
        created = client.post("/opportunities", headers=headers(), json=create_payload())
        opportunity_id = created.json()["id"]
        captured["opportunity_id"] = opportunity_id
        generated = client.post(
            f"/opportunities/{opportunity_id}/discovery-paper/generate",
            headers=headers(),
        )
        assert generated.status_code == 400, generated.text
        assert generated.json()["error"]["code"] == "DISCOVERY_PAPER_GENERATION_FAILED"
        stored = client.get(
            f"/opportunities/{opportunity_id}/discovery-paper",
            headers=headers(),
        )
        assert stored.status_code == 200, stored.text
        paper = stored.json()
        assert paper["status"] == "failed"
        assert paper["document_id"]
        stages = {stage["key"]: stage["status"] for stage in paper["generation"]["stages"]}
        assert stages["validation"] == "ready"
        assert stages["layout"] == "failed"
        assert stages["optional_parts"] == "skipped"
        # A failed analysis never exposes partial content, pages or a brief.
        assert paper["analysis"] is None
        assert paper["page_manifest"] == []
        assert paper["presentation_brief"] is None
        assert paper["intake_context"]["client_name"] == "Northwind"
        assert captured["intermediate"]["status"] == "generating"
        intermediate = {stage["key"]: stage["status"] for stage in captured["intermediate"]["generation"]["stages"]}
        assert intermediate["research"] == "ready"
        assert intermediate["layout"] == "generating"
        assert captured["intermediate"]["document_id"] == paper["document_id"]
        assert paper["status"] != "not_generated"
