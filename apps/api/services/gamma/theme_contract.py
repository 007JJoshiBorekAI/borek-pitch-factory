"""Gamma theme alignment against the approved design contract (TSK-014 Phase 4)."""

from __future__ import annotations

import os

from packages.contracts.presentation_branding import load_borek_presentation_branding

_ENV_SETTING = "GAMMA_THEME_CONTRACT_VERSION"


def configured_gamma_theme_contract_version() -> str:
    """Return the deployed Gamma theme contract version, if declared."""
    return os.environ.get(_ENV_SETTING, "").strip()


def is_gamma_theme_contract_aligned(*, configured_version: str | None = None) -> bool:
    """True only when the deployed Gamma theme declares the approved contract version."""
    expected = load_borek_presentation_branding().design_contract_version
    actual = (configured_version if configured_version is not None else configured_gamma_theme_contract_version())
    return bool(actual) and actual == expected
