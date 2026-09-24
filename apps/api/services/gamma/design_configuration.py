"""TSK-014 Phase 4: build the expected Gamma design configuration from approved tokens."""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from packages.contracts.presentation_branding import (
    BorekPresentationBranding,
    load_borek_presentation_branding,
)


def build_gamma_design_configuration(
    branding: BorekPresentationBranding | None = None,
) -> dict[str, Any]:
    """Return the visual contract Gamma themes must implement (not a runtime override)."""
    resolved = branding or load_borek_presentation_branding()
    raw = resolved.raw
    canvas = raw.get("canvas") or {}
    footer = raw.get("footer") or {}
    cards = raw.get("cards") or {}
    logo = raw.get("borek_logo") or {}
    typography = raw.get("typography") or {}

    return {
        "design_contract_version": resolved.design_contract_version,
        "colors": {
            name: token.hex for name, token in resolved.colors.items()
        },
        "semantic_accents": {
            name: str(item.get("hex") or "").upper()
            for name, item in (raw.get("semantic_accents") or {}).items()
            if isinstance(item, dict)
        },
        "surfaces": {
            name: {
                "appearance": str(item.get("appearance") or ""),
                "hex": str(item.get("hex") or "").upper() if item.get("hex") else None,
            }
            for name, item in (raw.get("surfaces") or {}).items()
            if isinstance(item, dict)
        },
        "typography": {
            "heading_font": resolved.heading_font.family,
            "body_font": resolved.body_font.family,
            "scale_px": typography.get("scale_px") or {},
            "rules": list(typography.get("rules") or []),
        },
        "canvas": {
            "width_px": canvas.get("width_px"),
            "height_px": canvas.get("height_px"),
            "content_margin_px": canvas.get("content_margin_px"),
            "cover_margin_px": canvas.get("cover_margin_px"),
        },
        "cards": {
            "fill_hex": str(cards.get("fill_hex") or "").upper(),
            "border_hex": str(cards.get("border_hex") or "").upper(),
            "border_width_px": cards.get("border_width_px"),
            "radius_px": cards.get("radius_px"),
        },
        "footer": {
            "left_text": footer.get("left_text"),
            "color_hex": str(footer.get("color_hex") or "").upper(),
            "font_size_px": footer.get("font_size_px"),
            "position_top_px": footer.get("position_top_px"),
        },
        "logo_placements": logo.get("placements") or {},
        "gamma_locked_keys": list(resolved.gamma_locked_keys),
    }


@lru_cache(maxsize=1)
def expected_design_contract_version() -> str:
    return load_borek_presentation_branding().design_contract_version
