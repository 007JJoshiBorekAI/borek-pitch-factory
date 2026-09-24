"""TSK-010 / TSK-014: load approved Borek presentation branding tokens.

`packages/contracts/borek_design_tokens.json` is the machine-readable source of
truth for approved presentation CI. Gamma applies branding in the theme; the
internal PPTX renderer keeps separate fallback technical tokens under
`apps/renderer/design_system/tokens/`.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

_TOKENS_PATH = Path(__file__).resolve().parent / "borek_design_tokens.json"
_SUPPORTED_SCHEMA_VERSIONS = frozenset({"2.0"})


class PresentationBrandingContractError(RuntimeError):
    """The design token contract on disk is unusable."""


@dataclass(frozen=True)
class ApprovedColorToken:
    name: str
    hex: str
    source: str


@dataclass(frozen=True)
class ApprovedFontToken:
    role: str
    family: str
    source: str


@dataclass(frozen=True)
class ClientLogoRules:
    slot: str
    cards: tuple[str, ...]
    position: str
    max_height_pct: float
    min_clear_space_pct: float
    co_brand_with_borek_logo: bool


@dataclass(frozen=True)
class BorekPresentationBranding:
    schema_version: str
    colors: dict[str, ApprovedColorToken]
    heading_font: ApprovedFontToken
    body_font: ApprovedFontToken
    cover_appearance: str
    cover_hex: str | None
    client_logo: ClientLogoRules
    gamma_locked_keys: tuple[str, ...]
    gamma_theme_id_setting: str
    gamma_template_id_setting: str
    design_contract_version: str
    raw: dict[str, Any]

    @property
    def primary_hex(self) -> str:
        return self.colors["primary"].hex

    @property
    def heading_hex(self) -> str:
        return self.colors["heading"].hex

    @property
    def body_hex(self) -> str:
        return self.colors["body"].hex

    @property
    def kicker_hex(self) -> str:
        return self.colors["kicker"].hex

    @property
    def accent_hex(self) -> str:
        return self.colors["accent"].hex

    @property
    def card_background_hex(self) -> str:
        return self.colors["card_background"].hex


def _require_mapping(raw: dict[str, Any], key: str) -> dict[str, Any]:
    value = raw.get(key)
    if not isinstance(value, dict):
        raise PresentationBrandingContractError(f"Missing or invalid '{key}' block")
    return value


@lru_cache(maxsize=1)
def load_borek_presentation_branding() -> BorekPresentationBranding:
    if not _TOKENS_PATH.is_file():
        raise PresentationBrandingContractError(f"Missing design tokens at {_TOKENS_PATH}")

    raw = json.loads(_TOKENS_PATH.read_text(encoding="utf-8"))
    schema_version = raw.get("schema_version")
    if schema_version not in _SUPPORTED_SCHEMA_VERSIONS:
        raise PresentationBrandingContractError(
            f"Unsupported borek_design_tokens schema_version: {schema_version!r}"
        )

    colors_raw = _require_mapping(raw, "colors")
    colors: dict[str, ApprovedColorToken] = {}
    for name, item in colors_raw.items():
        if not isinstance(item, dict):
            raise PresentationBrandingContractError(f"Invalid color token '{name}'")
        hex_value = item.get("hex")
        source = item.get("source")
        if not isinstance(hex_value, str) or not isinstance(source, str):
            raise PresentationBrandingContractError(f"Invalid color token '{name}'")
        colors[name] = ApprovedColorToken(name=name, hex=hex_value.upper(), source=source)

    typography = _require_mapping(raw, "typography")
    heading_raw = _require_mapping(typography, "heading_font")
    body_raw = _require_mapping(typography, "body_font")
    heading_font = ApprovedFontToken(
        role="heading_font",
        family=str(heading_raw["family"]),
        source=str(heading_raw["source"]),
    )
    body_font = ApprovedFontToken(
        role="body_font",
        family=str(body_raw["family"]),
        source=str(body_raw["source"]),
    )

    surfaces = _require_mapping(raw, "surfaces")
    cover = _require_mapping(surfaces, "cover")
    cover_hex = cover.get("hex")
    if cover_hex is not None and not isinstance(cover_hex, str):
        raise PresentationBrandingContractError("cover.hex must be string or null")

    client_logo_raw = _require_mapping(raw, "client_logo")
    gamma = _require_mapping(raw, "gamma_branding")
    locked_keys = gamma.get("locked_keys")
    if not isinstance(locked_keys, list) or not all(isinstance(k, str) for k in locked_keys):
        raise PresentationBrandingContractError("gamma_branding.locked_keys must be a string list")

    return BorekPresentationBranding(
        schema_version=schema_version,
        colors=colors,
        heading_font=heading_font,
        body_font=body_font,
        cover_appearance=str(cover["appearance"]),
        cover_hex=str(cover_hex).upper() if isinstance(cover_hex, str) else None,
        client_logo=ClientLogoRules(
            slot=str(client_logo_raw["slot"]),
            cards=tuple(str(card) for card in client_logo_raw["cards"]),
            position=str(client_logo_raw["position"]),
            max_height_pct=float(client_logo_raw["max_height_pct"]),
            min_clear_space_pct=float(client_logo_raw["min_clear_space_pct"]),
            co_brand_with_borek_logo=bool(client_logo_raw["co_brand_with_borek_logo"]),
        ),
        gamma_locked_keys=tuple(locked_keys),
        gamma_theme_id_setting=str(gamma["theme_id_setting"]),
        gamma_template_id_setting=str(gamma["template_id_setting"]),
        design_contract_version=str(gamma.get("design_contract_version") or schema_version),
        raw=raw,
    )


def reset_borek_presentation_branding_cache() -> None:
    load_borek_presentation_branding.cache_clear()
