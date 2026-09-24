"""TSK-014 Phase 1: deterministic design compliance for Gamma presentation payloads.

Validates existing content payloads and optional runtime override maps against
JJ-26 / JJ-31 stage profiles and TSK-010 approved branding contracts. Does not
generate content, call providers, or modify live generation behaviour.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import jsonschema

from packages.contracts.presentation_branding import load_borek_presentation_branding
from services.gamma.design_configuration import build_gamma_design_configuration
from services.gamma.layout_map import load_gamma_arbios_layout_map
from services.gamma.theme_contract import is_gamma_theme_contract_aligned
from services.framework.company_facts import UngroundedPriceError, refuse_ungrounded_prices
from services.gamma.contract import FORBIDDEN_BRANDING_KEYS, GammaPayloadError
from services.gamma.payload import gamma_payload_schema
from services.gamma.payload_compliance import find_prohibited_gamma_commercial_paths
from services.gamma.template import (
    GammaTemplate,
    GammaTemplateContractError,
    load_gamma_template,
)

FIRST_MEETING_PROFILE = "first_meeting_3"
FIRST_MEETING_UNFROZEN_CODE = "FIRST_MEETING_PPT_PROFILE_UNFROZEN"

_PRICING_FACT_KIND = "pricing"


@dataclass(frozen=True)
class DesignComplianceViolation:
    path: str
    code: str
    message: str


@dataclass(frozen=True)
class DesignComplianceReport:
    violations: tuple[DesignComplianceViolation, ...]
    gamma_theme_contract_aligned: bool = False

    @property
    def passed(self) -> bool:
        return not self.violations

    @property
    def payload_compliant(self) -> bool:
        """Payload and token contract checks passed (independent of deployed Gamma theme)."""
        return self.passed

    @property
    def render_ready(self) -> bool:
        """True only when payload checks pass and the deployed Gamma theme matches the contract."""
        return self.passed and self.gamma_theme_contract_aligned


def check_gamma_design_compliance(
    payload: dict[str, Any],
    *,
    grounding: dict[str, Any] | None = None,
    request_overrides: dict[str, Any] | None = None,
    design_configuration: dict[str, Any] | None = None,
    template: GammaTemplate | None = None,
) -> DesignComplianceReport:
    """Return a pass/fail report for one Gamma content payload."""
    violations = collect_gamma_design_compliance_violations(
        payload,
        grounding=grounding,
        request_overrides=request_overrides,
        design_configuration=design_configuration,
        template=template,
    )
    return DesignComplianceReport(
        violations=tuple(violations),
        gamma_theme_contract_aligned=is_gamma_theme_contract_aligned(),
    )


def validate_gamma_design_compliance(
    payload: dict[str, Any],
    *,
    grounding: dict[str, Any] | None = None,
    request_overrides: dict[str, Any] | None = None,
    design_configuration: dict[str, Any] | None = None,
    template: GammaTemplate | None = None,
) -> None:
    """Raise GammaPayloadError when the payload violates documented design rules."""
    report = check_gamma_design_compliance(
        payload,
        grounding=grounding,
        request_overrides=request_overrides,
        design_configuration=design_configuration,
        template=template,
    )
    if not report.passed:
        raise GammaPayloadError(report.violations[0].message)


def collect_gamma_design_compliance_violations(
    payload: dict[str, Any],
    *,
    grounding: dict[str, Any] | None = None,
    request_overrides: dict[str, Any] | None = None,
    design_configuration: dict[str, Any] | None = None,
    template: GammaTemplate | None = None,
) -> list[DesignComplianceViolation]:
    """Collect every design-rule violation for one payload without mutating it."""
    contract = template or load_gamma_template()
    violations: list[DesignComplianceViolation] = []

    stage = payload.get("stage")
    if stage is not None and stage not in contract.stage_profiles:
        return [
            DesignComplianceViolation(
                path="stage",
                code="STAGE_UNKNOWN",
                message=f"Unknown journey stage '{stage}'.",
            )
        ]

    violations.extend(_collect_schema_violations(payload))
    if violations:
        return violations

    stage = str(stage or "")
    profile = contract.stage_profiles[stage]

    violations.extend(_collect_template_identity_violations(payload, profile.template_id))
    violations.extend(_collect_stage_slot_violations(payload, contract, stage))
    violations.extend(_collect_branding_slot_violations(payload))
    violations.extend(_collect_pricing_fact_violations(payload, pricing_permitted=profile.pricing_permitted))
    violations.extend(
        _collect_commercial_content_violations(payload, pricing_permitted=profile.pricing_permitted)
    )
    violations.extend(
        _collect_ungrounded_price_violations(
            payload,
            grounding=grounding,
            pricing_permitted=profile.pricing_permitted,
        )
    )
    violations.extend(
        _collect_client_logo_violations(payload, client_logo_permitted=profile.client_logo)
    )
    if request_overrides:
        violations.extend(_collect_request_override_violations(request_overrides))
    violations.extend(_collect_arbios_layout_mapping_violations(payload, contract))
    expected_configuration = build_gamma_design_configuration()
    supplied_configuration = design_configuration or expected_configuration
    violations.extend(
        _collect_design_configuration_violations(
            supplied_configuration,
            expected=expected_configuration,
        )
    )
    violations.extend(_collect_branding_contract_violations())
    return violations


def check_stage1_presentation_availability(
    presentation: dict[str, Any],
) -> DesignComplianceReport:
    """Return whether a Stage 1 presentation envelope respects the unfrozen profile."""
    return DesignComplianceReport(
        violations=tuple(collect_stage1_presentation_compliance_violations(presentation))
    )


def collect_stage1_presentation_compliance_violations(
    presentation: dict[str, Any],
) -> list[DesignComplianceViolation]:
    """First-meeting PPT stays unavailable until JJ-31 freezes the three-slide profile."""
    if presentation.get("profile") != FIRST_MEETING_PROFILE:
        return []

    violations: list[DesignComplianceViolation] = []
    status = presentation.get("status")
    if status == "ready":
        violations.append(
            DesignComplianceViolation(
                path="presentation.status",
                code="FIRST_MEETING_NOT_READY",
                message=(
                    "First-meeting PPT profile remains unfrozen; "
                    "presentation.status must not be ready."
                ),
            )
        )
        return violations

    if status != "unfrozen":
        return violations

    if presentation.get("code") != FIRST_MEETING_UNFROZEN_CODE:
        violations.append(
            DesignComplianceViolation(
                path="presentation.code",
                code="FIRST_MEETING_UNFROZEN",
                message=(
                    "Unfrozen first-meeting presentation must carry code "
                    f"{FIRST_MEETING_UNFROZEN_CODE!r}."
                ),
            )
        )
    if presentation.get("presentation_id") is not None:
        violations.append(
            DesignComplianceViolation(
                path="presentation.presentation_id",
                code="PRESENTATION_NOT_AVAILABLE",
                message="Unfrozen first-meeting presentation must not expose a presentation_id.",
            )
        )
    if presentation.get("download_url") is not None:
        violations.append(
            DesignComplianceViolation(
                path="presentation.download_url",
                code="PRESENTATION_NOT_AVAILABLE",
                message="Unfrozen first-meeting presentation must not expose a download_url.",
            )
        )
    return violations


def _collect_schema_violations(payload: dict[str, Any]) -> list[DesignComplianceViolation]:
    try:
        jsonschema.validate(instance=payload, schema=gamma_payload_schema())
    except jsonschema.ValidationError as exc:
        path = ".".join(str(part) for part in exc.absolute_path) or "$"
        return [
            DesignComplianceViolation(
                path=path,
                code="PAYLOAD_SCHEMA_INVALID",
                message=str(exc.message),
            )
        ]
    return []


def _collect_template_identity_violations(
    payload: dict[str, Any],
    expected_template_id: str,
) -> list[DesignComplianceViolation]:
    actual = str(payload.get("template_id") or "")
    if actual == expected_template_id:
        return []
    return [
        DesignComplianceViolation(
            path="template_id",
            code="TEMPLATE_ID_MISMATCH",
            message=(
                f"Payload template_id {actual!r} does not match stage profile "
                f"template_id {expected_template_id!r}."
            ),
        )
    ]


def _collect_stage_slot_violations(
    payload: dict[str, Any],
    contract: GammaTemplate,
    stage: str,
) -> list[DesignComplianceViolation]:
    allowed = {slot.name for slot in contract.slots_for_stage(stage)}
    declared = {slot.name for slot in contract.slots}
    violations: list[DesignComplianceViolation] = []
    seen: set[str] = set()

    for index, slot in enumerate(payload.get("slots") or []):
        if not isinstance(slot, dict):
            continue
        name = str(slot.get("name") or "")
        path = f"slots[{index}].name"
        if not name:
            violations.append(
                DesignComplianceViolation(
                    path=path,
                    code="SLOT_NAME_REQUIRED",
                    message="Every content slot must have a non-empty name.",
                )
            )
            continue
        if name in seen:
            violations.append(
                DesignComplianceViolation(
                    path=path,
                    code="SLOT_DUPLICATE",
                    message=f"Duplicate slot '{name}'.",
                )
            )
        seen.add(name)
        if name not in declared:
            violations.append(
                DesignComplianceViolation(
                    path=path,
                    code="SLOT_UNKNOWN",
                    message=f"Slot '{name}' is not a named content slot of the Borek template.",
                )
            )
            continue
        if name not in allowed:
            violations.append(
                DesignComplianceViolation(
                    path=path,
                    code="STAGE_SLOT_NOT_PERMITTED",
                    message=f"Slot '{name}' is not permitted for journey stage '{stage}'.",
                )
            )
    return violations


def _collect_branding_slot_violations(payload: dict[str, Any]) -> list[DesignComplianceViolation]:
    violations: list[DesignComplianceViolation] = []
    for index, slot in enumerate(payload.get("slots") or []):
        if not isinstance(slot, dict):
            continue
        name = str(slot.get("name") or "")
        if name in FORBIDDEN_BRANDING_KEYS or name.startswith("brand."):
            violations.append(
                DesignComplianceViolation(
                    path=f"slots[{index}].name",
                    code="BRANDING_OVERRIDE_FORBIDDEN",
                    message="Branding keys are locked in the Gamma template.",
                )
            )
    return violations


def _collect_pricing_fact_violations(
    payload: dict[str, Any],
    *,
    pricing_permitted: bool,
) -> list[DesignComplianceViolation]:
    if pricing_permitted:
        return []
    violations: list[DesignComplianceViolation] = []
    for index, fact in enumerate(payload.get("grounded_facts") or []):
        if not isinstance(fact, dict):
            continue
        if str(fact.get("kind") or "") == _PRICING_FACT_KIND:
            violations.append(
                DesignComplianceViolation(
                    path=f"grounded_facts[{index}].kind",
                    code="PRICING_NOT_PERMITTED",
                    message="Pricing facts are only permitted on a Concretisation payload.",
                )
            )
    return violations


def _collect_commercial_content_violations(
    payload: dict[str, Any],
    *,
    pricing_permitted: bool,
) -> list[DesignComplianceViolation]:
    if pricing_permitted:
        return []
    hits = find_prohibited_gamma_commercial_paths(payload)
    return [
        DesignComplianceViolation(
            path=path,
            code="COMMERCIAL_CONTENT_PROHIBITED",
            message="Gamma payload contains prohibited commercial content for this journey stage.",
        )
        for path in hits
    ]


def _collect_ungrounded_price_violations(
    payload: dict[str, Any],
    *,
    grounding: dict[str, Any] | None,
    pricing_permitted: bool,
) -> list[DesignComplianceViolation]:
    blob = " ".join(
        str(item.get("value") or "")
        for item in payload.get("slots") or []
        if isinstance(item, dict)
    )
    try:
        refuse_ungrounded_prices(
            text=blob,
            grounding=grounding,
            allow_prices=pricing_permitted,
        )
    except UngroundedPriceError as exc:
        return [
            DesignComplianceViolation(
                path="slots",
                code="PRICE_UNGROUNDED",
                message=str(exc),
            )
        ]
    return []


def _collect_client_logo_violations(
    payload: dict[str, Any],
    *,
    client_logo_permitted: bool,
) -> list[DesignComplianceViolation]:
    logo_ref = payload.get("client_logo_ref")
    if logo_ref in (None, ""):
        return []
    if client_logo_permitted:
        return []
    return [
        DesignComplianceViolation(
            path="client_logo_ref",
            code="CLIENT_LOGO_NOT_PERMITTED",
            message="Client logo is not permitted for this journey stage.",
        )
    ]


def _collect_request_override_violations(
    request_overrides: dict[str, Any],
) -> list[DesignComplianceViolation]:
    branding = load_borek_presentation_branding()
    violations: list[DesignComplianceViolation] = []
    for key in request_overrides:
        path = f"request_overrides.{key}"
        if key in branding.gamma_locked_keys or key.startswith("brand."):
            violations.append(
                DesignComplianceViolation(
                    path=path,
                    code="BRANDING_OVERRIDE_FORBIDDEN",
                    message=f"Runtime branding override '{key}' is forbidden.",
                )
            )
    return violations


def _collect_arbios_layout_mapping_violations(
    payload: dict[str, Any],
    contract: GammaTemplate,
) -> list[DesignComplianceViolation]:
    layout_map = load_gamma_arbios_layout_map()
    violations: list[DesignComplianceViolation] = []
    seen_layout_ids: set[str] = set()

    for index, slot in enumerate(payload.get("slots") or []):
        if not isinstance(slot, dict):
            continue
        name = str(slot.get("name") or "")
        if not name:
            continue
        try:
            layout_id = contract.slot(name).layout_id
        except GammaTemplateContractError:
            continue
        if layout_id in seen_layout_ids:
            continue
        seen_layout_ids.add(layout_id)
        if layout_map.arbios_layout_for(layout_id) is None:
            violations.append(
                DesignComplianceViolation(
                    path=f"slots[{index}].layout_id",
                    code="ARBIOS_LAYOUT_UNMAPPED",
                    message=(
                        f"Gamma layout {layout_id!r} has no Arbios master mapping "
                        "in packages/contracts/gamma_arbios_layout_map.json."
                    ),
                )
            )
    return violations


def _collect_design_configuration_violations(
    design_configuration: dict[str, Any],
    *,
    expected: dict[str, Any] | None = None,
) -> list[DesignComplianceViolation]:
    branding = load_borek_presentation_branding()
    violations: list[DesignComplianceViolation] = []
    baseline = expected or build_gamma_design_configuration()

    for key in design_configuration:
        if key in branding.gamma_locked_keys or key.startswith("brand."):
            violations.append(
                DesignComplianceViolation(
                    path=f"design_configuration.{key}",
                    code="BRANDING_OVERRIDE_FORBIDDEN",
                    message=f"Explicit design configuration must not override locked branding key '{key}'.",
                )
            )

    supplied_version = str(design_configuration.get("design_contract_version") or "")
    expected_version = str(baseline.get("design_contract_version") or branding.design_contract_version)
    if supplied_version and supplied_version != expected_version:
        violations.append(
            DesignComplianceViolation(
                path="design_configuration.design_contract_version",
                code="DESIGN_CONTRACT_VERSION_MISMATCH",
                message=(
                    f"Design contract version {supplied_version!r} does not match "
                    f"approved version {expected_version!r}."
                ),
            )
        )

    colors = design_configuration.get("colors")
    if isinstance(colors, dict):
        for token_name, approved in branding.colors.items():
            supplied = colors.get(token_name)
            if supplied is None:
                violations.append(
                    DesignComplianceViolation(
                        path=f"design_configuration.colors.{token_name}",
                        code="APPROVED_TOKEN_MISSING",
                        message=f"Design configuration must declare approved color '{token_name}'.",
                    )
                )
                continue
            supplied_hex = _normalize_hex(supplied)
            if supplied_hex != approved.hex:
                violations.append(
                    DesignComplianceViolation(
                        path=f"design_configuration.colors.{token_name}",
                        code="APPROVED_TOKEN_MISMATCH",
                        message=(
                            f"Supplied color '{token_name}' ({supplied_hex}) "
                            f"does not match approved token ({approved.hex})."
                        ),
                    )
                )

    typography = design_configuration.get("typography")
    if isinstance(typography, dict):
        for role, approved in (
            ("heading_font", branding.heading_font),
            ("body_font", branding.body_font),
        ):
            supplied = typography.get(role)
            if supplied is None:
                violations.append(
                    DesignComplianceViolation(
                        path=f"design_configuration.typography.{role}",
                        code="APPROVED_TOKEN_MISSING",
                        message=f"Design configuration must declare typography '{role}'.",
                    )
                )
                continue
            if str(supplied) != approved.family:
                violations.append(
                    DesignComplianceViolation(
                        path=f"design_configuration.typography.{role}",
                        code="APPROVED_TOKEN_MISMATCH",
                        message=(
                            f"Supplied font '{role}' ({supplied!r}) "
                            f"does not match approved token ({approved.family!r})."
                        ),
                    )
                )

    footer = design_configuration.get("footer")
    expected_footer = baseline.get("footer") if isinstance(baseline.get("footer"), dict) else {}
    if isinstance(footer, dict):
        for key in ("left_text", "color_hex"):
            supplied = footer.get(key)
            expected_value = expected_footer.get(key)
            if expected_value is not None and supplied != expected_value:
                violations.append(
                    DesignComplianceViolation(
                        path=f"design_configuration.footer.{key}",
                        code="VISUAL_CONTRACT_MISMATCH",
                        message=(
                            f"Footer {key} {supplied!r} does not match approved "
                            f"visual contract ({expected_value!r})."
                        ),
                    )
                )

    canvas = design_configuration.get("canvas")
    expected_canvas = baseline.get("canvas") if isinstance(baseline.get("canvas"), dict) else {}
    if isinstance(canvas, dict):
        for key in ("width_px", "height_px"):
            supplied = canvas.get(key)
            expected_value = expected_canvas.get(key)
            if expected_value is not None and supplied != expected_value:
                violations.append(
                    DesignComplianceViolation(
                        path=f"design_configuration.canvas.{key}",
                        code="VISUAL_CONTRACT_MISMATCH",
                        message=(
                            f"Canvas {key} {supplied!r} does not match approved "
                            f"visual contract ({expected_value!r})."
                        ),
                    )
                )

    return violations


@lru_cache(maxsize=1)
def _collect_branding_contract_violations() -> tuple[DesignComplianceViolation, ...]:
    """Ensure TSK-010 locked keys stay aligned with the JJ-26 template contract."""
    branding = load_borek_presentation_branding()
    template = load_gamma_template()
    token_keys = frozenset(branding.gamma_locked_keys)
    template_keys = template.locked_keys
    if token_keys == template_keys:
        return ()
    missing = sorted(template_keys - token_keys)
    extra = sorted(token_keys - template_keys)
    details: list[str] = []
    if missing:
        details.append(f"missing from design tokens: {', '.join(missing)}")
    if extra:
        details.append(f"extra in design tokens: {', '.join(extra)}")
    return (
        DesignComplianceViolation(
            path="branding_contract",
            code="BRANDING_CONTRACT_MISMATCH",
            message="Approved design tokens and Gamma template locked keys diverge (" + "; ".join(details) + ").",
        ),
    )


def _normalize_hex(value: Any) -> str:
    text = str(value).strip().lstrip("#").upper()
    return text
