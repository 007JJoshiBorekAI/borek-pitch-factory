"""BT-47: eight-step workflow status and separate Discovery / PPT lineage."""

from __future__ import annotations

import copy
import io
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import create_test_access_token
from app.config import settings
from app.main import create_app
from app.schemas.journey_stage import JOURNEY_STAGES
from app.services.data.memory_store import get_memory_store, reset_memory_store
from app.services.journey_stage import evaluate_opportunity_eligibility, resolve_requested_journey_stage

OWNER = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
INTAKE = {
    "client_web_page": "https://northwind.example",
    "poc_name": "Ada Lovelace",
    "poc_position": "Operations",
    "sales_topic_description": "Warehouse slotting review",
    "about_company": "Family-owned distributor in Hamburg.",
}
STEP_KEYS = [
    "client_information",
    "discovery_prepared",
    "ppt1_ready",
    "first_meeting_completed",
    "transcript_added",
    "ppt2_generated",
    "owner_review",
    "finalized",
]


def headers() -> dict[str, str]:
    return {
        "Authorization": "Bearer "
        + create_test_access_token(
            user_id=OWNER,
            email="sales@example.com",
            secret=settings.SUPABASE_JWT_SECRET,
        )
    }


def create_opportunity(client: TestClient, *, intake: dict | None = None) -> str:
    body = {
        "client_name": "Northwind",
        "opportunity_name": "Quarterly title",
        "department": "Sales",
    }
    if intake is not None:
        body["stage1_intake"] = intake
    response = client.post("/opportunities", headers=headers(), json=body)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def status_of(client: TestClient, opportunity_id: str) -> dict:
    response = client.get(f"/opportunities/{opportunity_id}/workflow-status", headers=headers())
    assert response.status_code == 200, response.text
    body = response.json()
    assert [step["key"] for step in body["steps"]] == STEP_KEYS
    return body


def step(body: dict, key: str) -> dict:
    return next(item for item in body["steps"] if item["key"] == key)


def seed_deck(
    opportunity_id: str,
    *,
    journey_stage: str,
    status: str,
    version_number: int = 1,
    presentation_id: UUID | None = None,
) -> tuple[UUID, UUID]:
    store = get_memory_store()
    now = datetime.now(UTC)
    framework_id = uuid4()
    plan_id = uuid4()
    presentation_id = presentation_id or uuid4()
    version_id = uuid4()
    store.framework_versions[framework_id] = {
        "id": framework_id,
        "opportunity_id": UUID(opportunity_id),
        "framework_json": {"status": "confirmed"},
        "status": "confirmed",
        "version_number": 1,
        "created_at": now,
    }
    store.presentation_plans[plan_id] = {
        "id": plan_id,
        "framework_version_id": framework_id,
        "plan_json": {"title": journey_stage},
        "created_at": now,
    }
    store.presentations[presentation_id] = {
        "id": presentation_id,
        "presentation_plan_id": plan_id,
        "name": journey_stage,
        "status": "draft",
        "created_at": now,
    }
    store.presentation_versions[version_id] = {
        "id": version_id,
        "presentation_id": presentation_id,
        "version_number": version_number,
        "slides_json": [{"marker": journey_stage, "version": version_number}],
        "status": status,
        "journey_stage": journey_stage,
        "created_at": now,
    }
    return presentation_id, version_id


def approve_discovery(client: TestClient, opportunity_id: str) -> str:
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
    return approved.json()["id"]


def point_stage1(opportunity_id: str, presentation_id: UUID, *, presentation_status: str) -> None:
    get_memory_store().opportunities[UUID(opportunity_id)]["stage1_outputs"] = {
        "schema_version": "1.0",
        "opportunity_id": opportunity_id,
        "status": "ready",
        "outputs": {
            "presentation": {
                "status": presentation_status,
                "profile": "first_meeting_3",
                "code": None,
                "presentation_id": str(presentation_id),
                "download_url": None,
            }
        },
    }


def test_new_opportunity_starts_at_client_information_until_intake_is_saved() -> None:
    reset_memory_store()
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client)
    body = status_of(client, opportunity_id)
    assert body["current_status"] == "client_information"
    assert step(body, "client_information")["state"] == "current"
    assert step(body, "discovery_prepared")["state"] == "pending"
    assert body["documents"]["discovery_draft"] is None
    assert body["documents"]["ppt1"] is None
    assert body["documents"]["ppt2"] is None
    assert "about_company" not in str(step(body, "client_information")["evidence"])

    saved = client.patch(
        f"/opportunities/{opportunity_id}",
        headers=headers(),
        json={"stage1_intake": INTAKE},
    )
    assert saved.status_code == 200, saved.text
    advanced = status_of(client, opportunity_id)
    assert step(advanced, "client_information")["state"] == "completed"
    assert advanced["current_status"] == "discovery_prepared"
    assert step(advanced, "client_information")["evidence"] == {"opportunity_id": opportunity_id}
    assert INTAKE["about_company"] not in str(advanced)


