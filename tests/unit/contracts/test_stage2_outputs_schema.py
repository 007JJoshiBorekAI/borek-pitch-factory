"""BT-36 — Stage2Outputs schema contract."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

import jsonschema
import pytest

CONTRACTS_DIR = Path(__file__).resolve().parents[3] / "packages" / "contracts"
SCHEMA_PATH = CONTRACTS_DIR / "stage2_outputs.schema.json"
FIXTURE_DIR = CONTRACTS_DIR / "fixtures"
FIXTURE_NAMES = ("stage2_outputs.generated", "stage2_outputs.unknown")


@pytest.fixture(scope="module")
def schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def generated() -> dict:
    return json.loads((FIXTURE_DIR / "stage2_outputs.generated.json").read_text(encoding="utf-8"))


def test_schema_is_frozen_object_with_no_extra_properties(schema: dict) -> None:
    assert schema["additionalProperties"] is False
    required = set(schema["required"])
    assert {
        "schema_version",
        "opportunity_id",
        "journey_stage",
        "prompt_version",
        "transcript_summary_ref",
        "call_summary",
        "minutes_of_meeting",
        "decisions",
        "action_items",
        "open_questions",
        "presentation_ref",
        "dependencies",
    } <= required
    assert schema["properties"]["journey_stage"]["const"] == "deepening"


def test_every_frozen_fixture_validates(schema: dict) -> None:
    for name in FIXTURE_NAMES:
        payload = json.loads((FIXTURE_DIR / f"{name}.json").read_text(encoding="utf-8"))
        jsonschema.validate(instance=payload, schema=schema)
        assert payload["schema_version"] == "1.0"
        assert payload["prompt_version"] == "stage2-outputs:v1"
        assert payload["transcript_summary_ref"]["artifact_kind"] == "transcript_summary"


def test_generated_fixture_references_transcript_summary(schema: dict, generated: dict) -> None:
    assert generated["call_summary"]["origin"] == "SOURCE_FACT"
    assert generated["minutes_of_meeting"]["sections"]
    assert generated["decisions"][0]["source_refs"][0]["excerpt_pointer"] == "turn:12"


def test_call_summary_without_source_refs_fails(schema: dict, generated: dict) -> None:
    payload = deepcopy(generated)
    payload["call_summary"]["source_refs"] = []
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(instance=payload, schema=schema)


def test_invalid_due_date_fails(schema: dict, generated: dict) -> None:
    payload = deepcopy(generated)
    payload["action_items"][0]["due"] = "next week"
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(instance=payload, schema=schema)


def test_unknown_root_field_fails(schema: dict, generated: dict) -> None:
    payload = deepcopy(generated)
    payload["raw_transcript"] = "must never appear"
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(instance=payload, schema=schema)
