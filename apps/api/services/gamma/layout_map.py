"""Load Gamma journey card to Arbios master layout mappings."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

_CONTRACTS_DIR = Path(__file__).resolve().parents[4] / "packages" / "contracts"
_LAYOUT_MAP_PATH = _CONTRACTS_DIR / "gamma_arbios_layout_map.json"


class LayoutMapContractError(RuntimeError):
    """The layout map contract on disk is unusable."""


@dataclass(frozen=True)
class ArbiosLayoutMapping:
    layout_id: str
    arbios_layout_id: str
    rationale: str


@dataclass(frozen=True)
class GammaArbiosLayoutMap:
    schema_version: str
    mappings: dict[str, ArbiosLayoutMapping]

    def arbios_layout_for(self, layout_id: str) -> str | None:
        mapped = self.mappings.get(layout_id)
        return mapped.arbios_layout_id if mapped else None


@lru_cache(maxsize=1)
def load_gamma_arbios_layout_map() -> GammaArbiosLayoutMap:
    if not _LAYOUT_MAP_PATH.is_file():
        raise LayoutMapContractError(f"Missing layout map at {_LAYOUT_MAP_PATH}")
    raw = json.loads(_LAYOUT_MAP_PATH.read_text(encoding="utf-8"))
    schema_version = raw.get("schema_version")
    mappings_raw = raw.get("mappings")
    if schema_version != "1.0" or not isinstance(mappings_raw, list):
        raise LayoutMapContractError("Invalid gamma_arbios_layout_map.json")
    mappings: dict[str, ArbiosLayoutMapping] = {}
    for item in mappings_raw:
        if not isinstance(item, dict):
            continue
        layout_id = str(item.get("layout_id") or "").strip()
        arbios_id = str(item.get("arbios_layout_id") or "").strip()
        if not layout_id or not arbios_id:
            continue
        mappings[layout_id] = ArbiosLayoutMapping(
            layout_id=layout_id,
            arbios_layout_id=arbios_id,
            rationale=str(item.get("rationale") or ""),
        )
    if not mappings:
        raise LayoutMapContractError("Layout map contains no mappings")
    return GammaArbiosLayoutMap(schema_version=schema_version, mappings=mappings)


def reset_gamma_arbios_layout_map_cache() -> None:
    load_gamma_arbios_layout_map.cache_clear()
