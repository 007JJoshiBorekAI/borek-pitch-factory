"""BT-44: personal notes and a transcript-scoped meeting extraction."""

from __future__ import annotations

import copy
import io
from datetime import UTC, datetime
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from app.auth import create_test_access_token
from app.config import settings
from app.main import create_app
from app.services.data.memory_store import get_memory_store, reset_memory_store
from app.services.data.supabase_store import SupabaseDataStore
from app.services.meeting_extraction import get_meeting_extraction
from services.meeting.extraction import build_separated_user_message, extract_meeting_categories

OWNER = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
OTHER = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
CATEGORIES = (
    "requirements",
    "challenges",
    "priorities",
    "opportunities",
    "discussed_solutions",
    "decisions",
    "follow_ups",
)
LABELED = (
    "Ada: Requirement: Flag duplicate invoices.\n"
    "Ben: Challenge: Matching still takes two days.\n"
    "Ada: Priority: Finance reviews the first draft.\n"
    "Ben: Opportunity: Automate the exception queue.\n"
    "Ada: Discussed solution: Show exceptions before posting.\n"
    "Ben: Decision: Start with invoices only.\n"
    "Ada: Follow-up: Send the sample file on Friday.\n"
    "Ben: We also mentioned the weather.\n"
)


def headers(user_id: UUID = OWNER) -> dict[str, str]:
    return {
        "Authorization": "Bearer "
        + create_test_access_token(
            user_id=user_id,
            email="sales@example.com",
            secret=settings.SUPABASE_JWT_SECRET,
        )
    }


def create_opportunity(client: TestClient, *, user_id: UUID = OWNER, intake: dict | None = None) -> str:
    payload = {
        "client_name": "Northwind",
        "opportunity_name": "Warehouse review",
        "department": "Operations",
    }
    if intake is not None:
        payload["stage1_intake"] = intake
    response = client.post("/opportunities", headers=headers(user_id), json=payload)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def upload_transcript(client: TestClient, opportunity_id: str, body: str, *, user_id: UUID = OWNER) -> str:
    response = client.post(
        f"/opportunities/{opportunity_id}/transcripts",
        headers=headers(user_id),
        files={"file": ("meeting.txt", io.BytesIO(body.encode()), "text/plain")},
    )
    assert response.status_code == 201, response.text
    return response.json()["transcript"]["id"]


def test_transcript_upload_leaves_intake_notes_and_feedback_untouched() -> None:
    reset_memory_store()
    client = TestClient(create_app())
    intake = {
        "sales_topic_description": "Warehouse slotting",
        "about_company": "Family-owned distributor.",
    }
    opportunity_id = create_opportunity(client, intake=intake)
    before = client.get(f"/opportunities/{opportunity_id}", headers=headers()).json()
    upload_transcript(client, opportunity_id, "Ada: Requirement: Flag duplicate invoices.\n")
    after = client.get(f"/opportunities/{opportunity_id}", headers=headers()).json()
    assert after["stage1_intake"] == before["stage1_intake"]
    assert after["stage1_intake"]["sales_topic_description"] == "Warehouse slotting"
    assert after["stage1_intake"]["about_company"] == "Family-owned distributor."
    notes = client.get(f"/opportunities/{opportunity_id}/personal-notes", headers=headers()).json()
    assert notes["text"] is None
    feedback = client.get(f"/opportunities/{opportunity_id}/meeting-feedback", headers=headers()).json()
    assert feedback["text"] is None
    store = get_memory_store()
    row = store.opportunities[UUID(opportunity_id)]
    assert row["meeting_feedback_text"] is None
    assert row["personal_notes"] is None
    assert row["about_company"] == "Family-owned distributor."


