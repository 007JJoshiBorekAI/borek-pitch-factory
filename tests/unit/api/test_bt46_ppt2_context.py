"""BT-46: one read-only PPT #2 context from four distinguishable sources."""

from __future__ import annotations

import copy
import io
import json
from pathlib import Path
from uuid import UUID

import jsonschema
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from jsonschema import FormatChecker

from app.auth import create_test_access_token
from app.config import settings
from app.main import create_app
from app.services.data.memory_store import get_memory_store, reset_memory_store
from app.services.ppt2_context import build_ppt2_context
from services.borek_rag.corpus import bundled_corpus_mapping

OWNER = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
ROOT = Path(__file__).resolve().parents[3]
SCHEMA = json.loads((ROOT / "packages" / "contracts" / "ppt2_context.schema.json").read_text(encoding="utf-8"))
SOURCE_PRIORITY = [
    "approved_discovery",
    "personal_notes",
    "meeting_extraction",
    "selected_use_cases",
]
REFERENCE_ID = "reference.invoice-3way.delivery-pattern"
WAREHOUSE_ID = "reference.warehouse.delivery-pattern"
LABELED = (
    "Ada: Requirement: Flag duplicate invoices.\n"
    "Ben: Challenge: Matching still takes two days.\n"
    "Ada: Priority: Finance reviews the first draft.\n"
    "Ben: Opportunity: Automate the exception queue.\n"
    "Ada: Discussed solution: Show exceptions before posting.\n"
    "Ben: Decision: Start with invoices only.\n"
    "Ada: Follow-up: Send the sample file on Friday.\n"
)


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
            "opportunity_name": "Quarterly title",
            "department": "Sales",
            "stage1_intake": {
                "client_web_page": "https://northwind.example",
                "poc_name": "Ada Lovelace",
                "sales_topic_description": "Warehouse slotting review",
                "about_company": "Family-owned distributor in Hamburg.",
            },
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def upload_transcript(client: TestClient, opportunity_id: str) -> str:
    response = client.post(
        f"/opportunities/{opportunity_id}/transcripts",
        headers=headers(),
        files={"file": ("meeting.txt", io.BytesIO(LABELED.encode()), "text/plain")},
    )
    assert response.status_code == 201, response.text
    return response.json()["transcript"]["id"]


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


def context_of(client: TestClient, opportunity_id: str) -> dict:
    response = client.get(f"/opportunities/{opportunity_id}/ppt2-context", headers=headers())
    assert response.status_code == 200, response.text
    body = response.json()
    jsonschema.Draft202012Validator(SCHEMA, format_checker=FormatChecker()).validate(body)
    assert body["source_priority"] == SOURCE_PRIORITY
    assert body["opportunity_id"] == opportunity_id
    return body


def warning_codes(body: dict) -> list[str]:
    return [item["code"] for item in body["warnings"]]


def snapshot(opportunity_id: str) -> dict:
    store = get_memory_store()
    key = UUID(opportunity_id)
    return {
        "opportunity": copy.deepcopy(store.opportunities[key]),
        "versions": copy.deepcopy(store.discovery_paper_versions),
        "transcripts": copy.deepcopy(store.transcripts),
        "facts": copy.deepcopy(store.knowledge_facts),
        "audit": copy.deepcopy(store.audit_logs),
        "jobs": copy.deepcopy(store.generation_jobs),
        "presentations": copy.deepcopy(store.presentations),
    }


