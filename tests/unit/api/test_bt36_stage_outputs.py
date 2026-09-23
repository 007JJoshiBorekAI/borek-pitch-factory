"""BT-36 / TSK-013 retrieval APIs for MS-35."""

from __future__ import annotations

from uuid import UUID

from fastapi.testclient import TestClient

from app.auth import create_test_access_token
from app.config import settings
from app.main import create_app
from app.services.data.memory_store import reset_memory_store

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
            "client_name": "Acme",
            "opportunity_name": "Invoice Automation",
            "department": "Finance",
            "stage1_intake": {
                "sales_topic_description": "Invoice matching automation",
                "about_company": "Regional equipment distributor.",
            },
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_stage1_outputs_require_document_and_persist() -> None:
    reset_memory_store()
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client)
    empty = client.get(
        f"/opportunities/{opportunity_id}/stage1-outputs",
        headers=headers(),
    )
    assert empty.status_code == 200
    assert empty.json()["status"] == "not_generated"
    blocked = client.post(
        f"/opportunities/{opportunity_id}/stage1-outputs/generate",
        headers=headers(),
    )
    assert blocked.status_code == 400
    assert blocked.json()["error"]["code"] == "CLIENT_DOCUMENT_REQUIRED"
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
    assert body["status"] == "ready"
    assert len(body["outputs"]["discovery_questions"]) >= 10
    assert body["outputs"]["presentation"]["code"] == "FIRST_MEETING_PPT_PROFILE_UNFROZEN"
    stored = client.get(
        f"/opportunities/{opportunity_id}/stage1-outputs",
        headers=headers(),
    ).json()
    assert stored["status"] == "ready"


def test_meeting_feedback_and_stage2_outputs() -> None:
    reset_memory_store()
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client)
    empty = client.get(
        f"/opportunities/{opportunity_id}/meeting-feedback",
        headers=headers(),
    ).json()
    assert empty["text"] is None
    saved = client.put(
        f"/opportunities/{opportunity_id}/meeting-feedback",
        headers=headers(),
        json={"text": "Works council wants a written agenda."},
    )
    assert saved.status_code == 200, saved.text
    assert "Works council" in saved.json()["text"]
    missing = client.post(
        f"/opportunities/{opportunity_id}/stage2-outputs/generate",
        headers=headers(),
    )
    assert missing.json()["error"]["code"] == "TRANSCRIPT_REQUIRED"
    transcript = client.post(
        f"/opportunities/{opportunity_id}/transcripts",
        headers=headers(),
        files={
            "file": (
                "call.txt",
                b"Ada: We agreed the interface will be REST.\nBob: I will send the protocol by 24.09.2026.\nAda: Open question remains the works council timing?\n",
                "text/plain",
            )
        },
    )
    assert transcript.status_code == 201, transcript.text
    generated = client.post(
        f"/opportunities/{opportunity_id}/stage2-outputs/generate",
        headers=headers(),
    )
    assert generated.status_code == 200, generated.text
    outputs = generated.json()["outputs"]
    assert "Works council" in outputs["call_summary"]
    assert outputs["transcript_summary"]["schema_version"] == "1.0"
    extra_doc = client.post(
        f"/opportunities/{opportunity_id}/client-documents",
        headers=headers(),
        files={"file": ("extra.txt", b"Optional deepening annex.", "text/plain")},
    )
    assert extra_doc.status_code == 201


def test_email_drafts_three_lengths_confirm_never_sends() -> None:
    reset_memory_store()
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client)
    empty = client.get(
        f"/opportunities/{opportunity_id}/email-drafts",
        headers=headers(),
        params={"journey_stage": "first_contact"},
    )
    assert empty.json()["draft"] is None
    generated = client.post(
        f"/opportunities/{opportunity_id}/email-drafts/generate",
        headers=headers(),
        json={"journey_stage": "first_contact"},
    )
    assert generated.status_code == 200, generated.text
    draft = generated.json()["draft"]
    assert draft["send_status"] == "not_sent"
    assert draft["lengths"]["short"]["word_count"] <= 150
    assert "medium" in draft["lengths"]
    assert "extensive" in draft["lengths"]
    send = client.post(
        f"/opportunities/{opportunity_id}/email-drafts/{draft['id']}/send",
        headers=headers(),
    )
    assert send.status_code == 400
    assert send.json()["error"]["code"] == "EMAIL_SEND_FORBIDDEN"
    confirmed = client.post(
        f"/opportunities/{opportunity_id}/email-drafts/{draft['id']}/confirm",
        headers=headers(),
        json={"selected_length": "short"},
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["draft"]["status"] == "confirmed"
    assert confirmed.json()["draft"]["send_status"] == "not_sent"
    assert confirmed.json()["draft"]["selected_length"] == "short"