def test_personal_notes_round_trip_clear_and_stay_separate() -> None:
    reset_memory_store()
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client)
    transcript_id = upload_transcript(client, opportunity_id, LABELED)
    saved = client.put(
        f"/opportunities/{opportunity_id}/personal-notes",
        headers=headers(),
        json={"text": "Priority: Owner wants finance first."},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["text"] == "Priority: Owner wants finance first."
    assert saved.json()["updated_at"]
    fetched = client.get(f"/opportunities/{opportunity_id}/personal-notes", headers=headers()).json()
    assert fetched == saved.json()
    store = get_memory_store()
    row = store.opportunities[UUID(opportunity_id)]
    transcript = next(iter(store.transcripts.values()))
    assert row["personal_notes"] not in str(transcript["content"])
    assert row["meeting_feedback_text"] is None
    assert row["about_company"] is None
    cleared = client.put(
        f"/opportunities/{opportunity_id}/personal-notes",
        headers=headers(),
        json={"text": "   "},
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["text"] is None
    assert cleared.json()["updated_at"]
    assert store.transcripts[UUID(transcript_id)]["content"]
    audit = [entry for entry in store.audit_logs.values() if entry["action"] == "personal_notes.update"]
    assert audit
    assert "Owner wants finance first" not in str(audit[-1])


def test_meeting_extraction_uses_saved_transcript_and_notes() -> None:
    reset_memory_store()
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client)
    other_id = create_opportunity(client, user_id=OTHER)
    transcript_id = upload_transcript(client, opportunity_id, LABELED)
    other_transcript_id = upload_transcript(
        client,
        other_id,
        "Cara: Requirement: This belongs to someone else.\n",
        user_id=OTHER,
    )
    missing = client.post(
        f"/opportunities/{opportunity_id}/meeting-extraction/generate",
        headers=headers(),
        json={},
    )
    assert missing.status_code == 422
    assert missing.json()["error"]["code"] == "VALIDATION_ERROR"
    rejected_notes = client.post(
        f"/opportunities/{opportunity_id}/meeting-extraction/generate",
        headers=headers(),
        json={"transcript_id": transcript_id, "personal_notes": "Priority: Request body notes."},
    )
    assert rejected_notes.status_code == 422
    unknown = client.post(
        f"/opportunities/{opportunity_id}/meeting-extraction/generate",
        headers=headers(),
        json={"transcript_id": str(uuid4())},
    )
    assert unknown.status_code == 404
    assert unknown.json()["error"]["code"] == "TRANSCRIPT_NOT_FOUND"
    foreign = client.post(
        f"/opportunities/{opportunity_id}/meeting-extraction/generate",
        headers=headers(),
        json={"transcript_id": other_transcript_id},
    )
    assert foreign.status_code == 404
    assert foreign.json()["error"]["code"] == "TRANSCRIPT_NOT_FOUND"

    empty = client.get(f"/opportunities/{opportunity_id}/meeting-extraction", headers=headers())
    assert empty.status_code == 200
    assert empty.json()["status"] == "not_generated"
    assert empty.json()["extraction"] is None

    without_notes = client.post(
        f"/opportunities/{opportunity_id}/meeting-extraction/generate",
        headers=headers(),
        json={"transcript_id": transcript_id},
    )
    assert without_notes.status_code == 200, without_notes.text
    body = without_notes.json()
    assert set(CATEGORIES).issubset(body)
    assert body["requirements"] == ["Flag duplicate invoices."]
    assert body["challenges"] == ["Matching still takes two days."]
    assert body["priorities"] == ["Finance reviews the first draft."]
    assert body["opportunities"] == ["Automate the exception queue."]
    assert body["discussed_solutions"] == ["Show exceptions before posting."]
    assert body["decisions"] == ["Start with invoices only."]
    assert body["follow_ups"] == ["Send the sample file on Friday."]
    assert "weather" not in str(body.values())
    assert body["transcript_id"] == transcript_id
    assert body["personal_notes_updated_at"] is None
    assert "personal_notes" not in body
    stored = client.get(f"/opportunities/{opportunity_id}/meeting-extraction", headers=headers()).json()
    assert stored == body
    assert get_meeting_extraction(
        get_memory_store(),
        opportunity_id=UUID(opportunity_id),
        user_id=OWNER,
    ) == body

    noted = client.put(
        f"/opportunities/{opportunity_id}/personal-notes",
        headers=headers(),
        json={"text": "Priority: Owner wants finance first."},
    )
    assert noted.status_code == 200, noted.text
    unchanged = client.get(f"/opportunities/{opportunity_id}/meeting-extraction", headers=headers()).json()
    assert unchanged == body
    assert unchanged["personal_notes_updated_at"] is None
    regenerated = client.post(
        f"/opportunities/{opportunity_id}/meeting-extraction/generate",
        headers=headers(),
        json={"transcript_id": transcript_id},
    )
    assert regenerated.status_code == 200, regenerated.text
    assert regenerated.json()["priorities"] == [
        "Finance reviews the first draft.",
        "Owner wants finance first.",
    ]
    assert regenerated.json()["personal_notes_updated_at"] == noted.json()["updated_at"]
    assert "Owner wants finance first." not in regenerated.json().values()
    audit = [
        entry
        for entry in get_memory_store().audit_logs.values()
        if entry["action"] == "meeting_extraction.generate"
    ]
    assert audit[-1]["document_id"] == transcript_id
    assert "Owner wants finance first" not in str(audit[-1])
    assert "Flag duplicate invoices" not in str(audit[-1])


def test_unlabeled_transcript_does_not_fabricate_categories() -> None:
    reset_memory_store()
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client)
    transcript_id = upload_transcript(client, opportunity_id, "Ada: We talked about the weather.\n")
    generated = client.post(
        f"/opportunities/{opportunity_id}/meeting-extraction/generate",
        headers=headers(),
        json={"transcript_id": transcript_id},
    )
    assert generated.status_code == 200, generated.text
    body = generated.json()
    for category in CATEGORIES:
        assert body[category] == []