def test_latest_approved_discovery_is_used_and_newer_draft_is_ignored() -> None:
    reset_memory_store()
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client)
    generated = client.post(
        f"/opportunities/{opportunity_id}/discovery-paper/generate",
        headers=headers(),
    )
    assert generated.status_code == 200, generated.text
    draft = generated.json()
    before_approval = context_of(client, opportunity_id)
    assert before_approval["sources"]["approved_discovery"]["status"] == "missing"
    assert before_approval["sources"]["approved_discovery"]["paper_json"] is None
    assert before_approval["sources"]["approved_discovery"]["version_id"] is None
    assert "approved_discovery" in before_approval["missing_sources"]
    assert "DISCOVERY_NOT_APPROVED" in warning_codes(before_approval)
    assert draft["analysis"]["framing"]["document"]["title"]
    assert before_approval["sources"]["approved_discovery"]["paper_json"] != draft

    approved = client.post(
        f"/opportunities/{opportunity_id}/discovery-paper/approve",
        headers=headers(),
    )
    assert approved.status_code == 200, approved.text
    version_id = approved.json()["id"]
    approved_paper = client.get(
        f"/opportunities/{opportunity_id}/discovery-paper/versions/{version_id}",
        headers=headers(),
    ).json()["paper_json"]
    edited = client.patch(
        f"/opportunities/{opportunity_id}/discovery-paper",
        headers=headers(),
        json={"edits": [{"target": "framing", "value": {"document": {"title": "Draft Only Name"}}}]},
    )
    assert edited.status_code == 200, edited.text
    working = client.get(
        f"/opportunities/{opportunity_id}/discovery-paper",
        headers=headers(),
    ).json()
    assert working["analysis"]["framing"]["document"]["title"] == "Draft Only Name"
    assert working["presentation_brief"]["document_title"] == "Draft Only Name"

    body = context_of(client, opportunity_id)
    source = body["sources"]["approved_discovery"]
    assert source["status"] == "available"
    assert source["version_id"] == version_id
    assert source["version_number"] == 1
    assert source["document_id"] == approved_paper["document_id"]
    assert source["approved_at"]
    assert source["paper_json"] == approved_paper
    assert source["paper_json"]["analysis"]["framing"]["document"]["title"] != "Draft Only Name"
    assert source["paper_json"]["presentation_brief"]["document_title"] != "Draft Only Name"
    assert source["paper_json"] != working
    assert "approved_discovery" not in body["missing_sources"]
    assert "DISCOVERY_NOT_APPROVED" not in warning_codes(body)


def test_notes_stay_separate_and_revision_mismatch_is_explicit() -> None:
    reset_memory_store()
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client)
    transcript_id = upload_transcript(client, opportunity_id)
    saved = client.put(
        f"/opportunities/{opportunity_id}/personal-notes",
        headers=headers(),
        json={"text": "Priority: Owner wants finance first."},
    )
    assert saved.status_code == 200, saved.text
    generated = client.post(
        f"/opportunities/{opportunity_id}/meeting-extraction/generate",
        headers=headers(),
        json={"transcript_id": transcript_id},
    )
    assert generated.status_code == 200, generated.text
    extraction = generated.json()

    matched = context_of(client, opportunity_id)
    notes = matched["sources"]["personal_notes"]
    meeting = matched["sources"]["meeting_extraction"]
    assert notes["status"] == "available"
    assert notes["text"] == "Priority: Owner wants finance first."
    assert notes["updated_at"] == saved.json()["updated_at"]
    assert meeting["status"] == "available"
    assert meeting["transcript_id"] == transcript_id
    assert meeting["personal_notes_updated_at"] == saved.json()["updated_at"]
    assert meeting["extraction"]["transcript_id"] == transcript_id
    assert meeting["extraction"]["personal_notes_updated_at"] == saved.json()["updated_at"]
    assert "Priority: Owner wants finance first." not in json.dumps(meeting["extraction"]["priorities"])
    assert matched["notes_revision_matches_extraction"] is True
    assert "MEETING_EXTRACTION_NOTES_STALE" not in warning_codes(matched)
    assert "meeting_extraction" not in matched["missing_sources"]
    assert "personal_notes" not in matched["missing_sources"]

    newer = client.put(
        f"/opportunities/{opportunity_id}/personal-notes",
        headers=headers(),
        json={"text": "Priority: Owner corrected the transcript after extraction."},
    )
    assert newer.status_code == 200, newer.text
    stale = context_of(client, opportunity_id)
    assert stale["sources"]["personal_notes"]["text"] == newer.json()["text"]
    assert stale["sources"]["personal_notes"]["updated_at"] == newer.json()["updated_at"]
    assert stale["sources"]["meeting_extraction"]["extraction"] == extraction
    assert stale["sources"]["meeting_extraction"]["personal_notes_updated_at"] == saved.json()["updated_at"]
    assert stale["notes_revision_matches_extraction"] is False
    assert "MEETING_EXTRACTION_NOTES_STALE" in warning_codes(stale)

    bare = create_opportunity(client)
    bare_transcript = upload_transcript(client, bare)
    without_notes = client.post(
        f"/opportunities/{bare}/meeting-extraction/generate",
        headers=headers(),
        json={"transcript_id": bare_transcript},
    )
    assert without_notes.status_code == 200, without_notes.text
    assert without_notes.json()["personal_notes_updated_at"] is None
    absent = context_of(client, bare)
    assert absent["sources"]["personal_notes"] == {
        "status": "missing",
        "text": None,
        "updated_at": None,
    }
    assert "personal_notes" in absent["missing_sources"]
    assert absent["notes_revision_matches_extraction"] is True
    assert "MEETING_EXTRACTION_NOTES_STALE" not in warning_codes(absent)
    added = client.put(
        f"/opportunities/{bare}/personal-notes",
        headers=headers(),
        json={"text": "Follow-up: Notes arrived after extraction."},
    )
    assert added.status_code == 200, added.text
    later = context_of(client, bare)
    assert later["sources"]["personal_notes"]["text"] == added.json()["text"]
    assert later["sources"]["meeting_extraction"]["personal_notes_updated_at"] is None
    assert later["sources"]["meeting_extraction"]["extraction"] == without_notes.json()
    assert later["notes_revision_matches_extraction"] is False
    assert "MEETING_EXTRACTION_NOTES_STALE" in warning_codes(later)


