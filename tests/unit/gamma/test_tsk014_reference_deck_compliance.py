"""TSK-014 Phase 3: reference-deck acceptance infrastructure."""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from services.gamma.design_compliance import check_gamma_design_compliance
from services.gamma.reference_deck_compliance import (
    REFERENCE_DECK_UNAVAILABLE,
    STRUCTURAL_REFERENCE_FAIL,
    STRUCTURAL_REFERENCE_PASS,
    ReferenceDeckManifest,
    ReferenceDeckManifestError,
    check_reference_deck_compliance,
    discover_reference_deck_manifest,
    load_reference_deck_manifest,
)

ROOT = Path(__file__).resolve().parents[3]
GAMMA_FIXTURES = ROOT / "packages" / "contracts" / "fixtures" / "gamma_payload"


def _load_gamma_fixture(name: str) -> dict:
    return json.loads((GAMMA_FIXTURES / name).read_text(encoding="utf-8"))


def _deepening_manifest() -> ReferenceDeckManifest:
    return ReferenceDeckManifest(
        reference_id="qa-deepening-structural-v1",
        stage="deepening",
        layout_ids=(
            "COVER_01",
            "EXECUTIVE_SUMMARY_01",
            "PROBLEM_SOLUTION_01",
            "TEAM_FTE_01",
            "NEXT_STEPS_01",
        ),
        pricing_permitted=False,
        client_logo_permitted=True,
        forbidden_grounded_fact_kinds=frozenset({"pricing"}),
        required_slots=("cover.title", "next_steps.body"),
        source="Test-only structural reference derived from gamma_payload/deepening.json",
    )


def test_no_repository_reference_manifest_reports_unavailable() -> None:
    assert discover_reference_deck_manifest() is None
    result = check_reference_deck_compliance(_load_gamma_fixture("deepening.json"))
    assert result.status == "unavailable"
    assert result.code == REFERENCE_DECK_UNAVAILABLE
    assert result.passed is False
    assert result.visual_acceptance is False


def test_matching_structural_reference_passes() -> None:
    payload = _load_gamma_fixture("deepening.json")
    result = check_reference_deck_compliance(payload, manifest=_deepening_manifest())
    assert result.status == "structural_pass"
    assert result.code == STRUCTURAL_REFERENCE_PASS
    assert result.passed is True
    assert result.structural_only is True
    assert result.visual_acceptance is False
    assert "Visual sendability review is still required" in result.message


def test_stage_mismatch_fails() -> None:
    payload = copy.deepcopy(_load_gamma_fixture("deepening.json"))
    payload["stage"] = "first_contact"
    result = check_reference_deck_compliance(payload, manifest=_deepening_manifest())
    assert result.status == "structural_fail"
    assert result.code == STRUCTURAL_REFERENCE_FAIL
    assert any(item.code == "REFERENCE_STAGE_MISMATCH" for item in result.violations)


def test_layout_order_mismatch_fails() -> None:
    payload = copy.deepcopy(_load_gamma_fixture("deepening.json"))
    payload["slots"] = list(reversed(payload["slots"]))
    result = check_reference_deck_compliance(payload, manifest=_deepening_manifest())
    assert result.status == "structural_fail"
    assert any(item.code == "REFERENCE_LAYOUT_MISMATCH" for item in result.violations)


def test_missing_required_slot_fails() -> None:
    payload = copy.deepcopy(_load_gamma_fixture("deepening.json"))
    payload["slots"] = [
        slot for slot in payload["slots"] if slot["name"] != "next_steps.body"
    ]
    result = check_reference_deck_compliance(payload, manifest=_deepening_manifest())
    assert result.status == "structural_fail"
    assert any(item.code == "REFERENCE_REQUIRED_SLOT_MISSING" for item in result.violations)


def test_forbidden_pricing_fact_fails() -> None:
    payload = copy.deepcopy(_load_gamma_fixture("deepening.json"))
    payload["grounded_facts"] = [
        item
        for item in _load_gamma_fixture("concretisation.json")["grounded_facts"]
        if item["kind"] == "pricing"
    ]
    result = check_reference_deck_compliance(payload, manifest=_deepening_manifest())
    assert result.status == "structural_fail"
    assert any(item.code == "REFERENCE_PRICING_FORBIDDEN" for item in result.violations)


def test_ineligible_client_logo_fails() -> None:
    manifest = ReferenceDeckManifest(
        reference_id="qa-first-contact-structural-v1",
        stage="first_contact",
        layout_ids=("COVER_01", "EXECUTIVE_SUMMARY_01", "NEXT_STEPS_01"),
        pricing_permitted=False,
        client_logo_permitted=False,
        forbidden_grounded_fact_kinds=frozenset({"pricing", "reference", "staffing"}),
        required_slots=("cover.title",),
    )
    payload = copy.deepcopy(_load_gamma_fixture("first_contact.json"))
    payload["client_logo_ref"] = "artifact:logos/acme.png"
    result = check_reference_deck_compliance(payload, manifest=manifest)
    assert result.status == "structural_fail"
    assert any(item.code == "REFERENCE_CLIENT_LOGO_FORBIDDEN" for item in result.violations)


def test_manifest_loader_rejects_invalid_schema_version(tmp_path: Path) -> None:
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps({"schema_version": "9.9"}), encoding="utf-8")
    with pytest.raises(ReferenceDeckManifestError, match="schema_version"):
        load_reference_deck_manifest(path)


def test_manifest_loader_rejects_unknown_stage(tmp_path: Path) -> None:
    path = tmp_path / "manifest.json"
    path.write_text(
        json.dumps(
            {
                "schema_version": "1.0",
                "reference_id": "bad-stage",
                "stage": "pitch_v4",
                "layout_ids": ["COVER_01"],
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(ReferenceDeckManifestError, match="not a known journey stage"):
        load_reference_deck_manifest(path)


def test_manifest_loader_rejects_invented_layout_ids(tmp_path: Path) -> None:
    path = tmp_path / "manifest.json"
    path.write_text(
        json.dumps(
            {
                "schema_version": "1.0",
                "reference_id": "bad-layout",
                "stage": "deepening",
                "layout_ids": ["INVENTED_CARD_01"],
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(ReferenceDeckManifestError, match="not declared template cards"):
        load_reference_deck_manifest(path)


def test_unknown_slot_in_payload_fails_without_crashing() -> None:
    payload = copy.deepcopy(_load_gamma_fixture("deepening.json"))
    payload["slots"].append({"name": "theme", "value": "override"})
    result = check_reference_deck_compliance(payload, manifest=_deepening_manifest())
    assert result.status == "structural_fail"
    assert any(item.code == "REFERENCE_SLOT_UNKNOWN" for item in result.violations)


def test_cross_stage_manifest_cannot_pass_wrong_stage_payload() -> None:
    payload = _load_gamma_fixture("first_contact.json")
    result = check_reference_deck_compliance(payload, manifest=_deepening_manifest())
    assert result.status == "structural_fail"
    assert result.passed is False
    assert any(item.code == "REFERENCE_STAGE_MISMATCH" for item in result.violations)


def test_design_compliance_and_reference_acceptance_remain_separate() -> None:
    payload = _load_gamma_fixture("deepening.json")
    design = check_gamma_design_compliance(payload)
    reference = check_reference_deck_compliance(payload)
    assert design.passed is True
    assert reference.passed is False
    assert reference.code == REFERENCE_DECK_UNAVAILABLE