def test_approved_discovery_completes_preparation_and_keeps_a_later_draft() -> None:
    reset_memory_store()
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client, intake=INTAKE)
    generated = client.post(
        f"/opportunities/{opportunity_id}/discovery-paper/generate",
        headers=headers(),
    )
    assert generated.status_code == 200, generated.text
    drafted = status_of(client, opportunity_id)
    assert drafted["current_status"] == "discovery_prepared"
    assert step(drafted, "discovery_prepared")["state"] == "current"
    assert drafted["documents"]["approved_discovery"] is None
    assert drafted["documents"]["discovery_draft"]["status"] == "draft"
    assert drafted["documents"]["discovery_draft"]["document_id"] == generated.json()["document_id"]

    approved = client.post(
        f"/opportunities/{opportunity_id}/discovery-paper/approve",
        headers=headers(),
    )
    assert approved.status_code == 200, approved.text
    prepared = status_of(client, opportunity_id)
    assert step(prepared, "discovery_prepared")["state"] == "completed"
    assert prepared["current_status"] == "ppt1_ready"
    assert prepared["documents"]["approved_discovery"]["version_id"] == approved.json()["id"]
    assert prepared["documents"]["approved_discovery"]["version_number"] == 1
    assert prepared["documents"]["approved_discovery"]["document_id"] == generated.json()["document_id"]
    assert step(prepared, "discovery_prepared")["evidence"]["version_id"] == approved.json()["id"]
    assert prepared["documents"]["discovery_draft"]["differs_from_approved"] is False

    cover = copy.deepcopy(generated.json()["pages"][0]["content"])
    cover["client_name"] = "Draft After Approval"
    edited = client.patch(
        f"/opportunities/{opportunity_id}/discovery-paper",
        headers=headers(),
        json={"pages": [{"key": "cover", "content": cover}]},
    )
    assert edited.status_code == 200, edited.text
    later = status_of(client, opportunity_id)
    assert step(later, "discovery_prepared")["state"] == "completed"
    assert later["documents"]["approved_discovery"]["version_id"] == approved.json()["id"]
    assert later["documents"]["discovery_draft"]["status"] == "draft"
    assert later["documents"]["discovery_draft"]["differs_from_approved"] is True
    stored = get_memory_store().get_discovery_paper_version(
        version_id=UUID(approved.json()["id"]),
        user_id=OWNER,
    )
    assert stored["paper_json"]["pages"][0]["content"]["client_name"] != "Draft After Approval"


