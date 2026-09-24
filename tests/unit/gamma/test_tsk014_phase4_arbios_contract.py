"""TSK-014 Phase 4: Arbios master design contract tests."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from services.gamma.design_compliance import check_gamma_design_compliance
from services.gamma.design_configuration import build_gamma_design_configuration
from services.gamma.layout_map import load_gamma_arbios_layout_map
from services.gamma.reference_deck_compliance import check_reference_deck_compliance
from services.gamma.theme_contract import is_gamma_theme_contract_aligned
from services.gamma.visual_contract import collect_visual_contract_violations

ROOT = Path(__file__).resolve().parents[3]
CONTRACTS = ROOT / "packages" / "contracts"
FIXTURES = CONTRACTS / "fixtures" / "gamma_payload"


def _load_gamma_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def test_build_gamma_design_configuration_matches_tokens() -> None:
    config = build_gamma_design_configuration()
    assert config["design_contract_version"] == "2.0"
    assert config["colors"]["primary"] == "0D1240"
    assert config["colors"]["body"] == "515C70"
    assert config["typography"]["heading_font"] == "Inter"
    assert config["canvas"]["width_px"] == 1920
    assert config["footer"]["left_text"] == (
        "Borek Solutions Group · boreksolutions.de · Confidential"
    )
    assert config["logo_placements"]["content_slide"]["anchor"] == "top_right"
    assert config["logo_placements"]["cover"]["anchor"] == "top_left"


def test_visual_contract_passes_for_expected_configuration() -> None:
    config = build_gamma_design_configuration()
    assert collect_visual_contract_violations(config) == []


def test_all_gamma_cards_map_to_arbios_layouts() -> None:
    layout_map = load_gamma_arbios_layout_map()
    gamma_template = json.loads((CONTRACTS / "gamma_template.json").read_text(encoding="utf-8"))
    layout_ids = {card["layout_id"] for card in gamma_template["cards"]}
    assert layout_ids == set(layout_map.mappings.keys())


def test_legacy_primary_hex_in_design_configuration_fails() -> None:
    payload = _load_gamma_fixture("first_contact.json")
    config = build_gamma_design_configuration()
    config = dict(config)
    config["colors"] = dict(config["colors"])
    config["colors"]["primary"] = "2C567A"
    report = check_gamma_design_compliance(payload, design_configuration=config)
    assert not report.passed
    assert any(item.code == "APPROVED_TOKEN_MISMATCH" for item in report.violations)


def test_use_case_reference_contract_exists() -> None:
    raw = json.loads((CONTRACTS / "use_case_presentation_reference.json").read_text(encoding="utf-8"))
    assert raw["deck_type"] == "use_case_portfolio"
    assert raw["visual_rules_authority"] == "packages/contracts/borek_design_tokens.json"
    assert "use_case_divider" in {block["id"] for block in raw["narrative_blocks"]}


def test_layout_map_is_documented_as_implementation_mapping() -> None:
    raw = json.loads((CONTRACTS / "gamma_arbios_layout_map.json").read_text(encoding="utf-8"))
    assert raw["mapping_kind"] == "implementation"
    assert raw["not_specified_by_reference"] is True


def test_payload_compliance_passes_without_rebuilt_gamma_theme(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GAMMA_THEME_CONTRACT_VERSION", raising=False)
    payload = _load_gamma_fixture("first_contact.json")
    report = check_gamma_design_compliance(payload)
    assert report.payload_compliant is True
    assert report.gamma_theme_contract_aligned is False
    assert report.render_ready is False


def test_render_ready_requires_declared_theme_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GAMMA_THEME_CONTRACT_VERSION", "2.0")
    payload = _load_gamma_fixture("first_contact.json")
    report = check_gamma_design_compliance(payload)
    assert report.payload_compliant is True
    assert report.gamma_theme_contract_aligned is True
    assert report.render_ready is True
    assert is_gamma_theme_contract_aligned() is True


def test_reference_deck_never_sets_visual_acceptance_without_render(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GAMMA_THEME_CONTRACT_VERSION", "2.0")
    payload = _load_gamma_fixture("deepening.json")
    result = check_reference_deck_compliance(payload)
    assert result.passed is True
    assert result.visual_acceptance is False
    assert result.render_ready is False
