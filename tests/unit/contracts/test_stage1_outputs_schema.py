"""BT-36 — Stage1Outputs schema contract."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

import jsonschema
import pytest

CONTRACTS_DIR = Path(__file__).resolve().parents[3] / "packages" / "contracts"
SCHEMA_PATH = CONTRACTS_DIR / "stage1_outputs.schema.json"
FIXTURE_DIR = CONTRACTS_DIR / "fixtures"
FIXTURE_NAMES = ("stage1_outputs.generated", "stage1_outputs.unknown")


@pytest.fixture(scope="module")
def schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def generated() -> dict:
    return json.loads((FIXTURE_DIR / "stage1_outputs.generated.json").read_text(encoding="utf-8"))


def test_schema_is_frozen_object_with_no_extra_properties(schema: dict) -> None:
    assert schema["additionalProperties"] is False
    required = set(schema["required"])
    assert {
        "schema_version",
        "opportunity_id",
        "journey_stage",
        "prompt_version",
        "research_ref",
        "discovery_questions",
        "use_cases",
        "meeting_agenda",
        "presentation_ref",
        "dependencies",
    } <= required
    dq = schema["$defs"]["DiscoveryQuestionCollection"]
    assert dq["allOf"][0]["then"]["properties"]["items"]["minItems"] == 10
    assert dq["allOf"][0]["then"]["properties"]["items"]["maxItems"] == 15


def test_every_frozen_fixture_validates(schema: dict) -> None:
    for name in FIXTURE_NAMES:
        payload = json.loads((FIXTURE_DIR / f"{name}.json").read_text(encoding="utf-8"))
        jsonschema.validate(instance=payload, schema=schema)
        assert payload["schema_version"] == "1.0"
        assert payload["prompt_version"] == "stage1-outputs:v1"
        assert payload["journey_stage"] == "first_contact"


def test_generated_fixture_has_ten_to_fifteen_questions(schema: dict, generated: dict) -> None:
    items = generated["discovery_questions"]["items"]
    assert generated["discovery_questions"]["status"] == "generated"
    assert 10 <= len(items) <= 15
    assert generated["use_cases"]["items"][0]["source_refs"]


def test_nine_discovery_questions_fails(schema: dict, generated: dict) -> None:
    payload = deepcopy(generated)
    payload["discovery_questions"]["items"] = payload["discovery_questions"]["items"][:9]
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(instance=payload, schema=schema)


def test_sixteen_discovery_questions_fails(schema: dict, generated: dict) -> None:
    payload = deepcopy(generated)
    template = payload["discovery_questions"]["items"][0]
    for index in range(11, 17):
        clone = deepcopy(template)
        clone["question_id"] = f"Q{index}"
        payload["discovery_questions"]["items"].append(clone)
    assert len(payload["discovery_questions"]["items"]) == 16
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(instance=payload, schema=schema)


def test_source_fact_question_without_refs_fails(schema: dict, generated: dict) -> None:
    payload = deepcopy(generated)
    payload["discovery_questions"]["items"][3]["source_refs"] = []
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(instance=payload, schema=schema)


def test_unknown_root_field_fails(schema: dict, generated: dict) -> None:
    payload = deepcopy(generated)
    payload["raw_research"] = "invented"
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(instance=payload, schema=schema)
