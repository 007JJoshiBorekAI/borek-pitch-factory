"""BT-35 First contact document -> research integration (fixture-backed)."""

from __future__ import annotations

from uuid import UUID

from fastapi.testclient import TestClient

from app.auth import create_test_access_token
from app.config import settings
from app.main import create_app
from services.framework.stage1_research import validate_research

OWNER = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")


def test_first_contact_document_and_intake_drive_research_without_transcript():
    token = create_test_access_token(
        user_id=OWNER,
        email="sales@example.com",
        secret=settings.SUPABASE_JWT_SECRET,
    )
    headers = {"Authorization": f"Bearer {token}"}
    app = create_app()
    with TestClient(app) as client:
        created = client.post(
            "/opportunities",
            headers=headers,
            json={
                "client_name": "Acme",
                "opportunity_name": "Invoice matching",
                "department": "Finance",
                "stage1_intake": {
                    "sales_topic_description": "Explore invoice matching",
                    "about_company": "Sales description",
                },
            },
        )
        assert created.status_code == 201
        opportunity_id = created.json()["id"]

        blocked = client.post(
            f"/opportunities/{opportunity_id}/stage1-research",
            headers=headers,
        )
        assert blocked.status_code == 400
        assert blocked.json()["error"]["code"] == "CLIENT_DOCUMENT_REQUIRED"

        upload = client.post(
            f"/opportunities/{opportunity_id}/client-documents",
            headers=headers,
            files={"file": ("brief.txt", b"Client annual report excerpt.", "text/plain")},
        )
        assert upload.status_code == 201

        research = client.post(
            f"/opportunities/{opportunity_id}/stage1-research",
            headers=headers,
        )
        assert research.status_code == 200
        payload = research.json()
        validate_research(payload)
        assert payload["user_statements"]["client_documents"][0]["document_key"] == "D1"
