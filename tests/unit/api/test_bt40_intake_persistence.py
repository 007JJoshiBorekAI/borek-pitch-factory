"""BT-40: the five intake meanings round-trip and drive later generation."""

from __future__ import annotations

import copy
from datetime import UTC, datetime
from uuid import UUID, uuid4

import httpx
from fastapi.testclient import TestClient

from app.auth import create_test_access_token
from app.config import settings
from app.main import create_app
from app.services.data.memory_store import MemoryDataStore
from app.services.data.supabase_store import SupabaseDataStore
from app.services.stage_a_orchestration import generate_framework_from_transcripts
from services.framework.stage1_intake import resolve_meeting_purpose
from services.framework.stage1_research import generate_stage1_research

OWNER = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
INTAKE = {
    "client_web_page": "https://northwind.example",
    "poc_name": "Ada Lovelace",
    "poc_position": "Operations",
    "sales_topic_description": "Reduce invoice exceptions",
    "about_company": "Family-owned distributor in Hamburg.",
}
UPDATED = {
    "client_web_page": "https://contoso.example",
    "poc_name": "Grace Hopper",
    "poc_position": "Sponsor",
    "sales_topic_description": "Automate delivery matching",
    "about_company": "Logistics group with three warehouses.",
}


def headers() -> dict[str, str]:
    return {
        "Authorization": "Bearer "
        + create_test_access_token(
            user_id=OWNER,
            email="sales@example.com",
            secret=settings.SUPABASE_JWT_SECRET,
        )
    }


def create_body(**overrides: object) -> dict:
    body = {
        "client_name": "Northwind",
        "opportunity_name": "Quarterly title",
        "department": "Sales",
        "stage1_intake": INTAKE,
    }
    body.update(overrides)
    return body


def test_memory_store_create_get_and_patch_round_trip() -> None:
    store = MemoryDataStore()
    created = store.create_opportunity(
        user_id=OWNER,
        client_name="Northwind",
        opportunity_name="Quarterly title",
        department="Sales",
        language="en",
        stage1_intake=INTAKE,
    )
    loaded = store.get_opportunity(opportunity_id=created["id"], user_id=OWNER)
    assert loaded["client_name"] == "Northwind"
    assert loaded["opportunity_name"] == "Quarterly title"
    assert loaded["stage1_intake"] == INTAKE

    patched = store.update_opportunity(
        opportunity_id=created["id"],
        user_id=OWNER,
        updates={
            "client_name": "Contoso",
            "opportunity_name": "Retitled opportunity",
            "stage1_intake": UPDATED,
        },
    )
    assert patched["client_name"] == "Contoso"
    assert patched["opportunity_name"] == "Retitled opportunity"
    assert patched["stage1_intake"] == UPDATED
    assert (
        store.get_opportunity(opportunity_id=created["id"], user_id=OWNER)["stage1_intake"]
        == UPDATED
    )


def test_http_create_get_and_patch_keep_the_five_meanings() -> None:
    with TestClient(create_app()) as client:
        created = client.post("/opportunities", headers=headers(), json=create_body())
        assert created.status_code == 201, created.text
        row = created.json()
        path = f"/opportunities/{row['id']}"
        assert row["client_name"] == "Northwind"
        assert row["opportunity_name"] == "Quarterly title"
        assert row["stage1_intake"] == INTAKE
        assert client.get(path, headers=headers()).json()["stage1_intake"] == INTAKE

        patched = client.patch(
            path,
            headers=headers(),
            json={
                "client_name": "Contoso",
                "opportunity_name": "Retitled opportunity",
                "stage1_intake": UPDATED,
            },
        )
        assert patched.status_code == 200, patched.text
        body = patched.json()
        assert body["client_name"] == "Contoso"
        assert body["opportunity_name"] == "Retitled opportunity"
        assert body["stage1_intake"] == UPDATED
        stored = client.get(path, headers=headers()).json()
        assert stored["client_name"] == "Contoso"
        assert stored["stage1_intake"]["poc_name"] == "Grace Hopper"
        assert stored["stage1_intake"]["client_web_page"] == "https://contoso.example"
        assert stored["stage1_intake"]["sales_topic_description"] == "Automate delivery matching"
        assert stored["stage1_intake"]["about_company"] == "Logistics group with three warehouses."


