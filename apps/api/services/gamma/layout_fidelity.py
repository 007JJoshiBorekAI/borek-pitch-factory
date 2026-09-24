"""Arbios master layout fidelity for Gamma journey cards (TSK-014 Phase 5)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from services.gamma.layout_map import load_gamma_arbios_layout_map
from services.gamma.template import GammaTemplate, GammaTemplateContractError, load_gamma_template

_FIDELITY_PATH = (
    Path(__file__).resolve().parents[4] / "packages" / "contracts" / "gamma_arbios_layout_fidelity.json"
)

FidelityLevel = Literal["exact", "approximate", "duplicate_master_layout", "unmapped_journey_card"]


class LayoutFidelityContractError(RuntimeError):
    """The layout fidelity contract on disk is unusable."""


@dataclass(frozen=True)
class LayoutFidelityEntry:
    layout_id: str
    arbios_layout_id: str
    fidelity: FidelityLevel
    master_regions: tuple[str, ...]
    template_action: str


@dataclass(frozen=True)
class LayoutFidelityViolation:
    path: str
    code: str
    message: str


@dataclass(frozen=True)
class GammaArbiosLayoutFidelity:
    schema_version: str
    mappings: dict[str, LayoutFidelityEntry]

    def entry_for(self, layout_id: str) -> LayoutFidelityEntry | None:
        return self.mappings.get(layout_id)


@lru_cache(maxsize=1)
def load_gamma_arbios_layout_fidelity() -> GammaArbiosLayoutFidelity:
    if not _FIDELITY_PATH.is_file():
        raise LayoutFidelityContractError(f"Missing layout fidelity contract at {_FIDELITY_PATH}")
    raw = json.loads(_FIDELITY_PATH.read_text(encoding="utf-8"))
    schema_version = raw.get("schema_version")
    mappings_raw = raw.get("mappings")
    if schema_version != "1.0" or not isinstance(mappings_raw, list):
        raise LayoutFidelityContractError("Invalid gamma_arbios_layout_fidelity.json")
    layout_map = load_gamma_arbios_layout_map()
    mappings: dict[str, LayoutFidelityEntry] = {}
    for item in mappings_raw:
        if not isinstance(item, dict):
            continue
        layout_id = str(item.get("layout_id") or "").strip()
        arbios_layout_id = str(item.get("arbios_layout_id") or "").strip()
        fidelity = str(item.get("fidelity") or "").strip()
        if fidelity not in {
            "exact",
            "approximate",
            "duplicate_master_layout",
            "unmapped_journey_card",
        }:
            raise LayoutFidelityContractError(
                f"Unknown fidelity level {fidelity!r} for layout {layout_id!r}."
            )
        if not layout_id or not arbios_layout_id:
            continue
        mapped = layout_map.arbios_layout_for(layout_id)
        if mapped != arbios_layout_id:
            raise LayoutFidelityContractError(
                f"Fidelity mapping for {layout_id!r} ({arbios_layout_id!r}) "
                f"does not match layout map ({mapped!r})."
            )
        regions_raw = item.get("master_regions") or []
        if not isinstance(regions_raw, list):
            raise LayoutFidelityContractError(f"master_regions must be an array for {layout_id!r}.")
        mappings[layout_id] = LayoutFidelityEntry(
            layout_id=layout_id,
            arbios_layout_id=arbios_layout_id,
            fidelity=fidelity,  # type: ignore[arg-type]
            master_regions=tuple(str(region) for region in regions_raw),
            template_action=str(item.get("template_action") or ""),
        )
    if not mappings:
        raise LayoutFidelityContractError("Layout fidelity contract contains no mappings.")
    return GammaArbiosLayoutFidelity(schema_version=schema_version, mappings=mappings)


def arbios_layout_metadata(layout_id: str) -> dict[str, str] | None:
    """Return internal Arbios layout metadata for a journey card.

    Used by compliance and template planning only. Must not be injected into
    Gamma ``inputText`` because scratch generation runs with ``textMode=preserve``.
    """
    entry = load_gamma_arbios_layout_fidelity().entry_for(layout_id)
    if entry is None:
        mapped = load_gamma_arbios_layout_map().arbios_layout_for(layout_id)
        if not mapped:
            return None
        return {
            "layout_id": layout_id,
            "arbios_layout_id": mapped,
            "fidelity": "unmapped_journey_card",
        }
    return {
        "layout_id": entry.layout_id,
        "arbios_layout_id": entry.arbios_layout_id,
        "fidelity": entry.fidelity,
    }


def layout_ids_from_payload(
    payload: dict[str, Any],
    *,
    template: GammaTemplate | None = None,
) -> tuple[str, ...]:
    contract = template or load_gamma_template()
    ordered: list[str] = []
    seen: set[str] = set()
    for slot in payload.get("slots") or []:
        if not isinstance(slot, dict):
            continue
        name = str(slot.get("name") or "")
        if not name:
            continue
        try:
            layout_id = contract.slot(name).layout_id
        except GammaTemplateContractError:
            continue
        if layout_id in seen:
            continue
        seen.add(layout_id)
        ordered.append(layout_id)
    return tuple(ordered)


def collect_layout_fidelity_violations(
    payload: dict[str, Any],
    *,
    template: GammaTemplate | None = None,
) -> list[LayoutFidelityViolation]:
    """Report duplicate master layouts and unmapped journey cards in one payload."""
    fidelity = load_gamma_arbios_layout_fidelity()
    layout_ids = layout_ids_from_payload(payload, template=template)
    violations: list[LayoutFidelityViolation] = []

    arbios_usage: dict[str, list[str]] = {}
    for layout_id in layout_ids:
        entry = fidelity.entry_for(layout_id)
        if entry is None:
            violations.append(
                LayoutFidelityViolation(
                    path=f"layout_ids.{layout_id}",
                    code="LAYOUT_FIDELITY_UNMAPPED",
                    message=(
                        f"Journey layout {layout_id!r} has no entry in "
                        "gamma_arbios_layout_fidelity.json."
                    ),
                )
            )
            continue
        arbios_usage.setdefault(entry.arbios_layout_id, []).append(layout_id)

    for arbios_layout_id, journey_layouts in sorted(arbios_usage.items()):
        if len(journey_layouts) < 2:
            continue
        violations.append(
            LayoutFidelityViolation(
                path="layout_ids",
                code="LAYOUT_FIDELITY_DUPLICATE_MASTER",
                message=(
                    f"Arbios layout {arbios_layout_id!r} is mapped by multiple journey cards "
                    f"in one deck: {journey_layouts}. The master uses distinct visual structures "
                    "per card; the Gamma template must differentiate these cards."
                ),
            )
        )

    return violations


def reset_gamma_arbios_layout_fidelity_cache() -> None:
    load_gamma_arbios_layout_fidelity.cache_clear()