def test_ppt1_uses_stage1_identity_and_ppt2_stays_separate() -> None:
    reset_memory_store()
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client, intake=INTAKE)
    approve_discovery(client, opportunity_id)
    generic_id, generic_version = seed_deck(opportunity_id, journey_stage="first_contact", status="ready")
    ignored = status_of(client, opportunity_id)
    assert step(ignored, "ppt1_ready")["state"] != "completed"
    assert ignored["documents"]["ppt1"] is None

    ppt1_id, queued_version = seed_deck(opportunity_id, journey_stage="first_contact", status="generating")
    point_stage1(opportunity_id, ppt1_id, presentation_status="generating")
    queued = status_of(client, opportunity_id)
    assert step(queued, "ppt1_ready")["state"] == "current"
    assert queued["documents"]["ppt1"]["presentation_id"] == str(ppt1_id)
    assert queued["documents"]["ppt1"]["latest_ready_version_id"] is None
    assert queued["documents"]["ppt1"]["journey_stage"] == "first_contact"
    assert queued["documents"]["ppt1"]["presentation_id"] != str(generic_id)

    ready_version = uuid4()
    now = datetime.now(UTC)
    get_memory_store().presentation_versions[ready_version] = {
        "id": ready_version,
        "presentation_id": ppt1_id,
        "version_number": 2,
        "slides_json": [{"marker": "ppt1-v2"}],
        "status": "ready",
        "journey_stage": "first_contact",
        "created_at": now,
    }
    ready = status_of(client, opportunity_id)
    assert step(ready, "ppt1_ready")["state"] == "completed"
    assert ready["documents"]["ppt1"]["latest_ready_version_id"] == str(ready_version)
    assert ready["current_status"] == "first_meeting_completed"

    ppt2_id, ppt2_old = seed_deck(opportunity_id, journey_stage="post_meeting", status="generating")
    waiting = status_of(client, opportunity_id)
    assert step(waiting, "ppt2_generated")["state"] == "pending"
    assert waiting["documents"]["ppt2"]["presentation_id"] == str(ppt2_id)
    assert waiting["documents"]["ppt2"]["latest_ready_version_id"] is None
    assert waiting["documents"]["ppt2"]["journey_stage"] == "post_meeting"

    ppt2_ready = uuid4()
    get_memory_store().presentation_versions[ppt2_ready] = {
        "id": ppt2_ready,
        "presentation_id": ppt2_id,
        "version_number": 2,
        "slides_json": [{"marker": "ppt2-v2"}],
        "status": "ready",
        "journey_stage": "post_meeting",
        "created_at": now,
    }
    stage1_before = copy.deepcopy(
        get_memory_store().opportunities[UUID(opportunity_id)]["stage1_outputs"]
    )
    first_contact_before = copy.deepcopy(
        get_memory_store().presentation_versions[ready_version]
    )
    generated = status_of(client, opportunity_id)
    assert step(generated, "ppt2_generated")["state"] == "completed"
    assert generated["documents"]["ppt2"]["presentation_id"] == str(ppt2_id)
    assert generated["documents"]["ppt2"]["latest_ready_version_id"] == str(ppt2_ready)
    assert generated["documents"]["ppt1"]["presentation_id"] == str(ppt1_id)
    assert generated["documents"]["ppt1"]["presentation_id"] != generated["documents"]["ppt2"]["presentation_id"]
    assert get_memory_store().opportunities[UUID(opportunity_id)]["stage1_outputs"] == stage1_before
    assert get_memory_store().presentation_versions[ready_version] == first_contact_before
    assert get_memory_store().get_presentation_version(
        presentation_version_id=queued_version,
        user_id=OWNER,
    )["status"] == "generating"
    assert get_memory_store().get_presentation_version(
        presentation_version_id=ppt2_old,
        user_id=OWNER,
    )["slides_json"] == [{"marker": "post_meeting", "version": 1}]
    assert get_memory_store().get_presentation_version(
        presentation_version_id=generic_version,
        user_id=OWNER,
    )["presentation_id"] == generic_id
    assert step(generated, "owner_review")["state"] != "completed"
    assert step(generated, "finalized")["state"] != "completed"
    assert get_memory_store().opportunities[UUID(opportunity_id)]["owner_reviewed_at"] is None
    assert get_memory_store().opportunities[UUID(opportunity_id)]["finalized_at"] is None