def test_supabase_adapter_round_trip_for_the_five_meanings(monkeypatch) -> None:
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
            assert params == {"id": f"eq.{db['id']}"}
            db.update(copy.deepcopy(json_body))
        elif "id" in params:
            assert params["id"] == f"eq.{db['id']}"
        else:
            assert params["created_by"] == f"eq.{OWNER}"
        return httpx.Response(201 if method == "POST" else 200, json=[copy.deepcopy(db)])

    monkeypatch.setattr(SupabaseDataStore, "_request", request)
    store = SupabaseDataStore("test-token")
    created = store.create_opportunity(
        user_id=OWNER,
        client_name="Northwind",
        opportunity_name="Quarterly title",
        department="Sales",
        language="en",
        stage1_intake=INTAKE,
    )
    loaded = SupabaseDataStore("test-token").get_opportunity(
        opportunity_id=created["id"], user_id=OWNER
    )
    assert loaded["client_name"] == "Northwind"
    assert loaded["stage1_intake"] == INTAKE
    assert db["poc_name"] == "Ada Lovelace"
    assert db["client_web_page"] == "https://northwind.example"
    assert db["sales_topic_description"] == "Reduce invoice exceptions"
    assert db["about_company"] == "Family-owned distributor in Hamburg."

    patched = store.update_opportunity(
        opportunity_id=created["id"],
        user_id=OWNER,
        updates={
            "client_name": "Contoso",
            "opportunity_name": "Retitled opportunity",
            "stage1_intake": UPDATED,
        },
    )
    assert patched["client_name"] == "Contoso"
    assert patched["stage1_intake"] == UPDATED
    assert db["client_name"] == "Contoso"
    assert db["sales_topic_description"] == "Automate delivery matching"
    assert db["about_company"] == "Logistics group with three warehouses."


def test_meeting_purpose_prefers_sales_topic_and_falls_back_to_title() -> None:
    detailed = {
        "opportunity_name": "Title only",
        "stage1_intake": {"sales_topic_description": "  Reduce invoice exceptions  "},
    }
    assert resolve_meeting_purpose(detailed) == "Reduce invoice exceptions"
    legacy = {
        "opportunity_name": "Legacy meeting purpose",
        "stage1_intake": {"sales_topic_description": "   ", "about_company": "Stored notes"},
    }
    assert resolve_meeting_purpose(legacy) == "Legacy meeting purpose"
    assert legacy["stage1_intake"]["sales_topic_description"] == "   "


def test_research_uses_saved_about_company_and_purpose_fallback() -> None:
    seen: dict = {}

    class Provider:
        def research(self, **kwargs):
            seen.update(kwargs)
            return []

    opportunity = {
        "id": uuid4(),
        "client_name": "Northwind",
        "opportunity_name": "Legacy meeting purpose",
        "pii_redaction_enabled": False,
        "stage1_intake": {
            "poc_name": "Ada Lovelace",
            "client_web_page": "https://northwind.example",
            "about_company": "Family-owned distributor in Hamburg.",
        },
    }
    output = generate_stage1_research(opportunity, provider=Provider())
    assert seen == {
        "client_name": "Northwind",
        "client_web_page": "https://northwind.example",
    }
    fields = output["user_statements"]["fields"]
    assert fields["about_company"] == "Family-owned distributor in Hamburg."
    assert fields["sales_topic_description"] == "Legacy meeting purpose"
    assert fields["poc_name"] == "Ada Lovelace"
    assert fields["client_name"] == "Northwind"
    assert "sales_topic_description" not in opportunity["stage1_intake"]


