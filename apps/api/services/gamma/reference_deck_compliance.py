"""TSK-014 Phase 3: reference-deck acceptance infrastructure for Gamma payloads.

Compares an existing Gamma content payload against an optional approved
structural reference manifest. This module does not perform visual review,
pixel comparison, or provider calls.

When no approved reference manifest is configured in the repository, callers
receive REFERENCE_DECK_UNAVAILABLE rather than a false pass.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from services.gamma.design_configuration import build_gamma_design_configuration
from services.gamma.template import GammaTemplate, GammaTemplateContractError, load_gamma_template
from services.gamma.theme_contract import is_gamma_theme_contract_aligned
from services.gamma.visual_contract import collect_visual_contract_violations

REFERENCE_DECK_UNAVAILABLE = "REFERENCE_DECK_UNAVAILABLE"
STRUCTURAL_REFERENCE_FAIL = "STRUCTURAL_REFERENCE_FAIL"
STRUCTURAL_REFERENCE_PASS = "STRUCTURAL_REFERENCE_PASS"

ReferenceDeckStatus = Literal["unavailable", "structural_pass", "structural_fail"]

_CONTRACTS_DIR = Path(__file__).resolve().parents[4] / "packages" / "contracts"
_DEFAULT_MANIFEST_PATH = _CONTRACTS_DIR / "reference_deck_manifest.json"
_FIXTURE_MANIFEST_DIR = _CONTRACTS_DIR / "fixtures" / "reference_deck"


class ReferenceDeckManifestError(RuntimeError):
    """The reference deck manifest on disk is unusable."""


@dataclass(frozen=True)
class ReferenceDeckManifest:
    reference_id: str
    stage: str
    layout_ids: tuple[str, ...]
    pricing_permitted: bool
    client_logo_permitted: bool
    forbidden_grounded_fact_kinds: frozenset[str]
    required_slots: tuple[str, ...] = ()
    source: str = ""


@dataclass(frozen=True)
class ReferenceDeckComplianceViolation:
    path: str
    code: str
    message: str


@dataclass(frozen=True)
class ReferenceDeckComplianceResult:
    status: ReferenceDeckStatus
    code: str
    message: str
    violations: tuple[ReferenceDeckComplianceViolation, ...]
    reference_id: str | None = None
    visual_acceptance: bool = False
    gamma_theme_contract_aligned: bool = False

    @property
    def passed(self) -> bool:
        return self.status == "structural_pass"

    @property
    def structural_only(self) -> bool:
        """True when structural checks passed but visual sendability is not proven."""
        return self.status == "structural_pass"

    @property
    def render_ready(self) -> bool:
        """True only when structural checks pass, theme is aligned, and visual acceptance is proven."""
        return (
            self.status == "structural_pass"
            and self.gamma_theme_contract_aligned
            and self.visual_acceptance
        )


def discover_reference_deck_manifest() -> ReferenceDeckManifest | None:
    """Return the repository-configured reference manifest, if one exists."""
    for path in (
        _DEFAULT_MANIFEST_PATH,
        _FIXTURE_MANIFEST_DIR / "manifest.json",
    ):
        if not path.is_file():
            continue
        try:
            return load_reference_deck_manifest(path)
        except ReferenceDeckManifestError:
            # Malformed on-disk manifests must not produce a false structural pass.
            return None
    return None


def load_reference_deck_manifest(path: Path | str) -> ReferenceDeckManifest:
    raw_path = Path(path)
    try:
        raw = json.loads(raw_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ReferenceDeckManifestError(f"Cannot read reference manifest at {raw_path}: {exc}") from exc
    if not isinstance(raw, dict):
        raise ReferenceDeckManifestError("Reference deck manifest must be a JSON object.")
    return _parse_manifest(raw)


def check_reference_deck_compliance(
    payload: dict[str, Any],
    *,
    manifest: ReferenceDeckManifest | None = None,
    template: GammaTemplate | None = None,
) -> ReferenceDeckComplianceResult:
    """Compare one Gamma payload against an approved structural reference."""
    resolved = manifest or discover_reference_deck_manifest()
    theme_aligned = is_gamma_theme_contract_aligned()
    if resolved is None:
        return ReferenceDeckComplianceResult(
            status="unavailable",
            code=REFERENCE_DECK_UNAVAILABLE,
            message=(
                "No approved reference deck manifest is configured. "
                "Add packages/contracts/reference_deck_manifest.json or "
                "packages/contracts/fixtures/reference_deck/manifest.json."
            ),
            violations=(),
            reference_id=None,
            visual_acceptance=False,
            gamma_theme_contract_aligned=theme_aligned,
        )

    contract = template or load_gamma_template()
    violations = list(
        collect_reference_deck_violations(payload, manifest=resolved, template=contract)
    )
    design_configuration = build_gamma_design_configuration()
    for item in collect_visual_contract_violations(design_configuration):
        violations.append(
            ReferenceDeckComplianceViolation(
                path=item.path,
                code=item.code,
                message=item.message,
            )
        )
    if violations:
        return ReferenceDeckComplianceResult(
            status="structural_fail",
            code=STRUCTURAL_REFERENCE_FAIL,
            message="Gamma payload or visual contract does not match the approved reference deck.",
            violations=tuple(violations),
            reference_id=resolved.reference_id,
            visual_acceptance=False,
            gamma_theme_contract_aligned=theme_aligned,
        )

    message = (
        "Structural and deterministic visual-contract checks passed for "
        f"{resolved.reference_id!r}. Rendered visual acceptance is still required."
    )
    if not theme_aligned:
        message += " Deployed Gamma theme has not declared GAMMA_THEME_CONTRACT_VERSION=2.0."

    return ReferenceDeckComplianceResult(
        status="structural_pass",
        code=STRUCTURAL_REFERENCE_PASS,
        message=message,
        violations=(),
        reference_id=resolved.reference_id,
        visual_acceptance=False,
        gamma_theme_contract_aligned=theme_aligned,
    )


def collect_reference_deck_violations(
    payload: dict[str, Any],
    *,
    manifest: ReferenceDeckManifest,
    template: GammaTemplate,
) -> list[ReferenceDeckComplianceViolation]:
    violations: list[ReferenceDeckComplianceViolation] = []

    stage = str(payload.get("stage") or "")
    if stage != manifest.stage:
        violations.append(
            ReferenceDeckComplianceViolation(
                path="stage",
                code="REFERENCE_STAGE_MISMATCH",
                message=(
                    f"Payload stage {stage!r} does not match reference stage {manifest.stage!r}."
                ),
            )
        )

    actual_layout_ids, layout_violations = _layout_ids_from_payload(payload, template)
    violations.extend(layout_violations)
    if actual_layout_ids != manifest.layout_ids:
        violations.append(
            ReferenceDeckComplianceViolation(
                path="layout_ids",
                code="REFERENCE_LAYOUT_MISMATCH",
                message=(
                    "Payload card order "
                    f"{list(actual_layout_ids)!r} does not match reference "
                    f"{list(manifest.layout_ids)!r}."
                ),
            )
        )

    slot_names = {
        str(item.get("name") or "")
        for item in payload.get("slots") or []
        if isinstance(item, dict)
    }
    for required_slot in manifest.required_slots:
        if required_slot not in slot_names:
            violations.append(
                ReferenceDeckComplianceViolation(
                    path=f"slots.{required_slot}",
                    code="REFERENCE_REQUIRED_SLOT_MISSING",
                    message=f"Required reference slot {required_slot!r} is missing.",
                )
            )

    if not manifest.pricing_permitted:
        for index, fact in enumerate(payload.get("grounded_facts") or []):
            if not isinstance(fact, dict):
                continue
            if str(fact.get("kind") or "") == "pricing":
                violations.append(
                    ReferenceDeckComplianceViolation(
                        path=f"grounded_facts[{index}].kind",
                        code="REFERENCE_PRICING_FORBIDDEN",
                        message="Reference deck forbids pricing facts for this stage.",
                    )
                )

    for index, fact in enumerate(payload.get("grounded_facts") or []):
        if not isinstance(fact, dict):
            continue
        kind = str(fact.get("kind") or "")
        if kind in manifest.forbidden_grounded_fact_kinds:
            violations.append(
                ReferenceDeckComplianceViolation(
                    path=f"grounded_facts[{index}].kind",
                    code="REFERENCE_FACT_KIND_FORBIDDEN",
                    message=f"Reference deck forbids grounded fact kind {kind!r}.",
                )
            )

    logo_ref = payload.get("client_logo_ref")
    if logo_ref not in (None, "") and not manifest.client_logo_permitted:
        violations.append(
            ReferenceDeckComplianceViolation(
                path="client_logo_ref",
                code="REFERENCE_CLIENT_LOGO_FORBIDDEN",
                message="Reference deck forbids client logo for this stage.",
            )
        )

    return violations


def _layout_ids_from_payload(
    payload: dict[str, Any],
    template: GammaTemplate,
) -> tuple[tuple[str, ...], list[ReferenceDeckComplianceViolation]]:
    ordered: list[str] = []
    seen: set[str] = set()
    violations: list[ReferenceDeckComplianceViolation] = []
    for index, slot in enumerate(payload.get("slots") or []):
        if not isinstance(slot, dict):
            continue
        name = str(slot.get("name") or "")
        if not name:
            continue
        try:
            layout_id = template.slot(name).layout_id
        except GammaTemplateContractError:
            violations.append(
                ReferenceDeckComplianceViolation(
                    path=f"slots[{index}].name",
                    code="REFERENCE_SLOT_UNKNOWN",
                    message=f"Slot {name!r} is not a named content slot of the Borek template.",
                )
            )
            continue
        if layout_id in seen:
            continue
        seen.add(layout_id)
        ordered.append(layout_id)
    return tuple(ordered), violations


def _parse_manifest(raw: dict[str, Any]) -> ReferenceDeckManifest:
    schema_version = raw.get("schema_version")
    if schema_version != "1.0":
        raise ReferenceDeckManifestError(
            f"Unsupported reference_deck_manifest schema_version: {schema_version!r}"
        )
    reference_id = str(raw.get("reference_id") or "").strip()
    stage = str(raw.get("stage") or "").strip()
    layout_ids_raw = raw.get("layout_ids")
    if not reference_id or not stage or not isinstance(layout_ids_raw, list) or not layout_ids_raw:
        raise ReferenceDeckManifestError(
            "Reference manifest requires reference_id, stage, and a non-empty layout_ids array."
        )
    required_slots_raw = raw.get("required_slots") or []
    if not isinstance(required_slots_raw, list):
        raise ReferenceDeckManifestError("required_slots must be an array when present.")
    forbidden_raw = raw.get("forbidden_grounded_fact_kinds") or []
    if not isinstance(forbidden_raw, list):
        raise ReferenceDeckManifestError("forbidden_grounded_fact_kinds must be an array when present.")
    layout_ids = tuple(str(item).strip() for item in layout_ids_raw)
    if not layout_ids or any(not item for item in layout_ids):
        raise ReferenceDeckManifestError("layout_ids must contain non-empty strings.")
    contract = load_gamma_template()
    if stage not in contract.stage_profiles:
        raise ReferenceDeckManifestError(
            f"Reference manifest stage {stage!r} is not a known journey stage."
        )
    known_layout_ids = {card.layout_id for card in contract.cards}
    unknown_layouts = [item for item in layout_ids if item not in known_layout_ids]
    if unknown_layouts:
        raise ReferenceDeckManifestError(
            f"Reference manifest layout_ids are not declared template cards: {unknown_layouts}."
        )
    return ReferenceDeckManifest(
        reference_id=reference_id,
        stage=stage,
        layout_ids=layout_ids,
        pricing_permitted=bool(raw.get("pricing_permitted", False)),
        client_logo_permitted=bool(raw.get("client_logo_permitted", False)),
        forbidden_grounded_fact_kinds=frozenset(str(item) for item in forbidden_raw),
        required_slots=tuple(str(item) for item in required_slots_raw),
        source=str(raw.get("source") or ""),
    )
