"""BT-36 — transcript summarization service."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

import pytest

from services.transcript.conversation_ids import TranscriptIdentity
from services.transcript.speaker_turns import SpeakerTurn, split_speaker_turns
from services.transcript.summarization import (
    PROMPT_VERSION,
    TranscriptSummarizationError,
    format_transcript_summary_for_prompt,
    summarize_transcript,
)

FIXTURE_PATH = (
    Path(__file__).resolve().parents[3]
    / "packages"
    / "contracts"
    / "fixtures"
    / "transcript_summary.complete.json"
)
TRUNCATED_FIXTURE_PATH = (
    Path(__file__).resolve().parents[3]
    / "packages"
    / "contracts"
    / "fixtures"
    / "transcript_summary.truncated.json"
)


def _identity() -> TranscriptIdentity:
    return TranscriptIdentity(
        opportunity_id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        transcript_id="dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        conversation_id="C1",
    )


def _turns() -> list[SpeakerTurn]:
    return split_speaker_turns(
        "workshop.txt",
        b"Anna: Acme uses SAP as the system of record.\nJonas: Which modules export reconciliation data?",
    )


def _complete_from_fixture(system: str, user: str, schema: dict) -> dict:
    assert "transcript-summary:v1" in system
    assert "UNTRUSTED_TRANSCRIPT_BEGIN" in user
    assert "UNTRUSTED_TRANSCRIPT_END" in user
    assert "turn:0" in user
    payload = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    payload["meeting_facts"] = [
        {
            "text": "Acme uses SAP as the system of record.",
            "origin": "SOURCE_FACT",
            "source_refs": [
                {
                    "conversation_id": "C1",
                    "speaker_role": "Anna",
                    "excerpt_pointer": "turn:0",
                }
            ],
            "confidence": "high",
        }
    ]
    payload["decisions"] = []
    payload["action_items"] = []
    payload["open_questions"] = [
        {
            "text": "Which modules export reconciliation data?",
            "origin": "SOURCE_FACT",
            "source_refs": [
                {
                    "conversation_id": "C1",
                    "speaker_role": "Jonas",
                    "excerpt_pointer": "turn:1",
                }
            ],
            "confidence": "medium",
        }
    ]
    payload["requirements_and_constraints"] = []
    payload["metadata"] = {
        "summary_truncated": False,
        "uncertainty_notes": [],
        "source_turn_count": 2,
        "summarized_turn_count": 2,
    }
    return payload


def test_summarization_stamps_identity_and_validates_schema() -> None:
    summary = summarize_transcript(
        _turns(),
        _identity(),
        redact=True,
        complete=_complete_from_fixture,
    )
    assert summary["schema_version"] == "1.0"
    assert summary["prompt_version"] == PROMPT_VERSION
    assert summary["transcript_id"] == _identity().transcript_id
    assert summary["conversation_id"] == "C1"
    assert summary["metadata"]["source_turn_count"] == 2


def test_redacted_text_is_what_provider_sees() -> None:
    seen: dict[str, str] = {}

    def capture(system: str, user: str, schema: dict) -> dict:
        seen["user"] = user
        payload = _complete_from_fixture(system, user, schema)
        payload["open_questions"] = []
        payload["metadata"]["source_turn_count"] = 1
        payload["metadata"]["summarized_turn_count"] = 1
        return payload

    turns = split_speaker_turns(
        "call.txt",
        b"Sandra: Email sandra@client.de about the ERP.",
    )
    summarize_transcript(turns, _identity(), redact=True, complete=capture)
    assert "sandra@client.de" not in seen["user"]
    assert "[EMAIL]" in seen["user"]


def test_empty_turns_are_rejected() -> None:
    with pytest.raises(TranscriptSummarizationError) as exc_info:
        summarize_transcript([], _identity(), complete=_complete_from_fixture)
    assert exc_info.value.code == "TRANSCRIPT_CONTENT_MISSING"


def test_invalid_source_ref_fails_validation() -> None:
    def bad_complete(system: str, user: str, schema: dict) -> dict:
        payload = _complete_from_fixture(system, user, schema)
        payload["meeting_facts"][0]["source_refs"][0]["excerpt_pointer"] = "turn:99"
        return payload

    with pytest.raises(TranscriptSummarizationError) as exc_info:
        summarize_transcript(_turns(), _identity(), complete=bad_complete)
    assert exc_info.value.code == "TRANSCRIPT_SUMMARY_VALIDATION_FAILED"


def test_forbidden_raw_turn_field_fails() -> None:
    def bad_complete(system: str, user: str, schema: dict) -> dict:
        payload = _complete_from_fixture(system, user, schema)
        payload["raw_transcript"] = "must not appear"
        return payload

    with pytest.raises(TranscriptSummarizationError) as exc_info:
        summarize_transcript(_turns(), _identity(), complete=bad_complete)
    assert exc_info.value.code == "TRANSCRIPT_SUMMARY_VALIDATION_FAILED"


def test_truncated_metadata_must_be_consistent() -> None:
    def truncated_complete(system: str, user: str, schema: dict) -> dict:
        payload = json.loads(TRUNCATED_FIXTURE_PATH.read_text(encoding="utf-8"))
        payload["metadata"] = {
            "summary_truncated": True,
            "uncertainty_notes": ["Clipped at token budget."],
            "source_turn_count": 2,
            "summarized_turn_count": 2,
        }
        payload["meeting_facts"] = [
            {
                "text": "Acme uses SAP as the system of record.",
                "origin": "SOURCE_FACT",
                "source_refs": [
                    {
                        "conversation_id": "C1",
                        "speaker_role": "Anna",
                        "excerpt_pointer": "turn:0",
                    }
                ],
                "confidence": "high",
            }
        ]
        return payload

    with pytest.raises(TranscriptSummarizationError):
        summarize_transcript(_turns(), _identity(), complete=truncated_complete)


def test_format_transcript_summary_for_prompt_wraps_block() -> None:
    summary = summarize_transcript(
        _turns(),
        _identity(),
        complete=_complete_from_fixture,
    )
    block = format_transcript_summary_for_prompt(summary)
    assert block.startswith("TRANSCRIPT_SUMMARY_BEGIN\n")
    assert block.endswith("\nTRANSCRIPT_SUMMARY_END")
    assert "turn:0" not in block.split("TRANSCRIPT_SUMMARY_BEGIN", 1)[0]


def test_provider_unavailable_maps_to_explicit_error(monkeypatch: pytest.MonkeyPatch) -> None:
    from llm.claude import client as claude_client

    def raise_missing_key(*_args, **_kwargs):
        raise claude_client.ClaudeClientError(
            "ANTHROPIC_API_KEY is not set. Add it to the .env file before generating a customer report."
        )

    monkeypatch.setattr(
        "services.transcript.summarization.anthropic_structured_complete",
        raise_missing_key,
    )
    with pytest.raises(TranscriptSummarizationError) as exc_info:
        summarize_transcript(_turns(), _identity(), complete=None)
    assert exc_info.value.code == "TRANSCRIPT_SUMMARIZATION_UNAVAILABLE"