def test_stage1_prompt_receives_persisted_intake(monkeypatch) -> None:
    monkeypatch.setattr(
        "services.framework.stage1_research._borek_offering",
        lambda *args: {
            "status": "verified",
            "origin": "SOURCE_FACT",
            "value": "Invoice automation",
            "source_refs": [
                {
                    "source_id": "service",
                    "locator": "corpus/doc",
                    "excerpt": "Invoice automation",
                }
            ],
        },
    )
    captured: dict[str, str] = {}

    def complete(system, user, schema):
        captured["user"] = user
        item = {
            "status": "generated",
            "origin": "AI_INFERENCE",
            "text": "Borek could help explore invoice automation.",
            "basis": ["stage1_intake.sales_topic_description", "borek_offering"],
        }
        return {"hypothesis": item, "product_relevance": copy.deepcopy(item)}

    generate_stage1_research(
        {
            "id": uuid4(),
            "client_name": "Northwind",
            "opportunity_name": "Quarterly title",
            "pii_redaction_enabled": False,
            "stage1_intake": INTAKE,
        },
        use_llm=True,
        complete=complete,
    )
    prompt = captured["user"]
    assert "Northwind" in prompt
    assert "Ada Lovelace" in prompt
    assert "https://northwind.example" in prompt
    assert "Reduce invoice exceptions" in prompt
    assert "Family-owned distributor in Hamburg." in prompt


def test_discovery_rereads_the_saved_opportunity_not_the_create_request() -> None:
    original = create_body()
    discarded = copy.deepcopy(original)
    discarded["stage1_intake"]["sales_topic_description"] = "SHOULD NOT APPEAR"
    discarded["stage1_intake"]["about_company"] = "SHOULD NOT APPEAR"
    with TestClient(create_app()) as client:
        created = client.post("/opportunities", headers=headers(), json=original)
        assert created.status_code == 201, created.text
        opportunity_id = created.json()["id"]
        patched = client.patch(
            f"/opportunities/{opportunity_id}",
            headers=headers(),
            json={
                "client_name": "Contoso",
                "opportunity_name": "Retitled opportunity",
                "stage1_intake": UPDATED,
            },
        )
        assert patched.status_code == 200, patched.text
        upload = client.post(
            f"/opportunities/{opportunity_id}/client-documents",
            headers=headers(),
            files={"file": ("brief.txt", b"Client background material.", "text/plain")},
        )
        assert upload.status_code == 201, upload.text
        generated = client.post(
            f"/opportunities/{opportunity_id}/stage1-outputs/generate",
            headers=headers(),
        )
        assert generated.status_code == 200, generated.text
        body = generated.json()
        rendered = str(body)
        assert "SHOULD NOT APPEAR" not in rendered
        assert "Reduce invoice exceptions" not in rendered
        assert "Automate delivery matching" in body["outputs"]["agenda"]["title"]
        assert (
            body["outputs"]["research"]["user_statements"]["fields"]["about_company"]
            == UPDATED["about_company"]
        )
        assert body["outputs"]["research"]["client_name"] == "Contoso"
        stored = client.get(f"/opportunities/{opportunity_id}", headers=headers()).json()
        assert stored["stage1_intake"]["sales_topic_description"] == UPDATED["sales_topic_description"]
        assert discarded["stage1_intake"]["sales_topic_description"] == "SHOULD NOT APPEAR"


