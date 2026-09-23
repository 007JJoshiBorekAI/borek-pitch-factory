"""BT-36 — TranscriptSummary schema contract."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

import jsonschema
import pytest

CONTRACTS_DIR = Path(__file__).resolve().parents[3] / "packages" / "contracts"
SCHEMA_PATH = CONTRACTS_DIR / "transcript_summary.schema.json"
FIXTURE_DIR = CONTRACTS_DIR / "fixtures"
FIXTURE_NAMES = ("transcript_summary.complete", "transcript_summary.truncated")


@pytest.fixture(scope="module")
def schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def complete() -> dict:
    return json.loads((FIXTURE_DIR / "transcript_summary.complete.json").read_text(encoding="utf-8"))


def test_schema_is_frozen_object_with_no_extra_properties(schema: dict) -> None:
    assert schema["additionalProperties"] is False
    required = set(schema["required"])
    assert {
        "schema_version",
        "transcript_id",
        "conversation_id",
        "opportunity_id",
        "prompt_version",
        "participants",
        "meeting_facts",
        "decisions",
        "action_items",
        "open_questions",
        "requirements_and_constraints",
        "metadata",
    } <= required
    meta = schema["$defs"]["SummaryMetadata"]["properties"]
    assert "summary_truncated" in meta
    assert "uncertainty_notes" in meta


def test_every_frozen_fixture_validates(schema: dict) -> None:
    for name in FIXTURE_NAMES:
        payload = json.loads((FIXTURE_DIR / f"{name}.json").read_text(encoding="utf-8"))
        jsonschema.validate(instance=payload, schema=schema)
        assert payload["schema_version"] == "1.0"
        assert payload["prompt_version"] == "transcript-summary:v1"


def test_truncated_fixture_flags_metadata(schema: dict) -> None:
    payload = json.loads((FIXTURE_DIR / "transcript_summary.truncated.json").read_text(encoding="utf-8"))
    jsonschema.validate(instance=payload, schema=schema)
    assert payload["metadata"]["summary_truncated"] is True
    assert payload["metadata"]["summarized_turn_count"] < payload["metadata"]["source_turn_count"]
    assert payload["metadata"]["uncertainty_notes"]


def test_stated_fact_without_source_refs_fails(schema: dict, complete: dict) -> None:
    payload = deepcopy(complete)
    payload["meeting_facts"][0]["source_refs"] = []
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(instance=payload, schema=schema)


def test_unknown_root_field_fails(schema: dict, complete: dict) -> None:
    payload = deepcopy(complete)
    payload["raw_turns"] = []
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(instance=payload, schema=schema)