def test_selected_use_cases_keep_order_canonical_bodies_and_unresolved_ids() -> None:
    reset_memory_store()
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client)
    store = get_memory_store()
    store.ingest_approved_corpus(two_reference_corpus())
    empty = context_of(client, opportunity_id)
    assert empty["sources"]["selected_use_cases"] == {
        "status": "empty",
        "use_case_ids": [],
        "use_cases": [],
    }
    assert "USE_CASE_UNRESOLVED" not in warning_codes(empty)

    saved = client.put(
        f"/opportunities/{opportunity_id}/selected-use-cases",
        headers=headers(),
        json={"use_case_ids": [WAREHOUSE_ID, REFERENCE_ID, WAREHOUSE_ID]},
    )
    assert saved.status_code == 200, saved.text
    selected = context_of(client, opportunity_id)["sources"]["selected_use_cases"]
    assert selected["status"] == "available"
    assert selected["use_case_ids"] == [WAREHOUSE_ID, REFERENCE_ID]
    assert selected["use_cases"] == saved.json()["use_cases"]
    assert selected["use_cases"][0]["statement"] == "Warehouse reference pattern stays canonical."
    assert selected["use_cases"][0]["payload"]["pattern"] == "warehouse_operations"
    assert selected["use_cases"][0]["document_id"] == "REF-WAREHOUSE-v1"
    assert selected["use_cases"][1]["fact_id"] == REFERENCE_ID
    assert selected["use_cases"][1]["status"] == "resolved"
    assert selected["use_cases"][1]["statement"]
    assert selected["use_cases"][1]["document_id"] == "REF-INV3WAY-v1"

    store.opportunities[UUID(opportunity_id)]["selected_use_case_ids"] = [
        WAREHOUSE_ID,
        "reference.gone",
    ]
    partial = context_of(client, opportunity_id)
    cases = partial["sources"]["selected_use_cases"]
    assert cases["status"] == "partial"
    assert cases["use_case_ids"] == [WAREHOUSE_ID, "reference.gone"]
    assert cases["use_cases"][0]["fact_id"] == WAREHOUSE_ID
    assert cases["use_cases"][0]["status"] == "resolved"
    assert cases["use_cases"][0]["statement"] == "Warehouse reference pattern stays canonical."
    assert cases["use_cases"][1] == {
        "fact_id": "reference.gone",
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
    unresolved = next(item for item in partial["warnings"] if item["code"] == "USE_CASE_UNRESOLVED")
    assert unresolved["fact_ids"] == ["reference.gone"]
    assert store.opportunities[UUID(opportunity_id)]["selected_use_case_ids"] == [
        WAREHOUSE_ID,
        "reference.gone",
    ]


def test_missing_sources_and_warnings_are_ordered() -> None:
    reset_memory_store()
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client)
    body = context_of(client, opportunity_id)
    assert body["missing_sources"] == [
        "approved_discovery",
        "personal_notes",
        "meeting_extraction",
    ]
    assert warning_codes(body) == [
        "DISCOVERY_NOT_APPROVED",
        "MEETING_EXTRACTION_MISSING",
    ]
    assert body["notes_revision_matches_extraction"] == "not_applicable"
    assert body["sources"]["meeting_extraction"]["status"] == "missing"
    assert body["sources"]["meeting_extraction"]["extraction"] is None
    assert body["sources"]["personal_notes"]["status"] == "missing"
    assert "personal_notes" in body["missing_sources"]
    assert all(item["code"] != "PERSONAL_NOTES_MISSING" for item in body["warnings"])
    again = context_of(client, opportunity_id)
    assert again["missing_sources"] == body["missing_sources"]
    assert again["warnings"] == body["warnings"]
    assert again["source_priority"] == SOURCE_PRIORITY