def test_discovery_falls_back_to_opportunity_name_without_rewriting_it() -> None:
    with TestClient(create_app()) as client:
        created = client.post(
            "/opportunities",
            headers=headers(),
            json=create_body(
                opportunity_name="Legacy meeting purpose",
                stage1_intake={
                    "client_web_page": "https://northwind.example",
                    "poc_name": "Ada Lovelace",
                    "about_company": "Family-owned distributor in Hamburg.",
                },
            ),
        )
        assert created.status_code == 201, created.text
        opportunity_id = created.json()["id"]
        assert created.json()["stage1_intake"]["sales_topic_description"] is None
        upload = client.post(
            f"/opportunities/{opportunity_id}/client-documents",
            headers=headers(),
            files={"file": ("brief.txt", b"Client background material.", "text/plain")},
        )
        assert upload.status_code == 201, upload.text
        generated = client.post(
            f"/opportunities/{opportunity_id}/stage1-outputs/generate",
            headers=headers(),
        )
        assert generated.status_code == 200, generated.text
        body = generated.json()
        assert "Legacy meeting purpose" in body["outputs"]["agenda"]["title"]
        fields = body["outputs"]["research"]["user_statements"]["fields"]
        assert fields["sales_topic_description"] == "Legacy meeting purpose"
        assert fields["about_company"] == "Family-owned distributor in Hamburg."
        stored = client.get(f"/opportunities/{opportunity_id}", headers=headers()).json()
        assert stored["opportunity_name"] == "Legacy meeting purpose"
        assert stored["stage1_intake"]["sales_topic_description"] is None


def test_fixture_framework_and_presentation_use_saved_intake() -> None:
    store = MemoryDataStore()
    created = store.create_opportunity(
        user_id=OWNER,
        client_name="Northwind",
        opportunity_name="Quarterly title",
        department="Sales",
        language="en",
        stage1_intake=INTAKE,
    )
    store.update_opportunity(
        opportunity_id=created["id"],
        user_id=OWNER,
        updates={
            "client_name": "Contoso",
            "opportunity_name": "Retitled opportunity",
            "stage1_intake": UPDATED,
        },
    )
    framework = generate_framework_from_transcripts(
        store,
        opportunity_id=created["id"],
        user_id=OWNER,
        execution_mode="fixture",
    )
    stamp = framework["stage1_intake"]
    assert stamp["client_name"] == "Contoso"
    assert stamp["poc_name"] == "Grace Hopper"
    assert stamp["client_web_page"] == "https://contoso.example"
    assert stamp["sales_topic_description"] == "Automate delivery matching"
    assert stamp["about_company"] == "Logistics group with three warehouses."
    assert stamp["opportunity_name"] == "Retitled opportunity"
    assert stamp["meeting_purpose_source"] == "sales_topic_description"

    with TestClient(create_app()) as client:
        response = client.post("/opportunities", headers=headers(), json=create_body())
        assert response.status_code == 201, response.text
        opportunity_id = response.json()["id"]
        patched = client.patch(
            f"/opportunities/{opportunity_id}",
            headers=headers(),
            json={
                "client_name": "Contoso",
                "opportunity_name": "Retitled opportunity",
                "stage1_intake": UPDATED,
            },
        )
        assert patched.status_code == 200, patched.text
        upload = client.post(
            f"/opportunities/{opportunity_id}/client-documents",
            headers=headers(),
            files={"file": ("brief.txt", b"Client background material.", "text/plain")},
        )
        assert upload.status_code == 201, upload.text
        generated = client.post(
            f"/opportunities/{opportunity_id}/stage1-outputs/generate",
            headers=headers(),
        )
        assert generated.status_code == 200, generated.text
        from app.services.data.memory_store import get_memory_store

        memory = get_memory_store()
        saved = next(
            row
            for row in memory.framework_versions.values()
            if str(row["opportunity_id"]) == opportunity_id
        )
        assert saved["framework_json"]["stage1_intake"]["about_company"] == UPDATED["about_company"]
        assert (
            saved["framework_json"]["stage1_intake"]["sales_topic_description"]
            == UPDATED["sales_topic_description"]
        )
        plan = next(
            row
            for row in memory.presentation_plans.values()
            if row["framework_version_id"] == saved["id"]
        )
        assert plan["plan_json"]["title"] == "First meeting — Retitled opportunity"
        assert (
            plan["plan_json"]["slides"][0]["purpose"]
            == "Introduce Borek and the first-meeting topic: Automate delivery matching"
        )
