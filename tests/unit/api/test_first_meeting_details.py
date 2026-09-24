"""Updated First Meeting transcript-to-review API."""

from __future__ import annotations

from uuid import UUID

from fastapi.testclient import TestClient

from app.auth import create_test_access_token
from app.config import settings
from app.main import create_app
from app.services.data.memory_store import get_memory_store, reset_memory_store

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


def test_first_meeting_generates_all_fields_and_preserves_review() -> None:
    reset_memory_store()
    client = TestClient(create_app())
    created = client.post(
        "/opportunities",
        headers=headers(),
        json={
            "client_name": "Acme",
            "opportunity_name": "Operations Pilot",
            "department": "Managed Operations",
            "service_solution": "A controlled pilot",
            "business_need": "Improve multilingual quality",
            "pitch_description": "Pilot preparation",
            "stage1_intake": {"poc_name": "Mira Koch"},
        },
    )
    opportunity_id = created.json()["id"]
    uploaded = client.post(
        f"/opportunities/{opportunity_id}/transcripts",
        headers=headers(),
        files={
            "file": (
                "meeting.txt",
                b"Mira: We agreed to test DE and EN.\nLeon: I will send volume data.\nMira: Can quality improve?\n",
                "text/plain",
            )
        },
    )
    assert uploaded.status_code == 201, uploaded.text

    generated = client.post(
        f"/opportunities/{opportunity_id}/first-meeting-details/generate",
        headers=headers(),
    )
    assert generated.status_code == 200, generated.text
    body = generated.json()
    assert body["status"] == "generated"
    assert body["generated"]["business_opportunity"] == "Improve multilingual quality"
    assert body["generated"]["proposed_solution"] == "A controlled pilot"
    assert body["generated"]["primary_point_of_contact"] == "Mira Koch"
    assert body["generated"]["estimated_budget"] is None
    assert body["provenance"]["source"] == "TRANSCRIPT_SUMMARY"

    reviewed = dict(body["generated"])
    reviewed["estimated_scope"] = "DE/EN pilot"
    reviewed["estimated_budget"] = "Not discussed"
    saved = client.put(
        f"/opportunities/{opportunity_id}/first-meeting-details/review",
        headers=headers(),
        json=reviewed,
    )
    assert saved.status_code == 200, saved.text
    result = saved.json()
    assert result["status"] == "reviewed"
    assert result["generated"]["estimated_scope"] is None
    assert result["reviewed"]["estimated_scope"] == "DE/EN pilot"
    assert result["effective"] == result["reviewed"]

    actions = {row["action"] for row in get_memory_store().audit_logs.values()}
    assert "first_meeting_details.generate" in actions
    assert "first_meeting_details.review" in actions
