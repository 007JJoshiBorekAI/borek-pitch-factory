"""TSK-014 Phase 2: Gamma pre-render design compliance integration."""

from __future__ import annotations

import copy
import json
import uuid
from pathlib import Path
from unittest.mock import patch

import pytest

from app.config import settings
from app.services import gamma_generation
from app.services.data.memory_store import get_memory_store
from app.services.gamma_stage import build_gamma_request, run_gamma_rendering_stage
from services.gamma.contract import GammaPayloadError

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "packages" / "contracts" / "fixtures" / "gamma_payload"
USER = uuid.UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")


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


def _stage_facts() -> dict:
    return {
        "answered": [
            {
                "kind": "pricing",
                "status": "answered",
                "statement": "Senior Consultant day rate is EUR 1250.00 (indicative).",
                "payload": {
                    "amount": "1250.00",
                    "currency": "EUR",
                    "unit": "day",
                    "indicative": True,
                },
                "sources": [
                    {
                        "corpus_id": "borek-internal",
                        "corpus_version": "2026.09.03",
                        "document_id": "RC-2026-Q3",
                        "document_type": "rate_card",
                        "document_version": "2026.Q3.1",
                        "fact_id": "price.invoice-3way.senior-consultant.day-rate",
                        "provenance_marker": "es39",
                    }
                ],
            }
        ]
    }


def _opportunity(store, *, journey_stage: str | None = None) -> dict:
    row = store.create_opportunity(
        user_id=USER,
        client_name="Acme",
        opportunity_name="Invoice 3-way Match",
        department="Finance",
        language="en",
        pii_redaction_enabled=True,
        additional_client_information=None,
    )
    if journey_stage is not None:
        row["journey_stage"] = journey_stage
    return row


@pytest.fixture
def gamma_stage_env(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "PRESENTATION_ENGINE", "gamma")
    monkeypatch.setattr(settings, "GAMMA_EXECUTION_MODE", "fixture")
    monkeypatch.setattr(settings, "ARTIFACT_ROOT", str(tmp_path))
    return tmp_path


@pytest.mark.parametrize(
    ("stage", "framework"),
    [
        (
            "first_contact",
            _confirmed({"1": "Borek information pack.", "13": "Book a deepening conversation."}),
        ),
        (
            "deepening",
            _confirmed({"1": "Tailored pitch.", "4": "Matching gap.", "13": "Confirm scope."}),
        ),
        (
            "concretisation",
            _confirmed(
                {"1": "Priced proposal.", "9": "EUR 1250.00 / day (indicative).", "13": "Confirm rate."},
                company_facts=_stage_facts(),
            ),
        ),
    ],
)
def test_valid_stage_payloads_reach_gamma_provider(
    gamma_stage_env,
    stage: str,
    framework: dict,
) -> None:
    store = get_memory_store()
    opportunity = _opportunity(store, journey_stage=stage)
    with patch("app.services.gamma_stage.generate_with_egress_policy") as provider_call:
        provider_call.side_effect = RuntimeError("provider should not run in this test")
        build_gamma_request(
            opportunity=opportunity,
            presentation_version_id=uuid.uuid4(),
            user_id=USER,
            store=store,
            framework=framework,
            stage=stage,
        )
        provider_call.assert_not_called()

    with patch(
        "app.services.gamma_stage.generate_with_egress_policy",
        wraps=gamma_generation.generate_with_egress_policy,
    ) as provider_call:
        run_gamma_rendering_stage(
            store,
            job_id=uuid.uuid4(),
            opportunity=opportunity,
            presentation_version_id=uuid.uuid4(),
            user_id=USER,
            framework=framework,
            stage=stage,
        )
        assert provider_call.call_count == 1


