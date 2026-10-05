"""BT-48: freeze final package identities and remove owner Concretisation starts."""

from __future__ import annotations

import copy
import io
import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

import jsonschema
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import create_test_access_token
from app.config import settings
from app.main import create_app
from app.schemas.journey_stage import JOURNEY_STAGES
from app.services.data.memory_store import get_memory_store, reset_memory_store
from app.services.journey_stage import evaluate_opportunity_eligibility

OWNER = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
INTAKE = {
    "client_web_page": "https://northwind.example",
    "poc_name": "Ada Lovelace",
    "poc_position": "Operations",
    "sales_topic_description": "Warehouse slotting review",
    "about_company": "Family-owned distributor in Hamburg.",
}
REFERENCE_ID = "reference.invoice-3way.delivery-pattern"
NOTE = "Private owner margin note that must stay out of the snapshot."
ROOT = Path(__file__).resolve().parents[3]
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


def create_opportunity(client: TestClient) -> str:
    response = client.post(
        "/opportunities",
        headers=headers(),
        json={
            "client_name": "Northwind",
            "opportunity_name": "Quarterly title",
            "department": "Sales",
            "stage1_intake": INTAKE,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def status_of(client: TestClient, opportunity_id: str) -> dict:
    response = client.get(f"/opportunities/{opportunity_id}/workflow-status", headers=headers())
    assert response.status_code == 200, response.text
    body = response.json()
    assert [step["key"] for step in body["steps"]] == STEP_KEYS
    assert "concretisation" not in json.dumps(body["steps"])
    return body


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


def edit_discovery(client: TestClient, opportunity_id: str, client_name: str) -> None:
    current = client.get(f"/opportunities/{opportunity_id}/discovery-paper", headers=headers())
    assert current.status_code == 200, current.text
    cover = copy.deepcopy(current.json()["pages"][0]["content"])
    cover["client_name"] = client_name
    edited = client.patch(
        f"/opportunities/{opportunity_id}/discovery-paper",
        headers=headers(),
        json={"pages": [{"key": "cover", "content": cover}]},
    )
    assert edited.status_code == 200, edited.text


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


def point_stage1(opportunity_id: str, presentation_id: UUID) -> None:
    get_memory_store().opportunities[UUID(opportunity_id)]["stage1_outputs"] = {
        "status": "ready",
        "outputs": {
            "presentation": {
                "presentation_id": str(presentation_id),
                "status": "ready",
                "profile": "first_meeting_3",
            }
        },
    }


def prepare_final_package(client: TestClient, opportunity_id: str) -> dict:
    notes = client.put(
        f"/opportunities/{opportunity_id}/personal-notes",
        headers=headers(),
        json={"text": NOTE},
    )
    assert notes.status_code == 200, notes.text
    transcript = client.post(
        f"/opportunities/{opportunity_id}/transcripts",
        headers=headers(),
        files={"file": ("meeting.txt", io.BytesIO(b"Ada: Hello.\n"), "text/plain")},
    )
    assert transcript.status_code == 201, transcript.text
    transcript_id = transcript.json()["transcript"]["id"]
    extraction = client.post(
        f"/opportunities/{opportunity_id}/meeting-extraction/generate",
        headers=headers(),
        json={"transcript_id": transcript_id},
    )
    assert extraction.status_code == 200, extraction.text
    selected = client.put(
        f"/opportunities/{opportunity_id}/selected-use-cases",
        headers=headers(),
        json={"use_case_ids": [REFERENCE_ID]},
    )
    assert selected.status_code == 200, selected.text
    approved = approve_discovery(client, opportunity_id)
    edit_discovery(client, opportunity_id, "Unapproved Draft V2")
    generic_id, _generic_version = seed_deck(opportunity_id, journey_stage="first_contact", status="ready")
    ppt1_id, ppt1_version = seed_deck(opportunity_id, journey_stage="first_contact", status="ready")
    point_stage1(opportunity_id, ppt1_id)
    ppt2_id, ppt2_version = seed_deck(opportunity_id, journey_stage="post_meeting", status="ready")
    meeting = client.post(
        f"/opportunities/{opportunity_id}/workflow/first-meeting-completed",
        headers=headers(),
    )
    assert meeting.status_code == 200, meeting.text
    reviewed = client.post(
        f"/opportunities/{opportunity_id}/workflow/owner-reviewed",
        headers=headers(),
    )
    assert reviewed.status_code == 200, reviewed.text
    return {
        "approved": approved,
        "notes_updated_at": notes.json()["updated_at"],
        "transcript_id": transcript_id,
        "extraction": extraction.json(),
        "generic_id": generic_id,
        "ppt1_id": ppt1_id,
        "ppt1_version": ppt1_version,
        "ppt2_id": ppt2_id,
        "ppt2_version": ppt2_version,
    }


def test_finalize_prerequisites_fail_closed() -> None:
    reset_memory_store()
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client)
    early = client.post(f"/opportunities/{opportunity_id}/workflow/finalize", headers=headers())
    assert early.status_code == 400
    assert early.json()["error"]["code"] == "OWNER_REVIEW_REQUIRED"
    assert get_memory_store().opportunities[UUID(opportunity_id)]["finalized_at"] is None
    assert get_memory_store().opportunities[UUID(opportunity_id)]["finalization_snapshot"] is None

    get_memory_store().update_opportunity(
        opportunity_id=UUID(opportunity_id),
        user_id=OWNER,
        updates={"owner_reviewed_at": "2026-10-05T12:00:00Z"},
    )
    missing_discovery = client.post(
        f"/opportunities/{opportunity_id}/workflow/finalize",
        headers=headers(),
    )
    assert missing_discovery.status_code == 400
    assert missing_discovery.json()["error"]["code"] == "DISCOVERY_PAPER_APPROVAL_REQUIRED"

    approve_discovery(client, opportunity_id)
    missing_ppt2 = client.post(
        f"/opportunities/{opportunity_id}/workflow/finalize",
        headers=headers(),
    )
    assert missing_ppt2.status_code == 400
    assert missing_ppt2.json()["error"]["code"] == "PPT2_NOT_GENERATED"
    row = get_memory_store().opportunities[UUID(opportunity_id)]
    assert row["finalized_at"] is None
    assert row["finalization_snapshot"] is None


def test_first_finalize_freezes_package_and_ignores_later_live_changes() -> None:
    reset_memory_store()
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client)
    seeded = prepare_final_package(client, opportunity_id)
    before = status_of(client, opportunity_id)
    assert before["finalization"] is None
    assert before["documents"]["discovery_draft"]["status"] == "draft"
    assert before["documents"]["discovery_draft"]["differs_from_approved"] is True

    finalized = client.post(f"/opportunities/{opportunity_id}/workflow/finalize", headers=headers())
    assert finalized.status_code == 200, finalized.text
    body = finalized.json()
    snapshot = body["finalization"]
    assert body["current_status"] == "finalized"
    assert snapshot["approved_discovery_version_id"] == seeded["approved"]["id"]
    assert snapshot["ppt1_presentation_id"] == str(seeded["ppt1_id"])
    assert snapshot["ppt1_version_id"] == str(seeded["ppt1_version"])
    assert snapshot["ppt1_presentation_id"] != str(seeded["generic_id"])
    assert snapshot["ppt2_presentation_id"] == str(seeded["ppt2_id"])
    assert snapshot["ppt2_version_id"] == str(seeded["ppt2_version"])
    assert snapshot["ppt2_presentation_id"] != snapshot["ppt1_presentation_id"]
    assert snapshot["ppt2_generation_source_manifest"] is None
    observed = snapshot["observed_sources"]
    assert observed["transcript_id"] == seeded["transcript_id"]
    assert observed["meeting_extraction_generated_at"] == seeded["extraction"]["generated_at"]
    assert observed["extraction_notes_revision"] == seeded["notes_updated_at"]
    assert observed["personal_notes_updated_at"] == seeded["notes_updated_at"]
    assert observed["selected_use_case_ids"] == [REFERENCE_ID]
    rendered = json.dumps(snapshot)
    assert NOTE not in rendered
    assert "Unapproved Draft V2" not in rendered
    assert "paper_json" not in snapshot
    assert "slides_json" not in snapshot
    versions = get_memory_store().list_discovery_paper_versions(
        opportunity_id=UUID(opportunity_id),
        user_id=OWNER,
    )
    draft = next(row for row in versions if row["status"] == "draft")
    assert draft["version_number"] == 2
    approved_row = next(row for row in versions if row["id"] == UUID(seeded["approved"]["id"]))
    assert approved_row["status"] == "approved"
    original_paper = copy.deepcopy(approved_row["paper_json"])

    stage1 = get_memory_store().opportunities[UUID(opportunity_id)]["stage1_outputs"]
    assert stage1["outputs"]["presentation"]["presentation_id"] == str(seeded["ppt1_id"])
    assert body["documents"]["approved_discovery"]["version_id"] == seeded["approved"]["id"]
    assert body["documents"]["ppt1"]["presentation_id"] == str(seeded["ppt1_id"])
    assert body["documents"]["ppt1"]["latest_ready_version_id"] == str(seeded["ppt1_version"])
    assert body["documents"]["ppt2"]["presentation_id"] == str(seeded["ppt2_id"])
    assert body["documents"]["ppt2"]["latest_ready_version_id"] == str(seeded["ppt2_version"])
    frozen = copy.deepcopy(get_memory_store().opportunities[UUID(opportunity_id)]["finalization_snapshot"])
    finalized_at = body["steps"][-1]["completed_at"]

    later = client.post(
        f"/opportunities/{opportunity_id}/discovery-paper/approve",
        headers=headers(),
    )
    assert later.status_code == 200, later.text
    assert later.json()["id"] != seeded["approved"]["id"]
    edit_discovery(client, opportunity_id, "Working Draft V3")
    client.put(
        f"/opportunities/{opportunity_id}/personal-notes",
        headers=headers(),
        json={"text": "A note written after finalization."},
    )
    regenerated = client.post(
        f"/opportunities/{opportunity_id}/meeting-extraction/generate",
        headers=headers(),
        json={"transcript_id": seeded["transcript_id"]},
    )
    assert regenerated.status_code == 200, regenerated.text
    assert regenerated.json()["generated_at"] != seeded["extraction"]["generated_at"]
    cleared = client.put(
        f"/opportunities/{opportunity_id}/selected-use-cases",
        headers=headers(),
        json={"use_case_ids": []},
    )
    assert cleared.status_code == 200, cleared.text
    seed_deck(
        opportunity_id,
        journey_stage="post_meeting",
        status="ready",
        version_number=2,
        presentation_id=seeded["ppt2_id"],
    )
    with pytest.raises(HTTPException) as replaced:
        get_memory_store().update_opportunity(
            opportunity_id=UUID(opportunity_id),
            user_id=OWNER,
            updates={"finalization_snapshot": {"schema_version": "1.0"}},
        )
    assert replaced.value.detail["code"] == "FINALIZATION_SNAPSHOT_IMMUTABLE"

    again = client.post(f"/opportunities/{opportunity_id}/workflow/finalize", headers=headers())
    assert again.status_code == 200, again.text
    assert again.json()["steps"][-1]["completed_at"] == finalized_at
    assert again.json()["finalization"] == frozen
    assert get_memory_store().opportunities[UUID(opportunity_id)]["finalization_snapshot"] == frozen
    audits = [
        entry
        for entry in get_memory_store().audit_logs.values()
        if entry["action"] == "workflow.finalized"
    ]
    assert len(audits) == 1

    after = status_of(client, opportunity_id)
    assert after["documents"]["approved_discovery"]["version_id"] == seeded["approved"]["id"]
    assert after["documents"]["ppt1"]["latest_ready_version_id"] == str(seeded["ppt1_version"])
    assert after["documents"]["ppt2"]["latest_ready_version_id"] == str(seeded["ppt2_version"])
    assert after["documents"]["discovery_draft"]["status"] == "draft"
    assert after["documents"]["discovery_draft"]["differs_from_approved"] is True
    assert after["finalization"]["approved_discovery_version_id"] == seeded["approved"]["id"]
    stored_v1 = get_memory_store().get_discovery_paper_version(
        version_id=UUID(seeded["approved"]["id"]),
        user_id=OWNER,
    )
    assert stored_v1["paper_json"] == original_paper
    readable = client.get(
        f"/opportunities/{opportunity_id}/discovery-paper/versions/{seeded['approved']['id']}",
        headers=headers(),
    )
    assert readable.status_code == 200, readable.text
    ppt1_read = client.get(f"/presentations/{seeded['ppt1_id']}", headers=headers())
    ppt2_read = client.get(f"/presentations/{seeded['ppt2_id']}", headers=headers())
    assert ppt1_read.status_code == 200
    assert ppt2_read.status_code == 200
    schema = json.loads((ROOT / "packages" / "contracts" / "workflow_status.schema.json").read_text(encoding="utf-8"))
    jsonschema.Draft202012Validator(schema, format_checker=jsonschema.FormatChecker()).validate(after)


