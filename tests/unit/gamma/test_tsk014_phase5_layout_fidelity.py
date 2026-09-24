"""TSK-014 Phase 5: Arbios layout fidelity and structural reference baseline."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from services.gamma.contract import GammaContentSlot
from services.gamma.input_text import build_card_segments
from services.gamma.layout_fidelity import (
    arbios_layout_metadata,
    collect_layout_fidelity_violations,
    load_gamma_arbios_layout_fidelity,
)
from services.gamma.reference_deck_compliance import (
    ReferenceDeckManifest,
    check_reference_deck_compliance,
    discover_reference_deck_manifest,
    load_reference_deck_manifest,
)
from services.gamma.template import load_gamma_template

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "packages" / "contracts" / "fixtures" / "gamma_payload"
MANIFEST_PATH = ROOT / "packages" / "contracts" / "reference_deck_manifest.json"
FIDELITY_PATH = ROOT / "packages" / "contracts" / "gamma_arbios_layout_fidelity.json"


def _load_gamma_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def test_fidelity_contract_aligns_with_layout_map() -> None:
    fidelity = load_gamma_arbios_layout_fidelity()
    template = load_gamma_template()
    for card in template.cards:
        assert fidelity.entry_for(card.layout_id) is not None


def test_fidelity_contract_documents_implementation_choices() -> None:
    raw = json.loads(FIDELITY_PATH.read_text(encoding="utf-8"))
    assert raw["mapping_kind"] == "implementation"
    assert raw["not_exact_master_reproduction"] is True
    approximate = [
        item for item in raw["mappings"] if item.get("fidelity") == "approximate"
    ]
    assert approximate
    assert all("Implementation choice" in item["template_action"] for item in approximate)


def test_internal_metadata_for_cover_is_not_client_facing() -> None:
    metadata = arbios_layout_metadata("COVER_01")
    assert metadata == {
        "layout_id": "COVER_01",
        "arbios_layout_id": "F1",
        "fidelity": "exact",
    }


def test_scratch_card_segments_exclude_arbios_layout_prefixes() -> None:
    segments = build_card_segments(
        (
            GammaContentSlot("cover.title", "Demo"),
            GammaContentSlot("cover.client_name", "Acme"),
            GammaContentSlot("executive_summary.body", "Summary"),
        ),
        planned_slide_specs=(
            {"layoutId": "COVER_01"},
            {"layoutId": "EXECUTIVE_SUMMARY_01"},
        ),
    )
    assert len(segments) == 2
    for segment in segments:
        assert "arbios_layout:" not in segment
        assert "layout_id:" not in segment


def _full_deepening_payload() -> dict:
    payload = _load_gamma_fixture("deepening.json")
    extra_slots = [
        ("context.summary", "Starting context."),
        ("process_flow.body", "Process overview."),
        ("scope.in_scope", "Pilot scope."),
        ("requirements.body", "Requirements matrix."),
        ("architecture.body", "Architecture overview."),
        ("compliance.body", "Security posture."),
        ("timeline.body", "Delivery timeline."),
        ("milestones.body", "Project milestones."),
        ("success_metrics.body", "Success measures."),
        ("open_questions.body", "Open questions."),
    ]
    slots = list(payload["slots"])
    for name, value in extra_slots:
        slots.append({"name": name, "value": value})
    payload = dict(payload)
    payload["slots"] = slots
    return payload


def test_full_deepening_payload_flags_duplicate_l16_master_layout() -> None:
    violations = collect_layout_fidelity_violations(_full_deepening_payload())
    codes = {item.code for item in violations}
    assert "LAYOUT_FIDELITY_DUPLICATE_MASTER" in codes


def test_first_contact_payload_has_no_duplicate_master_layout() -> None:
    payload = _load_gamma_fixture("first_contact.json")
    violations = collect_layout_fidelity_violations(payload)
    assert not any(item.code == "LAYOUT_FIDELITY_DUPLICATE_MASTER" for item in violations)


def test_production_reference_manifest_matches_deepening_profile() -> None:
    manifest = discover_reference_deck_manifest()
    assert manifest is not None
    assert manifest.reference_id == "arbios-deepening-full-v1"
    assert manifest.layout_ids == load_gamma_template().profile("deepening").cards


def test_production_reference_manifest_is_structural_baseline_only() -> None:
    raw = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    assert raw["structural_baseline_only"] is True
    assert raw["delivery_ready_on_structural_pass"] is False
    assert raw["visual_acceptance_required"] is True


def test_structural_reference_pass_does_not_imply_delivery_ready(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GAMMA_THEME_CONTRACT_VERSION", "2.0")
    manifest = ReferenceDeckManifest(
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
    )
    payload = _load_gamma_fixture("deepening.json")
    result = check_reference_deck_compliance(payload, manifest=manifest)
    assert result.status == "structural_pass"
    assert result.visual_acceptance is False
    assert result.render_ready is False