def test_invalid_branding_slot_rejected_before_provider(gamma_stage_env) -> None:
    store = get_memory_store()
    opportunity = _opportunity(store, journey_stage="first_contact")
    bad_payload = copy.deepcopy(_load_fixture("first_contact.json"))
    bad_payload["slots"].append({"name": "theme", "value": "override"})

    with patch(
        "app.services.gamma_stage.build_gamma_content_payload",
        return_value=bad_payload,
    ):
        with patch("app.services.gamma_stage.generate_with_egress_policy") as provider_call:
            with pytest.raises(GammaPayloadError):
                run_gamma_rendering_stage(
                    store,
                    job_id=uuid.uuid4(),
                    opportunity=opportunity,
                    presentation_version_id=uuid.uuid4(),
                    user_id=USER,
                    stage="first_contact",
                )
            provider_call.assert_not_called()


def test_ineligible_client_logo_rejected_before_provider(gamma_stage_env) -> None:
    store = get_memory_store()
    opportunity = _opportunity(store, journey_stage="first_contact")
    bad_payload = copy.deepcopy(_load_fixture("first_contact.json"))
    bad_payload["client_logo_ref"] = "artifact:logos/acme.png"

    with patch(
        "app.services.gamma_stage.build_gamma_content_payload",
        return_value=bad_payload,
    ):
        with patch("app.services.gamma_stage.generate_with_egress_policy") as provider_call:
            with pytest.raises(GammaPayloadError, match="Client logo is not permitted"):
                run_gamma_rendering_stage(
                    store,
                    job_id=uuid.uuid4(),
                    opportunity=opportunity,
                    presentation_version_id=uuid.uuid4(),
                    user_id=USER,
                    stage="first_contact",
                )
            provider_call.assert_not_called()


def test_pricing_on_first_contact_rejected_before_provider(gamma_stage_env) -> None:
    store = get_memory_store()
    opportunity = _opportunity(store, journey_stage="first_contact")
    bad_payload = copy.deepcopy(_load_fixture("first_contact.json"))
    bad_payload["grounded_facts"] = [
        item
        for item in _load_fixture("concretisation.json")["grounded_facts"]
        if item["kind"] == "pricing"
    ]

    with patch(
        "app.services.gamma_stage.build_gamma_content_payload",
        return_value=bad_payload,
    ):
        with patch("app.services.gamma_stage.generate_with_egress_policy") as provider_call:
            with pytest.raises(GammaPayloadError, match="Pricing facts are only permitted"):
                run_gamma_rendering_stage(
                    store,
                    job_id=uuid.uuid4(),
                    opportunity=opportunity,
                    presentation_version_id=uuid.uuid4(),
                    user_id=USER,
                    stage="first_contact",
                )
            provider_call.assert_not_called()


def test_unknown_stage_rejected_before_provider(gamma_stage_env) -> None:
    store = get_memory_store()
    opportunity = _opportunity(store)
    with patch("app.services.gamma_stage.generate_with_egress_policy") as provider_call:
        with pytest.raises(GammaPayloadError, match="Unknown journey stage"):
            run_gamma_rendering_stage(
                store,
                job_id=uuid.uuid4(),
                opportunity=opportunity,
                presentation_version_id=uuid.uuid4(),
                user_id=USER,
                stage="pitch_v4",
            )
        provider_call.assert_not_called()


def test_existing_fixture_stage_output_unchanged(gamma_stage_env) -> None:
    """Regression: fixture Gamma stage still persists artifacts after the hook."""
    store = get_memory_store()
    opportunity = _opportunity(store, journey_stage="first_contact")
    result = run_gamma_rendering_stage(
        store,
        job_id=uuid.uuid4(),
        opportunity=opportunity,
        presentation_version_id=uuid.uuid4(),
        user_id=USER,
        framework=_confirmed({"1": "Borek information pack.", "13": "Book a deepening conversation."}),
        stage="first_contact",
    )
    assert result["skipped"] is False
    assert result["engine"] == "gamma"
    assert result["branding_locked"] is True
    assert {item["format"] for item in result["artifacts"]} == {"pptx", "pdf"}
