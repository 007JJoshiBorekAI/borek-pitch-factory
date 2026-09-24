"""D3: employee login session, role model, and activity log."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.auth import create_test_access_token
from app.config import settings
from app.main import create_app
from app.services.audit.audit_log import AuditAction
from app.services.data.memory_store import get_memory_store

USER_A = uuid.UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
USER_B = uuid.UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")


def _client() -> TestClient:
    return TestClient(create_app())


def _headers(user_id: uuid.UUID, email: str) -> dict[str, str]:
    token = create_test_access_token(
        user_id=user_id,
        email=email,
        secret=settings.SUPABASE_JWT_SECRET,
    )
    return {"Authorization": f"Bearer {token}"}


def test_first_memory_user_is_admin_and_session_is_audited() -> None:
    client = _client()
    headers = _headers(USER_A, "a@borek.test")
    me = client.get("/employees/me", headers=headers)
    assert me.status_code == 200
    body = me.json()
    assert body["role"] == "admin"
    assert body["capabilities"]["confirm"] is True
    assert body["capabilities"]["assign_roles"] is True

    session = client.post("/employees/session", headers=headers)
    assert session.status_code == 200
    logs = get_memory_store().list_audit_logs(actor_id=USER_A)
    assert logs[-1]["action"] == AuditAction.AUTH_LOGIN.value
    assert logs[-1]["document_id"] == "a@borek.test"
    assert logs[-1]["actor_email"] == "a@borek.test"


def test_consultant_cannot_confirm_framework() -> None:
    client = _client()
    headers = _headers(USER_A, "consultant@borek.test")
    get_memory_store().set_user_role(
        user_id=USER_A,
        email="consultant@borek.test",
        role="consultant",
    )
    created = client.post(
        "/opportunities",
        headers=headers,
        json={
            "client_name": "Role Corp",
            "opportunity_name": "Role Check",
            "department": "Ops",
            "language": "en",
        },
    )
    assert created.status_code == 201
    opportunity_id = created.json()["id"]
    generate = client.post(
        f"/opportunities/{opportunity_id}/framework/generate",
        headers=headers,
    )
    assert generate.status_code == 202
    latest = client.get(f"/opportunities/{opportunity_id}/framework", headers=headers)
    confirm = client.post(
        f"/opportunities/{opportunity_id}/framework/confirm",
        headers=headers,
        json={"framework_version_id": latest.json()["id"]},
    )
    assert confirm.status_code == 403
    assert confirm.json()["error"]["code"] == "INSUFFICIENT_ROLE"


def test_admin_assigns_role_and_lists_activity() -> None:
    client = _client()
    admin_headers = _headers(USER_A, "admin@borek.test")
    client.get("/employees/me", headers=admin_headers)
    assigned = client.patch(
        f"/employees/{USER_B}/role",
        headers=admin_headers,
        json={"role": "reviewer", "email": "reviewer@borek.test"},
    )
    assert assigned.status_code == 200
    assert assigned.json()["role"] == "reviewer"

    listed = client.get("/employees", headers=admin_headers)
    assert listed.status_code == 200
    emails = {row["email"] for row in listed.json()}
    assert "reviewer@borek.test" in emails

    activity = client.get("/employees/activity", headers=admin_headers)
    assert activity.status_code == 200
    actions = {row["action"] for row in activity.json()}
    assert AuditAction.ROLE_ASSIGN.value in actions


def test_non_admin_cannot_assign_roles() -> None:
    client = _client()
    headers = _headers(USER_A, "consultant@borek.test")
    get_memory_store().set_user_role(
        user_id=USER_A,
        email="consultant@borek.test",
        role="consultant",
    )
    denied = client.patch(
        f"/employees/{USER_B}/role",
        headers=headers,
        json={"role": "admin", "email": "other@borek.test"},
    )
    assert denied.status_code == 403


def test_consultant_can_read_employee_selector() -> None:
    client = _client()
    get_memory_store().set_user_role(
        user_id=USER_A,
        email="consultant@borek.test",
        role="consultant",
    )
    get_memory_store().set_user_role(
        user_id=USER_B,
        email="teammate@borek.test",
        role="reviewer",
    )
    listed = client.get(
        "/employees",
        headers=_headers(USER_A, "consultant@borek.test"),
    )
    assert listed.status_code == 200
    assert {row["email"] for row in listed.json()} >= {
        "consultant@borek.test",
        "teammate@borek.test",
    }
