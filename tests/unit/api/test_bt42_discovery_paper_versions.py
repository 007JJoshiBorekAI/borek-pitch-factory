"""BT-42 Discovery Paper drafts, approval, and immutable versions."""

from __future__ import annotations

import copy
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from app.auth import create_test_access_token
from app.config import settings
from app.main import create_app
from app.services.data.memory_store import get_memory_store, reset_memory_store
from app.services.data.supabase_store import SupabaseDataStore
from app.services.discovery_paper import approve_discovery_paper, edit_discovery_paper
from services.framework.discovery_paper import build_discovery_paper, render_page

OWNER = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
ROOT = Path(__file__).resolve().parents[3]


def headers() -> dict[str, str]:
    return {
        "Authorization": "Bearer "
        + create_test_access_token(
            user_id=OWNER,
            email="sales@example.com",
            secret=settings.SUPABASE_JWT_SECRET,
        )
    }


def create_payload() -> dict:
    return {
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


def _generate(client: TestClient, opportunity_id: str) -> dict:
    response = client.post(
        f"/opportunities/{opportunity_id}/discovery-paper/generate",
        headers=headers(),
    )
    assert response.status_code == 200, response.text
    return response.json()


def _versions(client: TestClient, opportunity_id: str) -> list[dict]:
    response = client.get(
        f"/opportunities/{opportunity_id}/discovery-paper/versions",
        headers=headers(),
    )
    assert response.status_code == 200, response.text
    return response.json()["versions"]


def _version(client: TestClient, opportunity_id: str, version_id: str) -> dict:
    response = client.get(
        f"/opportunities/{opportunity_id}/discovery-paper/versions/{version_id}",
        headers=headers(),
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_draft_edit_approve_and_later_draft_keep_approved_history() -> None:
    reset_memory_store()
    with TestClient(create_app()) as client:
        created = client.post("/opportunities", headers=headers(), json=create_payload())
        opportunity_id = created.json()["id"]
        first = _generate(client, opportunity_id)
        versions = _versions(client, opportunity_id)
        assert [row["version_number"] for row in versions] == [1]
        assert versions[0]["status"] == "draft"
        assert versions[0]["document_id"] == first["document_id"]
        draft_id = versions[0]["id"]
        stored_draft = _version(client, opportunity_id, draft_id)
        assert stored_draft["paper_json"] == first

        cover = copy.deepcopy(first["pages"][0]["content"])
        cover["client_name"] = "Edited Northwind"
        untouched_statement = first["pages"][2]["content"]["statement"]
        edited = client.patch(
            f"/opportunities/{opportunity_id}/discovery-paper",
            headers=headers(),
            json={"expected_document_id": first["document_id"], "pages": [{"key": "cover", "content": cover}]},
        )
        assert edited.status_code == 200, edited.text
        paper = edited.json()
        assert paper["pages"][0]["content"]["client_name"] == "Edited Northwind"
        assert paper["pages"][2]["content"]["statement"] == untouched_statement
        assert paper["document_id"] == first["document_id"]
        assert paper["generated_at"] == first["generated_at"]
        assert paper["latest_approved_version_id"] is None
        assert [page["key"] for page in paper["pages"]] == [page["key"] for page in first["pages"]]
        assert [page["status"] for page in paper["pages"]] == ["ready"] * 7
        updated_draft = _version(client, opportunity_id, draft_id)
        assert updated_draft["version_number"] == 1
        assert updated_draft["paper_json"] == paper
        assert _versions(client, opportunity_id)[0]["id"] == draft_id

        approved = client.post(
            f"/opportunities/{opportunity_id}/discovery-paper/approve",
            headers=headers(),
        )
        assert approved.status_code == 200, approved.text
        assert approved.json()["id"] == draft_id
        assert approved.json()["status"] == "approved"
        working = client.get(
            f"/opportunities/{opportunity_id}/discovery-paper",
            headers=headers(),
        ).json()
        approved_row = _version(client, opportunity_id, draft_id)
        assert working["latest_approved_version_id"] == draft_id
        assert approved_row["paper_json"] == working
        approved_snapshot = copy.deepcopy(approved_row["paper_json"])

        with pytest.raises(Exception, match="immutable"):
            get_memory_store().update_discovery_paper_draft(
                version_id=UUID(draft_id),
                user_id=OWNER,
                paper_json=working,
            )
        with pytest.raises(Exception, match="immutable"):
            get_memory_store().approve_discovery_paper_version(
                version_id=UUID(draft_id),
                user_id=OWNER,
                paper_json=working,
            )

        revised = copy.deepcopy(working["pages"][0]["content"])
        revised["client_name"] = "After approval"
        after = client.patch(
            f"/opportunities/{opportunity_id}/discovery-paper",
            headers=headers(),
            json={"pages": [{"key": "cover", "content": revised}]},
        )
        assert after.status_code == 200, after.text
        assert after.json()["pages"][0]["content"]["client_name"] == "After approval"
        assert after.json()["latest_approved_version_id"] == draft_id
        assert _version(client, opportunity_id, draft_id)["paper_json"] == approved_snapshot
        forked = _versions(client, opportunity_id)
        assert [row["version_number"] for row in forked] == [1, 2]
        assert forked[0]["status"] == "approved"
        assert forked[1]["status"] == "draft"
        edit_draft_id = forked[1]["id"]
        assert _version(client, opportunity_id, edit_draft_id)["paper_json"] == after.json()

        second = _generate(client, opportunity_id)
        assert second["document_id"] != first["document_id"]
        assert second["latest_approved_version_id"] == draft_id
        versions = _versions(client, opportunity_id)
        assert [row["version_number"] for row in versions] == [1, 2, 3]
        assert len({row["version_number"] for row in versions}) == 3
        assert versions[0]["status"] == "approved"
        assert versions[1]["id"] == edit_draft_id
        assert versions[2]["status"] == "draft"
        assert versions[2]["document_id"] == second["document_id"]
        assert _version(client, opportunity_id, draft_id)["paper_json"] == approved_snapshot
        assert (
            _version(client, opportunity_id, edit_draft_id)["paper_json"]["pages"][0]["content"][
                "client_name"
            ]
            == "After approval"
        )
        latest = client.get(
            f"/opportunities/{opportunity_id}/discovery-paper/approved",
            headers=headers(),
        )
        assert latest.status_code == 200, latest.text
        assert latest.json()["id"] == draft_id

        pilot = {
            "concept": "A revised discovery pilot focused on the first meeting.",
            "commercial_terms": "not_included",
            "origin": "GROUNDED_TEMPLATE",
        }
        revised_draft = client.patch(
            f"/opportunities/{opportunity_id}/discovery-paper",
            headers=headers(),
            json={"pages": [{"key": "pilot_proposal", "content": pilot}]},
        )
        assert revised_draft.status_code == 200, revised_draft.text
        second_id = versions[2]["id"]
        assert [row["version_number"] for row in _versions(client, opportunity_id)] == [1, 2, 3]
        assert _version(client, opportunity_id, second_id)["paper_json"]["pages"][5]["content"] == pilot
        assert _version(client, opportunity_id, draft_id)["paper_json"] == approved_snapshot

        second_approval = client.post(
            f"/opportunities/{opportunity_id}/discovery-paper/approve",
            headers=headers(),
        )
        assert second_approval.status_code == 200, second_approval.text
        assert second_approval.json()["id"] == second_id
        current = client.get(
            f"/opportunities/{opportunity_id}/discovery-paper",
            headers=headers(),
        ).json()
        assert current["latest_approved_version_id"] == second_id
        assert _version(client, opportunity_id, second_id)["paper_json"] == current
        assert _version(client, opportunity_id, draft_id)["paper_json"] == approved_snapshot
        assert client.get(
            f"/opportunities/{opportunity_id}/discovery-paper/approved",
            headers=headers(),
        ).json()["id"] == second_id

        logs = get_memory_store().list_audit_logs(actor_id=OWNER)
        edits = [row for row in logs if row["action"] == "discovery_paper.edit"]
        approvals = [row for row in logs if row["action"] == "discovery_paper.approve"]
        assert edits
        assert {row["object_id"] for row in edits + approvals} == {UUID(opportunity_id)}
        assert any(row["document_id"] == f"{first['document_id']}:{draft_id}" for row in edits)
        assert approvals[0]["document_id"] == f"{first['document_id']}:{draft_id}"
        assert approvals[1]["document_id"] == f"{second['document_id']}:{second_id}"
        assert "EUR" not in str(approvals)


def test_edit_after_approval_forks_one_draft_then_approval_moves_the_pointer() -> None:
    reset_memory_store()
    with TestClient(create_app()) as client:
        created = client.post("/opportunities", headers=headers(), json=create_payload())
        opportunity_id = created.json()["id"]
        _generate(client, opportunity_id)
        approved = client.post(
            f"/opportunities/{opportunity_id}/discovery-paper/approve",
            headers=headers(),
        )
        assert approved.status_code == 200, approved.text
        v1_id = approved.json()["id"]
        approved_snapshot = copy.deepcopy(_version(client, opportunity_id, v1_id)["paper_json"])
        working = client.get(
            f"/opportunities/{opportunity_id}/discovery-paper",
            headers=headers(),
        ).json()

        first_cover = copy.deepcopy(working["pages"][0]["content"])
        first_cover["client_name"] = "First post-approval edit"
        first = client.patch(
            f"/opportunities/{opportunity_id}/discovery-paper",
            headers=headers(),
            json={"pages": [{"key": "cover", "content": first_cover}]},
        )
        assert first.status_code == 200, first.text
        versions = _versions(client, opportunity_id)
        assert [row["version_number"] for row in versions] == [1, 2]
        assert versions[0]["id"] == v1_id
        assert versions[0]["status"] == "approved"
        assert versions[1]["status"] == "draft"
        v2_id = versions[1]["id"]
        assert first.json()["latest_approved_version_id"] == v1_id
        assert _version(client, opportunity_id, v1_id)["paper_json"] == approved_snapshot
        assert _version(client, opportunity_id, v2_id)["paper_json"] == first.json()

        second_cover = copy.deepcopy(first.json()["pages"][0]["content"])
        second_cover["client_name"] = "Second post-approval edit"
        second = client.patch(
            f"/opportunities/{opportunity_id}/discovery-paper",
            headers=headers(),
            json={"pages": [{"key": "cover", "content": second_cover}]},
        )
        assert second.status_code == 200, second.text
        assert [row["version_number"] for row in _versions(client, opportunity_id)] == [1, 2]
        assert _version(client, opportunity_id, v2_id)["paper_json"] == second.json()
        assert _version(client, opportunity_id, v1_id)["paper_json"] == approved_snapshot
        assert second.json()["latest_approved_version_id"] == v1_id

        moved = client.post(
            f"/opportunities/{opportunity_id}/discovery-paper/approve",
            headers=headers(),
        )
        assert moved.status_code == 200, moved.text
        assert moved.json()["id"] == v2_id
        assert moved.json()["status"] == "approved"
        current = client.get(
            f"/opportunities/{opportunity_id}/discovery-paper",
            headers=headers(),
        ).json()
        assert current["latest_approved_version_id"] == v2_id
        assert _version(client, opportunity_id, v2_id)["paper_json"] == current
        assert _version(client, opportunity_id, v1_id)["paper_json"] == approved_snapshot


def test_invalid_edits_and_unready_approval_are_rejected(monkeypatch) -> None:
    reset_memory_store()
    with TestClient(create_app()) as client:
        created = client.post("/opportunities", headers=headers(), json=create_payload())
        opportunity_id = created.json()["id"]
        unready = client.post(
            f"/opportunities/{opportunity_id}/discovery-paper/approve",
            headers=headers(),
        )
        assert unready.status_code == 400
        assert unready.json()["error"]["code"] == "DISCOVERY_PAPER_NOT_GENERATED"

        paper = _generate(client, opportunity_id)
        forbidden = client.patch(
            f"/opportunities/{opportunity_id}/discovery-paper",
            headers=headers(),
            json={
                "document_id": str(uuid4()),
                "pages": [{"key": "cover", "content": paper["pages"][0]["content"], "status": "failed"}],
            },
        )
        assert forbidden.status_code == 422
        stale = client.patch(
            f"/opportunities/{opportunity_id}/discovery-paper",
            headers=headers(),
            json={
                "expected_document_id": str(uuid4()),
                "pages": [{"key": "cover", "content": paper["pages"][0]["content"]}],
            },
        )
        assert stale.status_code == 409
        assert stale.json()["error"]["code"] == "DISCOVERY_PAPER_STALE"
        priced = copy.deepcopy(paper["pages"][5]["content"])
        priced["concept"] = "A pilot for EUR 1000 per day."
        rejected = client.patch(
            f"/opportunities/{opportunity_id}/discovery-paper",
            headers=headers(),
            json={"pages": [{"key": "pilot_proposal", "content": priced}]},
        )
        assert rejected.status_code == 400
        assert rejected.json()["error"]["code"] == "DISCOVERY_PAPER_INVALID"
        assert client.get(
            f"/opportunities/{opportunity_id}/discovery-paper",
            headers=headers(),
        ).json()["pages"][5]["content"]["concept"] == paper["pages"][5]["content"]["concept"]

    reset_memory_store()

    def fail_page(key: str, **kwargs):
        if key == "relevant_use_case":
            raise RuntimeError("page five failed")
        return render_page(key, **kwargs)

    monkeypatch.setattr("services.framework.discovery_paper.render_page", fail_page)
    with TestClient(create_app()) as client:
        created = client.post("/opportunities", headers=headers(), json=create_payload())
        opportunity_id = created.json()["id"]
        generated = client.post(
            f"/opportunities/{opportunity_id}/discovery-paper/generate",
            headers=headers(),
        )
        assert generated.status_code == 400
        assert _versions(client, opportunity_id) == []
        blocked = client.post(
            f"/opportunities/{opportunity_id}/discovery-paper/approve",
            headers=headers(),
        )
        assert blocked.status_code == 400
        assert blocked.json()["error"]["code"] == "DISCOVERY_PAPER_NOT_READY"


def test_supabase_drafts_update_and_approved_rows_stay_immutable(monkeypatch) -> None:
    tables: dict[str, list[dict]] = {"opportunities": [], "discovery_paper_versions": []}

    def request(self, method, table, *, json_body=None, params=None):
        rows = tables.setdefault(table, [])
        params = params or {}
        if method == "POST":
            row = copy.deepcopy(json_body)
            row.setdefault("id", str(uuid4()))
            row.setdefault("created_at", datetime.now(UTC).isoformat())
            row.setdefault("updated_at", row["created_at"])
            rows.append(row)
            return httpx.Response(201, json=[copy.deepcopy(row)])
        matched = [
            row
            for row in rows
            if all(_matches(row, key, value) for key, value in params.items() if key not in {"select", "order", "limit"})
        ]
        if "order" in params and "version_number.desc" in params["order"]:
            matched = sorted(matched, key=lambda row: int(row["version_number"]), reverse=True)
        elif "order" in params and "approved_at.desc" in params["order"]:
            matched = sorted(matched, key=lambda row: str(row.get("approved_at") or ""), reverse=True)
        else:
            matched = sorted(matched, key=lambda row: int(row.get("version_number") or 0))
        if params.get("limit") == "1":
            matched = matched[:1]
        if method == "GET":
            return httpx.Response(200, json=[copy.deepcopy(row) for row in matched])
        if method == "PATCH":
            if not matched or matched[0].get("status") == "approved":
                return httpx.Response(200, json=[])
            matched[0].update(copy.deepcopy(json_body))
            return httpx.Response(200, json=[copy.deepcopy(matched[0])])
        raise AssertionError(method)

    monkeypatch.setattr(SupabaseDataStore, "_request", request)
    store = SupabaseDataStore("test-token")
    created = store.create_opportunity(
        user_id=OWNER,
        client_name="Northwind",
        opportunity_name="Quarterly title",
        department="Sales",
        language="en",
    )
    original = {"schema_version": "1.0", "status": "ready", "label": "v1"}
    draft = store.create_discovery_paper_version(
        opportunity_id=created["id"],
        user_id=OWNER,
        document_id=UUID("22222222-2222-4222-8222-222222222222"),
        paper_json=original,
    )
    assert draft["version_number"] == 1
    assert draft["status"] == "draft"
    edited = {"schema_version": "1.0", "status": "ready", "label": "edited"}
    updated = store.update_discovery_paper_draft(
        version_id=draft["id"],
        user_id=OWNER,
        paper_json=edited,
    )
    assert updated["paper_json"]["label"] == "edited"
    approved_paper = {"schema_version": "1.0", "status": "ready", "label": "approved"}
    approved = store.approve_discovery_paper_version(
        version_id=draft["id"],
        user_id=OWNER,
        paper_json=approved_paper,
    )
    assert approved["status"] == "approved"
    assert approved["approved_at"] is not None
    with pytest.raises(Exception, match="immutable"):
        store.update_discovery_paper_draft(
            version_id=draft["id"],
            user_id=OWNER,
            paper_json={"schema_version": "1.0", "label": "mutated"},
        )
    loaded = store.get_discovery_paper_version(version_id=draft["id"], user_id=OWNER)
    assert loaded["paper_json"]["label"] == "approved"
    assert loaded["status"] == "approved"
    latest = store.get_latest_approved_discovery_paper(
        opportunity_id=created["id"],
        user_id=OWNER,
    )
    assert latest is not None
    assert latest["id"] == draft["id"]
    successor = store.create_discovery_paper_version(
        opportunity_id=created["id"],
        user_id=OWNER,
        document_id=UUID("33333333-3333-4333-8333-333333333333"),
        paper_json={"schema_version": "1.0", "label": "v2"},
    )
    assert successor["version_number"] == 2
    assert store.get_discovery_paper_version(version_id=draft["id"], user_id=OWNER)["paper_json"]["label"] == "approved"


def test_supabase_edit_after_approval_forks_one_draft(monkeypatch) -> None:
    store = _supabase_store(monkeypatch)
    created = store.create_opportunity(
        user_id=OWNER,
        client_name="Northwind",
        opportunity_name="Quarterly title",
        department="Sales",
        language="en",
        stage1_intake={
            "sales_topic_description": "Warehouse slotting review",
            "about_company": "Family-owned distributor in Hamburg.",
        },
    )
    paper = build_discovery_paper(
        {
            "id": str(created["id"]),
            "client_name": "Northwind",
            "opportunity_name": "Quarterly title",
            "stage1_intake": {
                "sales_topic_description": "Warehouse slotting review",
                "about_company": "Family-owned distributor in Hamburg.",
            },
        },
        document_id="22222222-2222-4222-8222-222222222222",
        generated_at="2026-10-05T08:00:00Z",
    )
    store.update_opportunity(
        opportunity_id=created["id"],
        user_id=OWNER,
        updates={"discovery_paper": paper},
    )
    store.create_discovery_paper_version(
        opportunity_id=created["id"],
        user_id=OWNER,
        document_id=UUID(paper["document_id"]),
        paper_json=paper,
    )
    approved = approve_discovery_paper(
        store,
        opportunity_id=created["id"],
        user_id=OWNER,
    )
    v1_id = UUID(approved["id"])
    approved_snapshot = copy.deepcopy(
        store.get_discovery_paper_version(version_id=v1_id, user_id=OWNER)["paper_json"]
    )
    cover = copy.deepcopy(paper["pages"][0]["content"])
    cover["client_name"] = "First post-approval edit"
    first, first_version_id = edit_discovery_paper(
        store,
        opportunity_id=created["id"],
        user_id=OWNER,
        pages=[{"key": "cover", "content": cover}],
    )
    versions = store.list_discovery_paper_versions(opportunity_id=created["id"], user_id=OWNER)
    assert [row["version_number"] for row in versions] == [1, 2]
    assert versions[1]["id"] == first_version_id
    assert versions[1]["status"] == "draft"
    assert first["latest_approved_version_id"] == str(v1_id)
    assert versions[1]["paper_json"] == first
    assert store.get_discovery_paper_version(version_id=v1_id, user_id=OWNER)["paper_json"] == approved_snapshot

    cover["client_name"] = "Second post-approval edit"
    _second, second_version_id = edit_discovery_paper(
        store,
        opportunity_id=created["id"],
        user_id=OWNER,
        pages=[{"key": "cover", "content": cover}],
    )
    assert second_version_id == first_version_id
    versions = store.list_discovery_paper_versions(opportunity_id=created["id"], user_id=OWNER)
    assert [row["version_number"] for row in versions] == [1, 2]
    assert versions[1]["paper_json"]["pages"][0]["content"]["client_name"] == "Second post-approval edit"
    assert store.get_discovery_paper_version(version_id=v1_id, user_id=OWNER)["paper_json"] == approved_snapshot

    moved = approve_discovery_paper(store, opportunity_id=created["id"], user_id=OWNER)
    assert moved["id"] == str(first_version_id)
    assert moved["status"] == "approved"
    working = store.get_opportunity(opportunity_id=created["id"], user_id=OWNER)["discovery_paper"]
    assert working["latest_approved_version_id"] == str(first_version_id)
    assert store.get_discovery_paper_version(version_id=v1_id, user_id=OWNER)["paper_json"] == approved_snapshot

    regenerated = store.create_discovery_paper_version(
        opportunity_id=created["id"],
        user_id=OWNER,
        document_id=UUID("33333333-3333-4333-8333-333333333333"),
        paper_json=paper,
    )
    assert regenerated["version_number"] == 3
    numbers = [
        row["version_number"]
        for row in store.list_discovery_paper_versions(opportunity_id=created["id"], user_id=OWNER)
    ]
    assert numbers == [1, 2, 3]


def test_bt42_does_not_gate_presentation_generation() -> None:
    source = (ROOT / "apps/services/api/app/services/presentation_generation.py").read_text(encoding="utf-8")
    assert "discovery_paper" not in source


def _supabase_store(monkeypatch) -> SupabaseDataStore:
    tables: dict[str, list[dict]] = {"opportunities": [], "discovery_paper_versions": []}

    def request(self, method, table, *, json_body=None, params=None):
        rows = tables.setdefault(table, [])
        params = params or {}
        if method == "POST":
            row = copy.deepcopy(json_body)
            row.setdefault("id", str(uuid4()))
            row.setdefault("created_at", datetime.now(UTC).isoformat())
            row.setdefault("updated_at", row["created_at"])
            rows.append(row)
            return httpx.Response(201, json=[copy.deepcopy(row)])
        matched = [
            row
            for row in rows
            if all(
                _matches(row, key, value)
                for key, value in params.items()
                if key not in {"select", "order", "limit"}
            )
        ]
        if "order" in params and "version_number.desc" in params["order"]:
            matched = sorted(matched, key=lambda row: int(row["version_number"]), reverse=True)
        elif "order" in params and "approved_at.desc" in params["order"]:
            matched = sorted(matched, key=lambda row: str(row.get("approved_at") or ""), reverse=True)
        else:
            matched = sorted(matched, key=lambda row: int(row.get("version_number") or 0))
        if params.get("limit") == "1":
            matched = matched[:1]
        if method == "GET":
            return httpx.Response(200, json=[copy.deepcopy(row) for row in matched])
        if method == "PATCH":
            if not matched or matched[0].get("status") == "approved":
                return httpx.Response(200, json=[])
            matched[0].update(copy.deepcopy(json_body))
            return httpx.Response(200, json=[copy.deepcopy(matched[0])])
        raise AssertionError(method)

    monkeypatch.setattr(SupabaseDataStore, "_request", request)
    return SupabaseDataStore("test-token")


def _matches(row: dict, key: str, value: str) -> bool:
    if not value.startswith("eq."):
        return True
    return str(row.get(key)) == value.removeprefix("eq.")
