"""TSK-010: approved Borek presentation branding contract tests."""

from __future__ import annotations

import json
from pathlib import Path

import jsonschema
import pytest

from packages.contracts.presentation_branding import load_borek_presentation_branding
from services.gamma.contract import FORBIDDEN_BRANDING_KEYS
from services.gamma.contract import (
    GammaContentSlot,
    GammaGenerateRequest,
    GammaTemplateError,
    LOCKED_BOREK_TEMPLATE_ID,
    LOCKED_BOREK_TEMPLATE_VERSION,
)
from services.gamma.fixture_client import FixtureGammaClient
from services.gamma.template import load_gamma_template

ROOT = Path(__file__).resolve().parents[3]
CONTRACTS_DIR = ROOT / "packages" / "contracts"
TOKENS_PATH = CONTRACTS_DIR / "borek_design_tokens.json"
SCHEMA_PATH = CONTRACTS_DIR / "borek_design_tokens.schema.json"
GAMMA_TEMPLATE_PATH = CONTRACTS_DIR / "gamma_template.json"


@pytest.fixture(scope="module")
def design_tokens_raw() -> dict:
    return json.loads(TOKENS_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def design_tokens_schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def test_design_tokens_validate_against_schema(
    design_tokens_raw: dict, design_tokens_schema: dict
) -> None:
    jsonschema.validate(instance=design_tokens_raw, schema=design_tokens_schema)


def _clone_tokens(design_tokens_raw: dict) -> dict:
    return json.loads(json.dumps(design_tokens_raw))


@pytest.mark.parametrize(
    "mutator",
    [
        lambda tokens: tokens["colors"]["primary"].update({"hex": "0057B8"}),
        lambda tokens: tokens["colors"]["accent"].update({"hex": "not-a-hex"}),
        lambda tokens: tokens["typography"]["heading_font"].update({"family": "Aptos Display"}),
        lambda tokens: tokens["surfaces"]["cover"].update({"hex": "0D1D51"}),
        lambda tokens: tokens["footer"].update({"left_text": "Wrong footer"}),
        lambda tokens: tokens.update({"unsupported_branding_field": True}),
    ],
)
def test_schema_rejects_invalid_or_unapproved_tokens(
    design_tokens_raw: dict,
    design_tokens_schema: dict,
    mutator,
) -> None:
    invalid = _clone_tokens(design_tokens_raw)
    mutator(invalid)
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(instance=invalid, schema=design_tokens_schema)


def test_python_and_json_contract_share_approved_values(design_tokens_raw: dict) -> None:
    branding = load_borek_presentation_branding()
    assert branding.primary_hex == design_tokens_raw["colors"]["primary"]["hex"].upper()
    assert branding.heading_hex == design_tokens_raw["colors"]["heading"]["hex"].upper()
    assert branding.accent_hex == design_tokens_raw["colors"]["accent"]["hex"].upper()
    assert branding.heading_font.family == design_tokens_raw["typography"]["heading_font"]["family"]
    assert branding.body_font.family == design_tokens_raw["typography"]["body_font"]["family"]


def test_approved_colors_match_arbios_master() -> None:
    branding = load_borek_presentation_branding()
    assert branding.primary_hex == "0D1240"
    assert branding.heading_hex == "0D1240"
    assert branding.body_hex == "515C70"
    assert branding.kicker_hex == "8A90A5"
    assert branding.accent_hex == "124F94"
    assert branding.card_background_hex == "FFFFFF"


def test_approved_typography_is_inter() -> None:
    branding = load_borek_presentation_branding()
    assert branding.heading_font.family == "Inter"
    assert branding.body_font.family == "Inter"


def test_cover_surface_uses_arbios_navy() -> None:
    branding = load_borek_presentation_branding()
    assert branding.cover_appearance == "dark"
    assert branding.cover_hex == "0D1240"
    assert branding.design_contract_version == "2.0"


def test_client_logo_rules_match_gamma_template() -> None:
    branding = load_borek_presentation_branding()
    gamma_client_logo = load_gamma_template().client_logo

    assert branding.client_logo.slot == gamma_client_logo.slot
    assert branding.client_logo.cards == gamma_client_logo.cards
    assert branding.client_logo.position == gamma_client_logo.position
    assert branding.client_logo.max_height_pct == gamma_client_logo.max_height_pct
    assert branding.client_logo.min_clear_space_pct == gamma_client_logo.min_clear_space_pct
    assert (
        branding.client_logo.co_brand_with_borek_logo
        == gamma_client_logo.co_brand_with_borek_logo
    )


def test_gamma_locked_keys_match_template_contract() -> None:
    branding = load_borek_presentation_branding()
    gamma_template = json.loads(GAMMA_TEMPLATE_PATH.read_text(encoding="utf-8"))

    assert set(branding.gamma_locked_keys) == set(gamma_template["branding"]["locked_keys"])
    assert set(branding.gamma_locked_keys) == set(FORBIDDEN_BRANDING_KEYS)


def test_approved_tokens_do_not_use_fallback_renderer_palette(
    design_tokens_raw: dict,
) -> None:
    approved_hex = {
        design_tokens_raw["colors"]["primary"]["hex"],
        design_tokens_raw["colors"]["heading"]["hex"],
        design_tokens_raw["colors"]["accent"]["hex"],
        design_tokens_raw["colors"]["card_background"]["hex"],
    }
    fallback_hex = {"0057B8", "182230", "667085"}
    assert approved_hex.isdisjoint(fallback_hex)


def test_gamma_locked_branding_rejects_runtime_overrides() -> None:
    client = FixtureGammaClient()
    base_slots = (
        GammaContentSlot("cover.title", "Invoice 3-way Match"),
        GammaContentSlot("cover.client_name", "Acme Corp"),
    )

    for forbidden_key in load_borek_presentation_branding().gamma_locked_keys:
        with pytest.raises(GammaTemplateError, match="locked"):
            client.generate(
                GammaGenerateRequest(
                    template_id=LOCKED_BOREK_TEMPLATE_ID,
                    template_version=LOCKED_BOREK_TEMPLATE_VERSION,
                    opportunity_id="opp-142",
                    presentation_version_id="pv-9",
                    output_formats=("pptx",),
                    slots=(*base_slots, GammaContentSlot(forbidden_key, "override")),
                    client_logo_ref=None,
                    timeout_seconds=30.0,
                )
            )


def test_fixture_gamma_client_still_reports_branding_locked() -> None:
    client = FixtureGammaClient()
    result = client.generate(
        GammaGenerateRequest(
            template_id=LOCKED_BOREK_TEMPLATE_ID,
            template_version=LOCKED_BOREK_TEMPLATE_VERSION,
            opportunity_id="opp-142",
            presentation_version_id="pv-9",
            output_formats=("pptx",),
            slots=(
                GammaContentSlot("cover.title", "Invoice 3-way Match"),
                GammaContentSlot("cover.client_name", "Acme Corp"),
            ),
            client_logo_ref=None,
            timeout_seconds=30.0,
        )
    )
    assert result.branding_locked is True