def test_builder_and_get_do_not_mutate_or_generate(monkeypatch: pytest.MonkeyPatch) -> None:
    reset_memory_store()
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client)
    generated = client.post(
        f"/opportunities/{opportunity_id}/discovery-paper/generate",
        headers=headers(),
    )
    assert generated.status_code == 200, generated.text
    client.post(f"/opportunities/{opportunity_id}/discovery-paper/approve", headers=headers())
    transcript_id = upload_transcript(client, opportunity_id)
    client.put(
        f"/opportunities/{opportunity_id}/personal-notes",
        headers=headers(),
        json={"text": "Decision: Keep this note beside the extraction."},
    )
    client.post(
        f"/opportunities/{opportunity_id}/meeting-extraction/generate",
        headers=headers(),
        json={"transcript_id": transcript_id},
    )
    get_memory_store().ingest_approved_corpus(two_reference_corpus())
    client.put(
        f"/opportunities/{opportunity_id}/selected-use-cases",
        headers=headers(),
        json={"use_case_ids": [REFERENCE_ID]},
    )
    before = snapshot(opportunity_id)
    calls = {"retrieve": 0, "llm": 0, "discovery": 0, "extraction": 0, "selection": 0, "stage2": 0}

    def blocked(name):
        def _blocked(*_args, **_kwargs):
            calls[name] += 1
            raise AssertionError(f"{name} must not run while assembling PPT #2 context")

        return _blocked

    monkeypatch.setattr("services.borek_rag.retriever.retrieve", blocked("retrieve"))
    monkeypatch.setattr("llm.claude.client.structured_complete", blocked("llm"))
    monkeypatch.setattr("app.services.discovery_paper.generate_discovery_paper", blocked("discovery"))
    monkeypatch.setattr(
        "app.services.meeting_extraction.generate_meeting_extraction",
        blocked("extraction"),
    )
    monkeypatch.setattr(
        "app.services.use_case_selection.replace_selected_use_cases",
        blocked("selection"),
    )
    monkeypatch.setattr("app.services.journey_generation.generate_stage2_outputs", blocked("stage2"))

    built = build_ppt2_context(
        get_memory_store(),
        opportunity_id=UUID(opportunity_id),
        user_id=OWNER,
    )
    original_sources = copy.deepcopy(built["sources"])
    built["sources"]["approved_discovery"]["paper_json"]["presentation_brief"]["client_name"] = "Mutated"
    built["sources"]["personal_notes"]["text"] = "Mutated"
    built["sources"]["meeting_extraction"]["extraction"]["decisions"].append("Mutated")
    built["sources"]["selected_use_cases"]["use_cases"][0]["statement"] = "Mutated"
    assert snapshot(opportunity_id) == before

    fetched = context_of(client, opportunity_id)
    assert fetched["sources"] == original_sources
    assert fetched["missing_sources"] == built["missing_sources"]
    assert fetched["warnings"] == built["warnings"]
    assert fetched["notes_revision_matches_extraction"] == built["notes_revision_matches_extraction"]
    assert snapshot(opportunity_id) == before
    fresh = build_ppt2_context(
        get_memory_store(),
        opportunity_id=UUID(opportunity_id),
        user_id=OWNER,
    )
    assert fresh["sources"] == original_sources
    assert calls == {"retrieve": 0, "llm": 0, "discovery": 0, "extraction": 0, "selection": 0, "stage2": 0}
    assert snapshot(opportunity_id) == before

    sentinel = {"assembled_by": "build_ppt2_context"}
    monkeypatch.setattr("app.routers.journey_outputs.build_ppt2_context", lambda *args, **kwargs: sentinel)
    routed = client.get(f"/opportunities/{opportunity_id}/ppt2-context", headers=headers())
    assert routed.status_code == 200, routed.text
    assert routed.json() == sentinel
    assert snapshot(opportunity_id) == before

    service = (ROOT / "apps" / "services" / "api" / "app" / "services" / "ppt2_context.py").read_text(
        encoding="utf-8"
    )
    assert "JJ-35" not in service
    assert "retrieve(" not in service
    assert "enqueue_" not in service


def test_unexpected_discovery_errors_still_propagate(monkeypatch: pytest.MonkeyPatch) -> None:
    reset_memory_store()
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client)

    def other_error(*_args, **_kwargs):
        raise HTTPException(status_code=503, detail={"code": "STORE_UNAVAILABLE", "message": "down"})

    monkeypatch.setattr("app.services.ppt2_context.get_latest_approved_discovery_paper", other_error)
    with pytest.raises(HTTPException) as caught:
        build_ppt2_context(
            get_memory_store(),
            opportunity_id=UUID(opportunity_id),
            user_id=OWNER,
        )
    assert caught.value.status_code == 503
    assert caught.value.detail["code"] == "STORE_UNAVAILABLE"