def test_sources_stay_labeled_and_live_mode_drops_unsupported_items() -> None:
    sections = [{"speaker_role": "Ada", "content": "Requirement: Flag duplicate invoices."}]
    message = build_separated_user_message(
        transcript_text="Ada: Requirement: Flag duplicate invoices.",
        personal_notes="Priority: Owner wants finance first.",
    )
    assert message.index("TRANSCRIPT:") < message.index("OWNER PERSONAL NOTES:")
    assert "Ada: Requirement: Flag duplicate invoices.\n\nOWNER PERSONAL NOTES:" in message

    def complete(system: str, user: str, schema: dict) -> dict:
        assert "TRANSCRIPT:" in user and "OWNER PERSONAL NOTES:" in user
        assert "do not invent" in system.lower() or "Do not invent" in system
        return {
            "requirements": ["Flag duplicate invoices.", "Invented requirement"],
            "challenges": ["Made up challenge"],
            "priorities": ["Owner wants finance first."],
            "opportunities": [],
            "discussed_solutions": [],
            "decisions": [],
            "follow_ups": [],
        }

    categories = extract_meeting_categories(
        sections=sections,
        personal_notes="Priority: Owner wants finance first.",
        live=True,
        complete=complete,
    )
    assert categories["requirements"] == ["Flag duplicate invoices."]
    assert categories["priorities"] == ["Owner wants finance first."]
    assert categories["challenges"] == []


def test_supabase_persists_notes_and_extraction(monkeypatch: pytest.MonkeyPatch) -> None:
    tables: dict[str, list[dict]] = {"opportunities": [], "transcripts": [], "transcript_sections": []}

    def request(self, method, table, *, json_body=None, params=None, headers=None):
        rows = tables.setdefault(table, [])
        params = params or {}
        json_body = _jsonable(json_body)
        if method == "POST":
            created = copy.deepcopy(json_body)
            if isinstance(created, list):
                for item in created:
                    item.setdefault("id", str(uuid4()))
                    rows.append(item)
                return httpx.Response(201, json=copy.deepcopy(created))
            created.setdefault("id", str(uuid4()))
            created.setdefault("created_at", datetime.now(UTC).isoformat())
            created.setdefault("updated_at", created["created_at"])
            rows.append(created)
            return httpx.Response(201, json=[copy.deepcopy(created)])
        matched = [
            row
            for row in rows
            if all(_matches(row, key, value) for key, value in params.items() if value.startswith("eq."))
        ]
        if method == "GET":
            return httpx.Response(200, json=[copy.deepcopy(row) for row in matched])
        if method == "PATCH":
            assert matched
            matched[0].update(copy.deepcopy(json_body))
            return httpx.Response(200, json=[copy.deepcopy(matched[0])])
        raise AssertionError(method)

    monkeypatch.setattr(SupabaseDataStore, "_request", request)
    store = SupabaseDataStore("test-token")
    created = store.create_opportunity(
        user_id=OWNER,
        client_name="Northwind",
        opportunity_name="Warehouse review",
        department="Operations",
        language="en",
    )
    opportunity_id = created["id"]
    transcript_id = uuid4()
    tables["transcripts"].append(
        {
            "id": str(transcript_id),
            "opportunity_id": str(opportunity_id),
            "file_name": "meeting.txt",
            "mime_type": "text/plain",
            "storage_path": "path",
            "conversation_id": "C1",
            "processing_status": "pending",
            "created_at": datetime.now(UTC).isoformat(),
        }
    )
    tables["transcript_sections"].append(
        {
            "id": str(uuid4()),
            "transcript_id": str(transcript_id),
            "section_index": 0,
            "speaker_role": "Ada",
            "content": "Requirement: Flag duplicate invoices.",
            "metadata": {},
        }
    )
    store.update_opportunity(
        opportunity_id=opportunity_id,
        user_id=OWNER,
        updates={
            "personal_notes": "Priority: Owner wants finance first.",
            "personal_notes_updated_at": datetime.now(UTC),
        },
    )
    generated = store.get_opportunity(opportunity_id=opportunity_id, user_id=OWNER)
    from app.services.meeting_extraction import generate_meeting_extraction

    extraction = generate_meeting_extraction(
        store,
        opportunity_id=opportunity_id,
        user_id=OWNER,
        transcript_id=transcript_id,
    )
    fetched = store.get_opportunity(opportunity_id=opportunity_id, user_id=OWNER)
    assert fetched["personal_notes"] == "Priority: Owner wants finance first."
    assert fetched["meeting_extraction"]["transcript_id"] == str(transcript_id)
    assert fetched["meeting_extraction"]["requirements"] == ["Flag duplicate invoices."]
    assert fetched["meeting_extraction"]["priorities"] == ["Owner wants finance first."]
    assert extraction["transcript_id"] == fetched["meeting_extraction"]["transcript_id"]
    assert generated["personal_notes"] == "Priority: Owner wants finance first."


def _jsonable(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, dict):
        return {key: _jsonable(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_jsonable(item) for item in value]
    return value


def _matches(row: dict, key: str, value: str) -> bool:
    if not value.startswith("eq."):
        return True
    return str(row.get(key)) == value.removeprefix("eq.")