def test_snapshot_contract_matches_the_workflow_package() -> None:
    standalone = json.loads(
        (ROOT / "packages" / "contracts" / "finalization_snapshot.schema.json").read_text(encoding="utf-8")
    )
    workflow = json.loads(
        (ROOT / "packages" / "contracts" / "workflow_status.schema.json").read_text(encoding="utf-8")
    )
    embedded = workflow["$defs"]["FinalizationSnapshot"]
    assert embedded["required"] == standalone["required"]
    assert set(embedded["properties"]) == set(standalone["properties"])


def test_owner_concretisation_stays_visible_in_history_and_is_not_startable() -> None:
    reset_memory_store()
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client)
    seed_deck(opportunity_id, journey_stage="first_contact", status="ready")
    eligibility = client.get(
        f"/opportunities/{opportunity_id}/journey-stage-eligibility",
        headers=headers(),
    )
    assert eligibility.status_code == 200, eligibility.text
    payload = eligibility.json()
    assert len(payload["stages"]) == 3
    stages = {row["journey_stage"]: row for row in payload["stages"]}
    assert list(stages) == list(JOURNEY_STAGES)
    assert stages["deepening"]["startable"] is True
    assert stages["deepening"]["next_action"] is None
    assert stages["concretisation"]["startable"] is False
    assert stages["concretisation"]["next_action"] == "owner_stage_removed"
    internal = evaluate_opportunity_eligibility(
        get_memory_store(),
        opportunity_id=UUID(opportunity_id),
        user_id=OWNER,
    )
    internal_stages = {row["journey_stage"]: row for row in internal["stages"]}
    assert internal_stages["deepening"]["startable"] is True

    store = get_memory_store()
    plans_before = len(store.presentation_plans)
    presentations_before = len(store.presentations)
    jobs_before = len(store.generation_jobs)
    drafts_before = copy.deepcopy(store.opportunities[UUID(opportunity_id)].get("email_drafts"))
    for path, body in (
        ("presentation-plan/generate", {"journey_stage": "concretisation"}),
        ("presentation/generate", {"journey_stage": "concretisation"}),
        ("email-drafts/generate", {"journey_stage": "concretisation"}),
    ):
        rejected = client.post(
            f"/opportunities/{opportunity_id}/{path}",
            headers=headers(),
            json=body,
        )
        assert rejected.status_code == 400, rejected.text
        assert rejected.json()["error"]["code"] == "CONCRETISATION_NOT_IN_OWNER_WORKFLOW"
    assert len(store.presentation_plans) == plans_before
    assert len(store.presentations) == presentations_before
    assert len(store.generation_jobs) == jobs_before
    assert store.opportunities[UUID(opportunity_id)].get("email_drafts") == drafts_before

    historical_id, historical_version = seed_deck(
        opportunity_id,
        journey_stage="concretisation",
        status="ready",
    )
    readable = client.get(f"/presentations/{historical_id}", headers=headers())
    assert readable.status_code == 200, readable.text
    stored = store.get_presentation_version(presentation_version_id=historical_version, user_id=OWNER)
    assert stored["journey_stage"] == "concretisation"
    length = {"subject": "Proposal", "body": "Historical concretisation draft.", "word_count": 3}
    store.upsert_email_draft(
        opportunity_id=UUID(opportunity_id),
        user_id=OWNER,
        journey_stage="concretisation",
        payload={
            "status": "draft",
            "selected_length": None,
            "lengths": {"short": length, "medium": length, "extensive": length},
        },
    )
    email = client.get(
        f"/opportunities/{opportunity_id}/email-drafts",
        headers=headers(),
        params={"journey_stage": "concretisation"},
    )
    assert email.status_code == 200, email.text
    assert email.json()["journey_stage"] == "concretisation"
    assert email.json()["draft"]["lengths"]["short"]["subject"] == "Proposal"
