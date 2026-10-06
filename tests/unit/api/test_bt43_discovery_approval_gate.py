"""BT-43: first-contact PPT #1 requires an approved Discovery Paper version."""

from __future__ import annotations

import copy
from uuid import UUID

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import create_test_access_token
from app.config import settings
from app.main import create_app
from app.services.data.memory_store import get_memory_store, reset_memory_store
from app.services.discovery_paper import get_latest_approved_discovery_paper
from app.services.presentation_generation import enqueue_first_contact_presentation_generate

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


def create_opportunity(client: TestClient) -> str:
    response = client.post(
        "/opportunities",
        headers=headers(),
        json={
            "client_name": "Northwind",
            "opportunity_name": "Warehouse review",
            "department": "Operations",
            "stage1_intake": {
                "sales_topic_description": "Warehouse slotting review",
                "about_company": "Family-owned distributor in Hamburg.",
            },
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def approve_discovery(client: TestClient, opportunity_id: str) -> dict:
    generated = client.post(
        f"/opportunities/{opportunity_id}/discovery-paper/generate",
        headers=headers(),
    )
    assert generated.status_code == 200, generated.text
    approved = client.post(
        f"/opportunities/{opportunity_id}/discovery-paper/approve",
        headers=headers(),
    )
    assert approved.status_code == 200, approved.text
    return approved.json()


def _deck_counts() -> dict[str, int]:
    store = get_memory_store()
    return {
        "frameworks": len(store.framework_versions),
        "plans": len(store.presentation_plans),
        "presentations": len(store.presentations),
        "jobs": len(store.generation_jobs),
        "versions": len(store.presentation_versions),
        "slides": len(store.slides),
        "artifacts": len(store.filed_artifacts),
    }


def test_first_contact_enqueue_requires_an_approved_discovery_paper() -> None:
    reset_memory_store()
    with TestClient(create_app()) as client:
        opportunity_id = create_opportunity(client)
        before = _deck_counts()
        with pytest.raises(HTTPException) as raised:
            enqueue_first_contact_presentation_generate(
                get_memory_store(),
                opportunity_id=UUID(opportunity_id),
                user_id=OWNER,
            )
        assert raised.value.status_code == 400
        assert raised.value.detail["code"] == "DISCOVERY_PAPER_APPROVAL_REQUIRED"
        assert "approved Discovery Paper" in raised.value.detail["message"]
        assert _deck_counts() == before

        generated = client.post(
            f"/opportunities/{opportunity_id}/discovery-paper/generate",
            headers=headers(),
        )
        assert generated.status_code == 200, generated.text
        paper = get_memory_store().opportunities[UUID(opportunity_id)]["discovery_paper"]
        paper["latest_approved_version_id"] = "22222222-2222-4222-8222-222222222222"
        with pytest.raises(HTTPException) as still_blocked:
            enqueue_first_contact_presentation_generate(
                get_memory_store(),
                opportunity_id=UUID(opportunity_id),
                user_id=OWNER,
            )
        assert still_blocked.value.detail["code"] == "DISCOVERY_PAPER_APPROVAL_REQUIRED"
        assert _deck_counts() == before

        upload = client.post(
            f"/opportunities/{opportunity_id}/client-documents",
            headers=headers(),
            files={"file": ("brief.txt", b"Client background material.", "text/plain")},
        )
        assert upload.status_code == 201, upload.text
        rejected = client.post(
            f"/opportunities/{opportunity_id}/stage1-outputs/generate",
            headers=headers(),
        )
        assert rejected.status_code == 400, rejected.text
        assert rejected.json()["error"]["code"] == "DISCOVERY_PAPER_APPROVAL_REQUIRED"
        stored = client.get(
            f"/opportunities/{opportunity_id}/stage1-outputs",
            headers=headers(),
        ).json()
        assert stored["status"] == "ready"
        assert len(stored["outputs"]["discovery_questions"]) >= 10
        assert stored["outputs"]["presentation"]["status"] == "failed"
        assert stored["outputs"]["presentation"]["code"] == "DISCOVERY_PAPER_APPROVAL_REQUIRED"
        assert stored["outputs"]["presentation"]["presentation_id"] is None
        assert _deck_counts() == before


def test_approved_discovery_allows_first_contact_and_a_newer_draft_stays_eligible() -> None:
    reset_memory_store()
    with TestClient(create_app()) as client:
        opportunity_id = create_opportunity(client)
        approved = approve_discovery(client, opportunity_id)
        v1_id = approved["id"]
        paper = client.get(
            f"/opportunities/{opportunity_id}/discovery-paper",
            headers=headers(),
        ).json()
        cover = copy.deepcopy(paper["pages"][0]["content"])
        cover["client_name"] = "Edited after approval"
        edited = client.patch(
            f"/opportunities/{opportunity_id}/discovery-paper",
            headers=headers(),
            json={"pages": [{"key": "cover", "content": cover}]},
        )
        assert edited.status_code == 200, edited.text
        versions = client.get(
            f"/opportunities/{opportunity_id}/discovery-paper/versions",
            headers=headers(),
        ).json()["versions"]
        assert [row["status"] for row in versions] == ["approved", "draft"]
        enqueue_first_contact_presentation_generate(
            get_memory_store(),
            opportunity_id=UUID(opportunity_id),
            user_id=OWNER,
        )
        store = get_memory_store()
        assert len(store.framework_versions) == 1
        assert next(iter(store.framework_versions.values()))["status"] == "confirmed"
        assert len(store.presentation_plans) == 1
        assert len(store.presentations) == 1
        assert len(store.generation_jobs) == 1
        assert len(store.presentation_versions) == 1
        assert 1 <= len(store.slides) <= 8  # Borek AI Tech deck: at most 8 slides
        assert len(next(iter(store.presentation_plans.values()))["plan_json"]["slides"]) <= 8
        assert store.filed_artifacts
        latest = get_latest_approved_discovery_paper(
            store,
            opportunity_id=UUID(opportunity_id),
            user_id=OWNER,
        )
        assert latest["id"] == v1_id

        moved = client.post(
            f"/opportunities/{opportunity_id}/discovery-paper/approve",
            headers=headers(),
        )
        assert moved.status_code == 200, moved.text
        assert moved.json()["id"] != v1_id
        latest = get_latest_approved_discovery_paper(
            get_memory_store(),
            opportunity_id=UUID(opportunity_id),
            user_id=OWNER,
        )
        assert latest["id"] == moved.json()["id"]
        assert latest["version_number"] == 2


def test_general_presentation_generate_is_not_gated() -> None:
    reset_memory_store()
    with TestClient(create_app()) as client:
        created = client.post(
            "/opportunities",
            headers=headers(),
            json={
                "client_name": "Acme Corp",
                "opportunity_name": "Invoice Automation",
                "department": "Finance",
            },
        )
        opportunity_id = created.json()["id"]
        client.post(f"/opportunities/{opportunity_id}/framework/generate", headers=headers())
        client.post(f"/opportunities/{opportunity_id}/framework/confirm", headers=headers(), json={})
        plan = client.post(
            f"/opportunities/{opportunity_id}/presentation-plan/generate",
            headers=headers(),
            json={},
        )
        assert plan.status_code == 202, plan.text
        generated = client.post(
            f"/opportunities/{opportunity_id}/presentation/generate",
            headers=headers(),
            json={"presentation_plan_id": plan.json()["presentation_plan_id"]},
        )
        assert generated.status_code == 202, generated.text
        assert generated.json()["job_id"]
        assert generated.json()["presentation_id"]
