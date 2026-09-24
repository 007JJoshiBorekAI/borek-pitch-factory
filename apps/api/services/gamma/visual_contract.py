"""Deterministic visual contract checks from the Arbios HTML master."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from services.gamma.design_configuration import build_gamma_design_configuration
from services.gamma.layout_map import load_gamma_arbios_layout_map

_CONTRACTS_DIR = Path(__file__).resolve().parents[4] / "packages" / "contracts"
_VISUAL_CONTRACT_PATH = _CONTRACTS_DIR / "reference_deck_visual_contract.json"


@dataclass(frozen=True)
class VisualContractViolation:
    path: str
    code: str
    message: str


@lru_cache(maxsize=1)
def load_reference_deck_visual_contract() -> dict[str, Any]:
    if not _VISUAL_CONTRACT_PATH.is_file():
        raise RuntimeError(f"Missing visual contract at {_VISUAL_CONTRACT_PATH}")
    raw = json.loads(_VISUAL_CONTRACT_PATH.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise RuntimeError("reference_deck_visual_contract.json must be an object")
    return raw


def collect_visual_contract_violations(
    design_configuration: dict[str, Any] | None = None,
) -> list[VisualContractViolation]:
    """Validate the expected Gamma design configuration against the visual contract."""
    contract = load_reference_deck_visual_contract()
    config = design_configuration or build_gamma_design_configuration()
    checks = contract.get("deterministic_checks") or {}
    violations: list[VisualContractViolation] = []

    expected_version = str(contract.get("design_contract_version") or "")
    actual_version = str(config.get("design_contract_version") or "")
    if expected_version and actual_version != expected_version:
        violations.append(
            VisualContractViolation(
                path="design_configuration.design_contract_version",
                code="VISUAL_CONTRACT_VERSION_MISMATCH",
                message=(
                    f"Design contract version {actual_version!r} does not match "
                    f"visual contract {expected_version!r}."
                ),
            )
        )

    canvas_checks = checks.get("canvas_dimensions") or {}
    canvas = config.get("canvas") if isinstance(config.get("canvas"), dict) else {}
    for key in ("width_px", "height_px"):
        expected = canvas_checks.get(key)
        actual = canvas.get(key)
        if expected is not None and actual != expected:
            violations.append(
                VisualContractViolation(
                    path=f"design_configuration.canvas.{key}",
                    code="VISUAL_CONTRACT_CANVAS_MISMATCH",
                    message=f"Canvas {key} is {actual!r}; visual contract requires {expected!r}.",
                )
            )

    required_colors = checks.get("required_colors") or []
    colors = config.get("colors") if isinstance(config.get("colors"), dict) else {}
    for token_name in required_colors:
        if token_name not in colors:
            violations.append(
                VisualContractViolation(
                    path=f"design_configuration.colors.{token_name}",
                    code="VISUAL_CONTRACT_COLOR_MISSING",
                    message=f"Visual contract requires color token {token_name!r}.",
                )
            )

    footer = config.get("footer") if isinstance(config.get("footer"), dict) else {}
    expected_footer_text = checks.get("footer_left_text")
    if expected_footer_text and footer.get("left_text") != expected_footer_text:
        violations.append(
            VisualContractViolation(
                path="design_configuration.footer.left_text",
                code="VISUAL_CONTRACT_FOOTER_MISMATCH",
                message="Footer left text does not match the Arbios master contract.",
            )
        )

    expected_footer_color = str(checks.get("footer_color_hex") or "").upper()
    actual_footer_color = str(footer.get("color_hex") or "").upper()
    if expected_footer_color and actual_footer_color != expected_footer_color:
        violations.append(
            VisualContractViolation(
                path="design_configuration.footer.color_hex",
                code="VISUAL_CONTRACT_FOOTER_MISMATCH",
                message=(
                    f"Footer color {actual_footer_color!r} does not match "
                    f"visual contract {expected_footer_color!r}."
                ),
            )
        )

    typography = config.get("typography") if isinstance(config.get("typography"), dict) else {}
    if checks.get("font_family") and typography.get("heading_font") != checks.get("font_family"):
        violations.append(
            VisualContractViolation(
                path="design_configuration.typography.heading_font",
                code="VISUAL_CONTRACT_FONT_MISMATCH",
                message="Heading font does not match the Arbios Inter-only contract.",
            )
        )

    logo_placements = config.get("logo_placements") if isinstance(config.get("logo_placements"), dict) else {}
    content_logo = logo_placements.get("content_slide")
    if isinstance(content_logo, dict):
        if content_logo.get("anchor") != checks.get("content_logo_anchor"):
            violations.append(
                VisualContractViolation(
                    path="design_configuration.logo_placements.content_slide.anchor",
                    code="VISUAL_CONTRACT_LOGO_MISMATCH",
                    message="Content-slide logo anchor does not match the Arbios master.",
                )
            )
    cover_logo = logo_placements.get("cover")
    if isinstance(cover_logo, dict):
        if cover_logo.get("anchor") != checks.get("cover_logo_anchor"):
            violations.append(
                VisualContractViolation(
                    path="design_configuration.logo_placements.cover.anchor",
                    code="VISUAL_CONTRACT_LOGO_MISMATCH",
                    message="Cover logo anchor does not match the Arbios master.",
                )
            )

    if contract.get("layout_map_required"):
        load_gamma_arbios_layout_map()

    return violations
