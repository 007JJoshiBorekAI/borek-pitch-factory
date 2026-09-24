"""AT-40: opportunity endpoint unit tests."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.auth import create_test_access_token
from app.config import settings
from app.main import create_app

USER_ID = uuid.UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")


def _client() -> TestClient:
    return TestClient(create_app())


def _headers(user_id: uuid.UUID = USER_ID) -> dict[str, str]:
    token = create_test_access_token(
        user_id=user_id,
        email="owner@example.com",
        secret=settings.SUPABASE_JWT_SECRET,
    )
    return {"Authorization": f"Bearer {token}"}


def _create_opportunity(client: TestClient) -> str:
    response = client.post(
        "/opportunities",
        headers=_headers(),
        json={
            "client_name": "Acme Corp",
            "opportunity_name": "Invoice Automation",
            "department": "Finance",
            "language": "en",
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_create_and_get_opportunity() -> None:
    client = _client()
    opportunity_id = _create_opportunity(client)

    response = client.get(f"/opportunities/{opportunity_id}", headers=_headers())
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == opportunity_id
    assert body["client_name"] == "Acme Corp"
    assert body["created_by"] == str(USER_ID)
    assert body["pitch_owner"] == {
        "source": "employee",
        "employee_id": str(USER_ID),
    }


def test_create_persists_pitch_fields_and_mixed_people() -> None:
    client = _client()
    response = client.post(
        "/opportunities",
        headers=_headers(),
        json={
            "client_name": "Acme Corp",
            "opportunity_name": "Invoice Automation",
            "department": "Finance",
            "service_solution": "Managed invoice operations",
            "business_need": "Reduce manual matching",
            "pitch_description": "Prepare a focused pilot",
            "email_sender_profile": {
                "name": "Lena Hoffmann",
                "role": "Project Lead",
                "email": "lena@borek.example",
            },
            "stage1_intake": {
                "poc_name": "Mira Koch",
                "poc_email": "mira@acme.example",
            },
            "pitch_owner": {"source": "manual", "name": "External Lead"},
            "team_members": [
                {"source": "employee", "employee_id": str(USER_ID)},
                {"source": "manual", "name": "Guest Specialist"},
            ],
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["service_solution"] == "Managed invoice operations"
    assert body["business_need"] == "Reduce manual matching"
    assert body["pitch_description"] == "Prepare a focused pilot"
    assert body["stage1_intake"]["poc_email"] == "mira@acme.example"
    assert body["email_sender_profile"]["email"] == "lena@borek.example"
    assert body["pitch_owner"] == {"source": "manual", "name": "External Lead"}
    assert body["team_members"][1] == {
        "source": "manual",
        "name": "Guest Specialist",
    }


def test_list_opportunities_scoped_to_user() -> None:
    client = _client()
    _create_opportunity(client)

    other_user = uuid.UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
    response = client.get("/opportunities", headers=_headers(other_user))
    assert response.status_code == 200
    assert response.json() == []


def test_update_opportunity() -> None:
    client = _client()
    opportunity_id = _create_opportunity(client)

    response = client.patch(
        f"/opportunities/{opportunity_id}",
        headers=_headers(),
        json={"opportunity_name": "Updated Name"},
    )
    assert response.status_code == 200
    assert response.json()["opportunity_name"] == "Updated Name"


def test_get_missing_opportunity_returns_404() -> None:
    client = _client()
    missing_id = "00000000-0000-4000-8000-000000000099"
    response = client.get(f"/opportunities/{missing_id}", headers=_headers())
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "OPPORTUNITY_NOT_FOUND"
