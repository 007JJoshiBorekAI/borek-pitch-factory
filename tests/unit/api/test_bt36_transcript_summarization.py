"""BT-36 Phase 2 — worker, persistence, retrieval, orchestration."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import create_test_access_token
from app.config import settings
from app.main import create_app
from app.schemas.jobs import JobStage, JobStatus
from app.services import job_service
from app.services.data.memory_store import MemoryDataStore, get_memory_store, reset_memory_store
from app.services.stage_a_orchestration import generate_framework_from_transcripts
from services.transcript.conversation_ids import TranscriptIdentity
from services.transcript.speaker_turns import SpeakerTurn

USER_A = uuid.UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
USER_B = uuid.UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
FIXTURE_PATH = (
    Path(__file__).resolve().parents[3]
    / "packages"
    / "contracts"
    / "fixtures"
    / "transcript_summary.complete.json"
)


def _mock_summary(turns: list[SpeakerTurn], identity: TranscriptIdentity, *, redact: bool) -> dict[str, Any]:
    payload = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    payload["transcript_id"] = identity.transcript_id
    payload["conversation_id"] = identity.conversation_id
    payload["opportunity_id"] = identity.opportunity_id
    payload["metadata"] = {
        "summary_truncated": False,
        "uncertainty_notes": [],
        "source_turn_count": len(turns),
        "summarized_turn_count": len(turns),
    }
    payload["meeting_facts"] = [
        {
            "text": "Acme uses SAP as the system of record.",
            "origin": "SOURCE_FACT",
            "source_refs": [
                {
                    "conversation_id": identity.conversation_id,
                    "speaker_role": turns[0].speaker,
                    "excerpt_pointer": f"turn:{turns[0].turn_index}",
                }
            ],
            "confidence": "high",
        }
    ]
    return payload


def _seed_opportunity_with_transcript(store: MemoryDataStore) -> tuple[uuid.UUID, uuid.UUID]:
    opportunity = store.create_opportunity(
        user_id=USER_A,
        opportunity_name="Summarization Co",
        client_name="Acme",
        department="Sales",
        language="en",
    )
    transcript = store.create_transcript(
        opportunity_id=opportunity["id"],
        user_id=USER_A,
        file_name="workshop.txt",
        mime_type="text/plain",
        storage_path=f"{opportunity['id']}/workshop.txt",
        conversation_id="C1",
        content=b"Anna: Acme uses SAP.\n",
        sections=[
            {
                "section_index": 0,
                "speaker_role": "Anna",
                "content": "Acme uses SAP.",
                "metadata": {"conversation_id": "C1"},
            }
        ],
        verify_owner=False,
    )
    return opportunity["id"], transcript["id"]


def test_memory_store_persists_and_retrieves_summary_with_owner_check() -> None:
    store = MemoryDataStore()
    opportunity_id, transcript_id = _seed_opportunity_with_transcript(store)
    summary = _mock_summary(
        [SpeakerTurn(0, "Anna", "Acme uses SAP.")],
        TranscriptIdentity(
            opportunity_id=str(opportunity_id),
            transcript_id=str(transcript_id),
            conversation_id="C1",
        ),
        redact=True,
    )
    job_id = uuid.uuid4()
    store.generation_jobs[job_id] = {
        "id": job_id,
        "opportunity_id": opportunity_id,
        "job_type": "framework_generation",
        "status": "RUNNING",
        "current_stage": "TRANSCRIPT_SUMMARIZING",
        "result_json": {},
    }
    store.upsert_transcript_summary(
        job_id=job_id,
        transcript_id=transcript_id,
        opportunity_id=opportunity_id,
        user_id=USER_A,
        conversation_id="C1",
        summary_json=summary,
        schema_version="1.0",
        prompt_version="transcript-summary:v1",
    )
    row = store.get_transcript_summary(
        opportunity_id=opportunity_id,
        transcript_id=transcript_id,
        user_id=USER_A,
    )
    assert row is not None
    assert row["summary_json"]["prompt_version"] == "transcript-summary:v1"
    with pytest.raises(HTTPException) as exc_info:
        store.get_transcript_summary(
            opportunity_id=opportunity_id,
            transcript_id=transcript_id,
            user_id=USER_B,
        )
    assert exc_info.value.status_code == 404


def test_orchestration_persists_summary_before_extraction() -> None:
    store = MemoryDataStore()
    opportunity_id, transcript_id = _seed_opportunity_with_transcript(store)
    job_id = uuid.uuid4()
    store.generation_jobs[job_id] = {
        "id": job_id,
        "opportunity_id": opportunity_id,
        "job_type": "framework_generation",
        "status": "RUNNING",
        "current_stage": "TRANSCRIPT_PROCESSING",
        "result_json": {},
    }
    stages: list[str] = []
    summarize_calls = 0

    def summarize(turns, identity, *, redact: bool) -> dict[str, Any]:
        nonlocal summarize_calls
        summarize_calls += 1
        return _mock_summary(turns, identity, redact=redact)

    def extract(turns, identity, *, redact: bool, **_kwargs: Any) -> dict[str, Any]:
        return {"schema_version": "1.0", "conversation_id": "C1", "facts": []}

    generate_framework_from_transcripts(
        store,
        opportunity_id=opportunity_id,
        user_id=USER_A,
        execution_mode="live",
        job_id=job_id,
        transcript_ids=[str(transcript_id)],
        summarize_fn=summarize,
        extract_fn=extract,
        generate_fn=lambda *_args, **_kwargs: {
            "schema_version": "1.0",
            "status": "draft",
            "chapters": [],
        },
        stage_callback=stages.append,
    )
    assert stages[0] == "summarizing"
    assert summarize_calls == 1
    saved = store.get_transcript_summary(
        opportunity_id=opportunity_id,
        transcript_id=transcript_id,
        user_id=USER_A,
    )
    assert saved is not None


def test_orchestration_retry_reuses_summary_checkpoint() -> None:
    store = MemoryDataStore()
    opportunity_id, transcript_id = _seed_opportunity_with_transcript(store)
    job_id = uuid.uuid4()
    store.generation_jobs[job_id] = {
        "id": job_id,
        "opportunity_id": opportunity_id,
        "job_type": "framework_generation",
        "status": "RUNNING",
        "current_stage": "TRANSCRIPT_PROCESSING",
        "result_json": {},
    }
    summarize_calls = 0

    def summarize(turns, identity, *, redact: bool) -> dict[str, Any]:
        nonlocal summarize_calls
        summarize_calls += 1
        return _mock_summary(turns, identity, redact=redact)

    def extract(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
        return {"schema_version": "1.0", "conversation_id": "C1", "facts": []}

    kwargs = dict(
        store=store,
        opportunity_id=opportunity_id,
        user_id=USER_A,
        execution_mode="live",
        job_id=job_id,
        transcript_ids=[str(transcript_id)],
        summarize_fn=summarize,
        extract_fn=extract,
    )
    with pytest.raises(RuntimeError, match="synthesis unavailable"):
        generate_framework_from_transcripts(
            **kwargs,
            generate_fn=lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("synthesis unavailable")),
        )
    assert summarize_calls == 1
    generate_framework_from_transcripts(
        **kwargs,
        generate_fn=lambda *_a, **_k: {
            "schema_version": "1.0",
            "status": "draft",
            "chapters": [],
        },
    )
    assert summarize_calls == 1


def test_summarization_failure_does_not_continue_to_extraction() -> None:
    store = MemoryDataStore()
    opportunity_id, _transcript_id = _seed_opportunity_with_transcript(store)
    stages: list[str] = []

    def fail_summarize(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
        from services.transcript.summarization import TranscriptSummarizationError

        raise TranscriptSummarizationError("failed", code="TRANSCRIPT_SUMMARIZATION_FAILED")

    with pytest.raises(HTTPException):
        generate_framework_from_transcripts(
            store,
            opportunity_id=opportunity_id,
            user_id=USER_A,
            execution_mode="live",
            summarize_fn=fail_summarize,
            extract_fn=lambda *_a, **_k: pytest.fail("extraction must not run"),
            generate_fn=lambda *_a, **_k: pytest.fail("synthesis must not run"),
            stage_callback=stages.append,
        )
    assert stages == ["summarizing"]


def test_transcript_summary_api_endpoint() -> None:
    reset_memory_store()
    store = get_memory_store()
    opportunity_id, transcript_id = _seed_opportunity_with_transcript(store)
    summary = _mock_summary(
        [SpeakerTurn(0, "Anna", "Acme uses SAP.")],
        TranscriptIdentity(
            opportunity_id=str(opportunity_id),
            transcript_id=str(transcript_id),
            conversation_id="C1",
        ),
        redact=True,
    )
    store.upsert_transcript_summary(
        job_id=None,
        transcript_id=transcript_id,
        opportunity_id=opportunity_id,
        user_id=USER_A,
        conversation_id="C1",
        summary_json=summary,
        schema_version="1.0",
        prompt_version="transcript-summary:v1",
    )
    app = create_app()
    client = TestClient(app)
    headers = {
        "Authorization": f"Bearer {create_test_access_token(user_id=USER_A, email='owner@example.com', secret=settings.SUPABASE_JWT_SECRET)}"
    }
    response = client.get(
        f"/opportunities/{opportunity_id}/transcripts/{transcript_id}/summary",
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["processing_status"] == "completed"
    assert body["summary"]["prompt_version"] == "transcript-summary:v1"

    other_headers = {
        "Authorization": f"Bearer {create_test_access_token(user_id=USER_B, email='other@example.com', secret=settings.SUPABASE_JWT_SECRET)}"
    }
    denied = client.get(
        f"/opportunities/{opportunity_id}/transcripts/{transcript_id}/summary",
        headers=other_headers,
    )
    assert denied.status_code == 404


def test_framework_worker_records_summarizing_stage(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.worker import run_framework_generation_task

    store = MemoryDataStore()
    opportunity_id, transcript_id = _seed_opportunity_with_transcript(store)
    framework_version_id = uuid.uuid4()
    job = job_service.create_job(
        opportunity_id,
        "framework_generation",
        enqueue={
            "user_id": str(USER_A),
            "framework_version_id": str(framework_version_id),
            "transcript_ids": [str(transcript_id)],
        },
        repository=store,
    )
    recorded: list[JobStage] = []
    original_ensure = job_service.ensure_stage

    def capture_stage(job_id, stage, *, repository=None):
        recorded.append(stage)
        return original_ensure(job_id, stage, repository=repository)

    monkeypatch.setattr(job_service, "ensure_stage", capture_stage)
    def fake_execute(_store, *, stage_callback=None, **_kwargs):
        if stage_callback is not None:
            stage_callback("summarizing")
            stage_callback("knowledge")
            stage_callback("validation")
        return {"id": framework_version_id, "framework_json": {"chapters": []}}

    monkeypatch.setattr(
        "app.services.framework_generation.execute_framework_generate",
        fake_execute,
    )
    monkeypatch.setattr(
        "app.services.framework_generation.persist_framework_generation_observability",
        lambda *_args, **_kwargs: {},
    )
    monkeypatch.setattr(
        "app.services.data.build_worker_data_store",
        lambda: store,
    )

    run_framework_generation_task.run(
        str(job.id),
        str(opportunity_id),
        str(USER_A),
        str(framework_version_id),
    )
    assert JobStage.TRANSCRIPT_SUMMARIZING in recorded
    current = job_service.get_job(job.id, repository=store)
    assert current is not None
    assert current.status == JobStatus.COMPLETED
