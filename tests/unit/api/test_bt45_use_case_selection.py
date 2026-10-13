"""BT-45: select existing approved reference use cases by fact id."""

from __future__ import annotations

import copy
from datetime import UTC, datetime
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from app.auth import create_test_access_token
from app.config import settings
from app.main import create_app
from app.services.data.memory_store import get_memory_store, reset_memory_store
from app.services.data.supabase_store import SupabaseDataStore
from app.services.use_case_selection import get_selected_use_cases
from services.borek_rag.corpus import bundled_corpus_mapping, default_corpus

OWNER = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
REFERENCE_ID = "reference.invoice-3way.delivery-pattern"
SERVICE_ID = "service.invoice-3way.definition"
WAREHOUSE_ID = "reference.warehouse.delivery-pattern"
DEMO_ID = "reference.demo.delivery-pattern"


def headers() -> dict[str, str]:
    return {
        "Authorization": "Bearer "
        + create_test_access_token(
            user_id=OWNER,
            email="sales@example.com",
            secret=settings.SUPABASE_JWT_SECRET,
        )
    }


def create_opportunity(client: TestClient) -> str:
    response = client.post(
        "/opportunities",
        headers=headers(),
        json={
            "client_name": "Northwind",
            "opportunity_name": "Invoice review",
            "department": "Finance",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def two_reference_corpus() -> dict:
    raw = copy.deepcopy(bundled_corpus_mapping())
    raw["corpus_version"] = "2026.09.04-two"
    reference = next(document for document in raw["documents"] if document["document_type"] == "reference")
    extra = copy.deepcopy(reference)
    extra["document_id"] = "REF-WAREHOUSE-v1"
    fact = extra["facts"][0]
    fact["fact_id"] = WAREHOUSE_ID
    fact["query_key"] = "reference:warehouse:delivery_pattern"
    fact["statement"] = "Warehouse reference pattern stays canonical."
    fact["payload"] = {"pattern": "warehouse_operations", "title": "Warehouse reference"}
    raw["documents"].append(extra)
    return raw


def demo_corpus() -> dict:
    return {
        "corpus_id": "borek-demo",
        "corpus_version": "2026.09.03",
        "schema_version": "at59.2",
        "classification": "internal",
        "owner": "Commercial",
        "documents": [
            {
                "document_id": "REF-DEMO-v1",
                "document_type": "reference",
                "title": "Demo reference",
                "version": "1.0.0",
                "effective_from": "2026-07-01",
                "effective_to": "2026-12-31",
                "classification": "internal",
                "facts": [
                    {
                        "fact_id": DEMO_ID,
                        "kind": "reference",
                        "service_key": "invoice_3way_match",
                        "query_key": "reference:demo:delivery_pattern",
                        "required_terms": ["demo", "reference"],
                        "optional_terms": [],
                        "statement": "Demo reference that must not be attached.",
                        "payload": {"pattern": "demo_pattern"},
                    }
                ],
            }
        ],
    }


def test_available_use_cases_are_approved_references_only() -> None:
    reset_memory_store()
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client)
    listed = client.get(
        f"/opportunities/{opportunity_id}/available-use-cases",
        headers=headers(),
    )
    assert listed.status_code == 200, listed.text
    ids = [item["fact_id"] for item in listed.json()["use_cases"]]
    assert ids == [REFERENCE_ID]
    item = listed.json()["use_cases"][0]
    assert item["document_id"] == "REF-INV3WAY-v1"
    assert item["document_version"]
    assert item["service_key"] == "invoice_3way_match"
    assert item["statement"]
    assert item["selected"] is False
    assert SERVICE_ID not in ids
    assert "price.invoice-3way.senior-consultant.day-rate" not in ids
    assert "staff.invoice-3way.core-team" not in ids


def test_selection_is_reference_only_and_resolves_in_stored_order(monkeypatch: pytest.MonkeyPatch) -> None:
    reset_memory_store()
    calls = {"retrieve": 0, "stage1": 0, "discovery": 0, "llm": 0}

    def blocked(name):
        def _blocked(*_args, **_kwargs):
            calls[name] += 1
            raise AssertionError(f"{name} must not run during use-case selection")

        return _blocked

    monkeypatch.setattr("services.borek_rag.retriever.retrieve", blocked("retrieve"))
    monkeypatch.setattr("app.services.journey_generation.generate_stage1_outputs", blocked("stage1"))
    monkeypatch.setattr("services.framework.discovery_paper.build_discovery_paper", blocked("discovery"))
    monkeypatch.setattr("llm.claude.client.structured_complete", blocked("llm"))

    client = TestClient(create_app())
    opportunity_id = create_opportunity(client)
    store = get_memory_store()
    store.ingest_approved_corpus(two_reference_corpus())
    store.ingest_approved_corpus(demo_corpus())
    canonical = next(fact for fact in default_corpus().facts if fact.fact_id == REFERENCE_ID)
    statement_before = canonical.statement
    payload_before = copy.deepcopy(canonical.payload)
    facts_before = copy.deepcopy(store.knowledge_facts)

    rejected_body = client.put(
        f"/opportunities/{opportunity_id}/selected-use-cases",
        headers=headers(),
        json={"use_case_ids": [REFERENCE_ID], "statement": "rewritten"},
    )
    assert rejected_body.status_code == 422
    assert rejected_body.json()["error"]["code"] == "VALIDATION_ERROR"

    unknown = client.put(
        f"/opportunities/{opportunity_id}/selected-use-cases",
        headers=headers(),
        json={"use_case_ids": ["reference.missing"]},
    )
    assert unknown.status_code == 400
    assert unknown.json()["error"]["code"] == "USE_CASE_NOT_ATTACHABLE"

    non_reference = client.put(
        f"/opportunities/{opportunity_id}/selected-use-cases",
        headers=headers(),
        json={"use_case_ids": [SERVICE_ID]},
    )
    assert non_reference.status_code == 400
    assert non_reference.json()["error"]["code"] == "USE_CASE_NOT_ATTACHABLE"

    demo = client.put(
        f"/opportunities/{opportunity_id}/selected-use-cases",
        headers=headers(),
        json={"use_case_ids": [DEMO_ID]},
    )
    assert demo.status_code == 400
    assert demo.json()["error"]["code"] == "USE_CASE_NOT_ATTACHABLE"
    assert store.opportunities[UUID(opportunity_id)]["selected_use_case_ids"] == []

    saved = client.put(
        f"/opportunities/{opportunity_id}/selected-use-cases",
        headers=headers(),
        json={"use_case_ids": [WAREHOUSE_ID, REFERENCE_ID, WAREHOUSE_ID]},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["use_case_ids"] == [WAREHOUSE_ID, REFERENCE_ID]
    assert [item["fact_id"] for item in saved.json()["use_cases"]] == [WAREHOUSE_ID, REFERENCE_ID]
    assert saved.json()["use_cases"][0]["statement"] == "Warehouse reference pattern stays canonical."
    assert saved.json()["use_cases"][0]["payload"]["pattern"] == "warehouse_operations"
    assert saved.json()["use_cases"][1]["statement"] == statement_before

    listed = client.get(
        f"/opportunities/{opportunity_id}/available-use-cases",
        headers=headers(),
    ).json()["use_cases"]
    selected = {item["fact_id"]: item["selected"] for item in listed}
    assert selected[WAREHOUSE_ID] is True
    assert selected[REFERENCE_ID] is True
    assert listed[0]["title"] == "Warehouse reference" or listed[1]["title"] == "Warehouse reference"
    assert DEMO_ID not in selected

    mixed = client.put(
        f"/opportunities/{opportunity_id}/selected-use-cases",
        headers=headers(),
        json={"use_case_ids": [REFERENCE_ID, "reference.missing"]},
    )
    assert mixed.status_code == 400
    assert store.opportunities[UUID(opportunity_id)]["selected_use_case_ids"] == [WAREHOUSE_ID, REFERENCE_ID]

    replaced = client.put(
        f"/opportunities/{opportunity_id}/selected-use-cases",
        headers=headers(),
        json={"use_case_ids": [REFERENCE_ID]},
    )
    assert replaced.status_code == 200, replaced.text
    assert replaced.json()["use_case_ids"] == [REFERENCE_ID]
    fetched = client.get(
        f"/opportunities/{opportunity_id}/selected-use-cases",
        headers=headers(),
    ).json()
    assert fetched["use_case_ids"] == [REFERENCE_ID]
    resolved = get_selected_use_cases(
        store,
        opportunity_id=UUID(opportunity_id),
        user_id=OWNER,
    )
    assert resolved["use_cases"][0]["status"] == "resolved"
    assert resolved["use_cases"][0]["statement"] == statement_before
    assert resolved["use_cases"][0]["payload"] == payload_before

    cleared = client.put(
        f"/opportunities/{opportunity_id}/selected-use-cases",
        headers=headers(),
        json={"use_case_ids": []},
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["use_case_ids"] == []
    assert store.opportunities[UUID(opportunity_id)]["selected_use_case_ids"] == []

    again = client.put(
        f"/opportunities/{opportunity_id}/selected-use-cases",
        headers=headers(),
        json={"use_case_ids": [REFERENCE_ID]},
    )
    assert again.status_code == 200, again.text
    without_reference = copy.deepcopy(bundled_corpus_mapping())
    without_reference["corpus_version"] = "2026.09.05-no-reference"
    without_reference["documents"] = [
        document for document in without_reference["documents"] if document["document_type"] != "reference"
    ]
    store.ingest_approved_corpus(without_reference)
    drifted = client.get(
        f"/opportunities/{opportunity_id}/selected-use-cases",
        headers=headers(),
    ).json()
    assert drifted["use_case_ids"] == [REFERENCE_ID]
    assert drifted["use_cases"] == [
        {
            "fact_id": REFERENCE_ID,
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
    ]
    assert store.opportunities[UUID(opportunity_id)]["stage1_outputs"] is None
    assert store.opportunities[UUID(opportunity_id)]["discovery_paper"] is None
    assert canonical.statement == statement_before
    assert canonical.payload == payload_before
    assert calls == {"retrieve": 0, "stage1": 0, "discovery": 0, "llm": 0}
    audit = [entry for entry in store.audit_logs.values() if entry["action"] == "selected_use_cases.update"]
    assert audit
    assert statement_before not in str(audit[-1])
    assert "warehouse_operations" not in str(audit[-1])
    assert facts_before


def test_supabase_persists_ordered_ids_and_clears(monkeypatch: pytest.MonkeyPatch) -> None:
    tables: dict[str, list[dict]] = {"opportunities": []}

    def request(self, method, table, *, json_body=None, params=None, headers=None):
        rows = tables.setdefault(table, [])
        params = params or {}
        if method == "POST":
            created = copy.deepcopy(json_body)
            created.setdefault("id", str(uuid4()))
            created.setdefault("created_at", datetime.now(UTC).isoformat())
            created.setdefault("updated_at", created["created_at"])
            created.setdefault("selected_use_case_ids", [])
            rows.append(created)
            return httpx.Response(201, json=[copy.deepcopy(created)])
        matched = [
            row
            for row in rows
            if all(
                str(row.get(key)) == value.removeprefix("eq.")
                for key, value in params.items()
                if isinstance(value, str) and value.startswith("eq.")
            )
        ]
        if method == "GET":
            return httpx.Response(200, json=[copy.deepcopy(row) for row in matched])
        if method == "PATCH":
            assert matched
            matched[0].update(copy.deepcopy(json_body))
            return httpx.Response(200, json=[copy.deepcopy(matched[0])])
        raise AssertionError(method)

    monkeypatch.setattr(SupabaseDataStore, "_request", request)
    store = SupabaseDataStore("test-token")
    created = store.create_opportunity(
        user_id=OWNER,
        client_name="Northwind",
        opportunity_name="Invoice review",
        department="Finance",
        language="en",
    )
    from app.services.use_case_selection import replace_selected_use_cases

    saved = replace_selected_use_cases(
        store,
        opportunity_id=created["id"],
        user_id=OWNER,
        use_case_ids=[REFERENCE_ID, REFERENCE_ID],
    )
    assert saved["use_case_ids"] == [REFERENCE_ID]
    assert saved["use_cases"][0]["status"] == "resolved"
    fetched = store.get_opportunity(opportunity_id=created["id"], user_id=OWNER)
    assert fetched["selected_use_case_ids"] == [REFERENCE_ID]
    cleared = replace_selected_use_cases(
        store,
        opportunity_id=created["id"],
        user_id=OWNER,
        use_case_ids=[],
    )
    assert cleared["use_case_ids"] == []
    assert store.get_opportunity(opportunity_id=created["id"], user_id=OWNER)["selected_use_case_ids"] == []
