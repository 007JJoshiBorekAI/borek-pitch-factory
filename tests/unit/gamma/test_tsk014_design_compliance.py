"""TSK-014 Phase 1: design compliance foundation."""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from services.gamma.contract import GammaPayloadError
from services.gamma.design_compliance import (
    FIRST_MEETING_UNFROZEN_CODE,
    check_gamma_design_compliance,
    check_stage1_presentation_availability,
    collect_gamma_design_compliance_violations,
    validate_gamma_design_compliance,
)
from services.gamma.payload import build_gamma_content_payload

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "packages" / "contracts" / "fixtures" / "gamma_payload"


def _load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _confirmed(bodies: dict[str, object], *, company_facts: dict | None = None) -> dict:
    payload: dict = {
        "status": "confirmed",
        "chapters": [
            {"chapter_id": chapter_id, "title": f"Chapter {chapter_id}", "body": body}
            for chapter_id, body in bodies.items()
        ],
    }
    if company_facts is not None:
        payload["generation_meta"] = {"company_facts": company_facts}
    return payload


def test_valid_first_contact_fixture_passes() -> None:
    report = check_gamma_design_compliance(_load_fixture("first_contact.json"))
    assert report.passed


def test_valid_deepening_fixture_passes() -> None:
    report = check_gamma_design_compliance(_load_fixture("deepening.json"))
    assert report.passed


def test_valid_concretisation_fixture_passes() -> None:
    report = check_gamma_design_compliance(_load_fixture("concretisation.json"))
    assert report.passed


def test_built_first_contact_payload_passes() -> None:
    payload = build_gamma_content_payload(
        opportunity={"opportunity_name": "Invoice 3-way Match", "client_name": "Acme"},
        framework=_confirmed({"1": "Borek information pack.", "13": "Book a deepening conversation."}),
        stage="first_contact",
    )
    assert check_gamma_design_compliance(payload).passed


def test_built_deepening_payload_passes_without_client_logo() -> None:
    payload = build_gamma_content_payload(
        opportunity={"opportunity_name": "Invoice 3-way Match", "client_name": "Acme"},
        framework=_confirmed({"1": "Tailored pitch.", "13": "Confirm scope."}),
        stage="deepening",
        client_logo_ref=None,
    )
    assert payload["client_logo_ref"] is None
    assert check_gamma_design_compliance(payload).passed


def test_unknown_journey_stage_fails() -> None:
    payload = copy.deepcopy(_load_fixture("first_contact.json"))
    payload["stage"] = "pitch_v4"
    report = check_gamma_design_compliance(payload)
    assert not report.passed
    assert report.violations[0].code == "STAGE_UNKNOWN"


def test_forbidden_branding_slot_fails() -> None:
    payload = copy.deepcopy(_load_fixture("first_contact.json"))
    payload["slots"].append({"name": "theme", "value": "override"})
    report = check_gamma_design_compliance(payload)
    assert not report.passed
    assert any(item.code == "BRANDING_OVERRIDE_FORBIDDEN" for item in report.violations)


def test_forbidden_request_override_fails() -> None:
    payload = _load_fixture("first_contact.json")
    report = check_gamma_design_compliance(
        payload,
        request_overrides={"brand_color": "FF0000"},
    )
    assert not report.passed
    assert any(item.code == "BRANDING_OVERRIDE_FORBIDDEN" for item in report.violations)


def test_pricing_fact_in_first_contact_fails() -> None:
    payload = copy.deepcopy(_load_fixture("first_contact.json"))
    pricing_facts = [
        item
        for item in _load_fixture("concretisation.json")["grounded_facts"]
        if item["kind"] == "pricing"
    ]
    payload["grounded_facts"] = pricing_facts
    report = check_gamma_design_compliance(payload)
    assert not report.passed
    assert any(item.code == "PRICING_NOT_PERMITTED" for item in report.violations)


def test_commercial_content_in_first_contact_fails() -> None:
    payload = copy.deepcopy(_load_fixture("first_contact.json"))
    payload["slots"][0]["value"] = "Investment: EUR 400/month run cost"
    report = check_gamma_design_compliance(payload)
    assert not report.passed
    assert any(item.code == "COMMERCIAL_CONTENT_PROHIBITED" for item in report.violations)


def test_ineligible_client_logo_fails() -> None:
    payload = copy.deepcopy(_load_fixture("first_contact.json"))
    payload["client_logo_ref"] = "artifact:logos/acme.png"
    report = check_gamma_design_compliance(payload)
    assert not report.passed
    assert any(item.code == "CLIENT_LOGO_NOT_PERMITTED" for item in report.violations)


def test_permitted_client_logo_absence_on_deepening_passes() -> None:
    payload = copy.deepcopy(_load_fixture("deepening.json"))
    payload["client_logo_ref"] = None
    assert check_gamma_design_compliance(payload).passed


def test_stage_profile_slot_not_permitted_fails() -> None:
    payload = copy.deepcopy(_load_fixture("first_contact.json"))
    payload["slots"].append({"name": "team.body", "value": "Staffing detail."})
    report = check_gamma_design_compliance(payload)
    assert not report.passed
    assert any(item.code == "STAGE_SLOT_NOT_PERMITTED" for item in report.violations)


def test_approved_token_mismatch_in_design_configuration_fails() -> None:
    payload = _load_fixture("first_contact.json")
    report = check_gamma_design_compliance(
        payload,
        design_configuration={"colors": {"primary": "0057B8"}},
    )
    assert not report.passed
    assert any(item.code == "APPROVED_TOKEN_MISMATCH" for item in report.violations)


def test_validate_gamma_design_compliance_raises_gamma_payload_error() -> None:
    payload = copy.deepcopy(_load_fixture("first_contact.json"))
    payload["stage"] = "unknown"
    with pytest.raises(GammaPayloadError, match="Unknown journey stage") as exc:
        validate_gamma_design_compliance(payload)
    assert exc.value.code == "GAMMA_PAYLOAD_INVALID"


def test_unfrozen_first_contact_presentation_is_not_ready() -> None:
    presentation = {
        "status": "unfrozen",
        "profile": "first_meeting_3",
        "code": FIRST_MEETING_UNFROZEN_CODE,
        "presentation_id": None,
        "download_url": None,
    }
    assert check_stage1_presentation_availability(presentation).passed


def test_first_contact_presentation_marked_ready_fails() -> None:
    presentation = {
        "status": "ready",
        "profile": "first_meeting_3",
        "code": None,
        "presentation_id": "00000000-0000-4000-8000-000000000001",
        "download_url": "https://example.test/deck.pptx",
    }
    report = check_stage1_presentation_availability(presentation)
    assert not report.passed
    assert report.violations[0].code == "FIRST_MEETING_NOT_READY"


def test_unfrozen_first_contact_with_download_url_fails() -> None:
    presentation = {
        "status": "unfrozen",
        "profile": "first_meeting_3",
        "code": FIRST_MEETING_UNFROZEN_CODE,
        "presentation_id": "00000000-0000-4000-8000-000000000001",
        "download_url": "https://example.test/deck.pptx",
    }
    report = check_stage1_presentation_availability(presentation)
    assert not report.passed
    assert any(item.code == "PRESENTATION_NOT_AVAILABLE" for item in report.violations)


def test_branding_contract_locked_keys_remain_aligned() -> None:
    payload = _load_fixture("first_contact.json")
    violations = collect_gamma_design_compliance_violations(payload)
    assert not any(item.code == "BRANDING_CONTRACT_MISMATCH" for item in violations)