def test_human_milestones_stay_explicit_and_idempotent() -> None:
    reset_memory_store()
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client, intake=INTAKE)
    approve_discovery(client, opportunity_id)
    blocked = client.post(
        f"/opportunities/{opportunity_id}/workflow/first-meeting-completed",
        headers=headers(),
    )
    assert blocked.status_code == 400
    assert blocked.json()["error"]["code"] == "PPT1_NOT_READY"

    feedback = client.put(
        f"/opportunities/{opportunity_id}/meeting-feedback",
        headers=headers(),
        json={"text": "The room agreed to continue."},
    )
    assert feedback.status_code == 200, feedback.text
    transcript = client.post(
        f"/opportunities/{opportunity_id}/transcripts",
        headers=headers(),
        files={"file": ("meeting.txt", io.BytesIO(b"Ada: Hello.\n"), "text/plain")},
    )
    assert transcript.status_code == 201, transcript.text
    after_inputs = status_of(client, opportunity_id)
    assert step(after_inputs, "first_meeting_completed")["state"] != "completed"
    assert step(after_inputs, "transcript_added")["state"] == "completed"
    assert step(after_inputs, "transcript_added")["evidence"]["transcript_id"] == transcript.json()["transcript"]["id"]
    assert get_memory_store().opportunities[UUID(opportunity_id)]["first_meeting_completed_at"] is None
    assert after_inputs["current_status"] == "ppt1_ready"

    ppt1_id, _version = seed_deck(opportunity_id, journey_stage="first_contact", status="ready")
    point_stage1(opportunity_id, ppt1_id, presentation_status="ready")
    with_transcript = status_of(client, opportunity_id)
    assert step(with_transcript, "ppt1_ready")["state"] == "completed"
    assert step(with_transcript, "transcript_added")["state"] == "completed"
    assert with_transcript["current_status"] == "first_meeting_completed"

    marked = client.post(
        f"/opportunities/{opportunity_id}/workflow/first-meeting-completed",
        headers=headers(),
    )
    assert marked.status_code == 200, marked.text
    assert step(marked.json(), "first_meeting_completed")["state"] == "completed"
    assert step(marked.json(), "transcript_added")["state"] == "completed"
    assert marked.json()["current_status"] == "ppt2_generated"
    first_at = step(marked.json(), "first_meeting_completed")["completed_at"]
    again = client.post(
        f"/opportunities/{opportunity_id}/workflow/first-meeting-completed",
        headers=headers(),
    )
    assert again.status_code == 200, again.text
    assert step(again.json(), "first_meeting_completed")["completed_at"] == first_at
    audits = [
        entry
        for entry in get_memory_store().audit_logs.values()
        if entry["action"] == "workflow.first_meeting_completed"
    ]
    assert len(audits) == 1
    assert INTAKE["about_company"] not in str(audits[0])

    too_early = client.post(
        f"/opportunities/{opportunity_id}/workflow/owner-reviewed",
        headers=headers(),
    )
    assert too_early.status_code == 400
    assert too_early.json()["error"]["code"] == "PPT2_NOT_GENERATED"
    ppt2_id, ppt2_version = seed_deck(opportunity_id, journey_stage="post_meeting", status="ready")
    reviewed = client.post(
        f"/opportunities/{opportunity_id}/workflow/owner-reviewed",
        headers=headers(),
    )
    assert reviewed.status_code == 200, reviewed.text
    assert step(reviewed.json(), "owner_review")["state"] == "completed"
    assert step(reviewed.json(), "finalized")["state"] == "current"
    assert reviewed.json()["documents"]["ppt2"]["presentation_id"] == str(ppt2_id)
    assert reviewed.json()["documents"]["ppt1"]["presentation_id"] == str(ppt1_id)
    reviewed_at = step(reviewed.json(), "owner_review")["completed_at"]
    reviewed_again = client.post(
        f"/opportunities/{opportunity_id}/workflow/owner-reviewed",
        headers=headers(),
    )
    assert step(reviewed_again.json(), "owner_review")["completed_at"] == reviewed_at
    assert len(
        [entry for entry in get_memory_store().audit_logs.values() if entry["action"] == "workflow.owner_reviewed"]
    ) == 1

    finalized = client.post(
        f"/opportunities/{opportunity_id}/workflow/finalize",
        headers=headers(),
    )
    assert finalized.status_code == 200, finalized.text
    assert step(finalized.json(), "finalized")["state"] == "completed"
    assert finalized.json()["current_status"] == "finalized"
    final_at = step(finalized.json(), "finalized")["completed_at"]
    finalized_again = client.post(
        f"/opportunities/{opportunity_id}/workflow/finalize",
        headers=headers(),
    )
    assert step(finalized_again.json(), "finalized")["completed_at"] == final_at
    assert len(
        [entry for entry in get_memory_store().audit_logs.values() if entry["action"] == "workflow.finalized"]
    ) == 1
    assert get_memory_store().presentation_versions[ppt2_version]["journey_stage"] == "post_meeting"
    assert get_memory_store().opportunities[UUID(opportunity_id)]["status"] == "active"


def test_finalize_requires_owner_review_before_any_timestamp() -> None:
    reset_memory_store()
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client, intake=INTAKE)
    refused = client.post(f"/opportunities/{opportunity_id}/workflow/finalize", headers=headers())
    assert refused.status_code == 400
    assert refused.json()["error"]["code"] == "OWNER_REVIEW_REQUIRED"
    assert get_memory_store().opportunities[UUID(opportunity_id)]["finalized_at"] is None


def test_get_is_deterministic_and_writes_nothing() -> None:
    reset_memory_store()
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client, intake=INTAKE)
    store = get_memory_store()
    before = {
        "opportunity": copy.deepcopy(store.opportunities[UUID(opportunity_id)]),
        "versions": copy.deepcopy(store.presentation_versions),
        "discoveries": copy.deepcopy(store.discovery_paper_versions),
        "audit": copy.deepcopy(store.audit_logs),
    }
    first = status_of(client, opportunity_id)
    second = status_of(client, opportunity_id)
    assert first == second
    assert store.opportunities[UUID(opportunity_id)] == before["opportunity"]
    assert store.presentation_versions == before["versions"]
    assert store.discovery_paper_versions == before["discoveries"]
    assert store.audit_logs == before["audit"]


def test_post_meeting_does_not_change_eligibility_or_the_generation_default() -> None:
    reset_memory_store()
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client)
    seed_deck(opportunity_id, journey_stage="post_meeting", status="ready")
    payload = evaluate_opportunity_eligibility(
        get_memory_store(),
        opportunity_id=UUID(opportunity_id),
        user_id=OWNER,
    )
    assert [row["journey_stage"] for row in payload["stages"]] == list(JOURNEY_STAGES)
    assert payload["stages"][0]["startable"] is True
    assert payload["stages"][1]["startable"] is False
    assert payload["stages"][2]["startable"] is False
    assert resolve_requested_journey_stage(None) == "first_contact"
    with pytest.raises(HTTPException) as caught:
        resolve_requested_journey_stage("post_meeting")
    assert caught.value.detail["code"] == "JOURNEY_STAGE_UNKNOWN"
