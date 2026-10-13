"""Edits address logical sections of the analysis, never printed pages.

A page is only a view: editing an opportunity changes the content once, and the map, the
deep dive and the presentation brief all follow when the manifest is rebuilt.
"""

from __future__ import annotations

import copy
from typing import Any

from services.framework.discovery_analysis.model import DiscoveryAnalysisError

_FIELDS: dict[str, tuple[str, ...]] = {
    "thesis": ("text",),
    "framing": ("document", "chapters", "leads"),
    "area": ("name", "lead", "business_case"),
    "opportunity": (
        "title",
        "solution",
        "ai_technology",
        "how_it_works",
        "result",
        "discovery_questions",
        "opportunity_signal",
    ),
    "shadow_process": ("decision", "handled_today_via", "ai_approach"),
    "shadow_findings": ("cards", "points"),
    "target_workflow": ("name", "stages", "autonomous_flow", "human_decision_gate"),
    "target_picture": (
        "diagram_title",
        "diagram_lead",
        "dark_processing_pattern",
        "maturity_levels",
        "learning_loop",
        "points",
    ),
    "closing": ("name", "headline", "paragraphs", "steps"),
    "optional": ("chapter", "lead", "columns", "rows", "footnote"),
}


def edit_section(analysis: dict[str, Any], target: str) -> dict[str, Any]:
    """The editable fields of one logical section, as currently stored."""
    kind, section = _resolve(analysis, target)
    return {field: copy.deepcopy(section[field]) for field in _FIELDS[kind]}


def apply_edits(analysis: dict[str, Any], edits: list[dict[str, Any]]) -> dict[str, Any]:
    """A new analysis with the edits applied. Ids, origins and provenance cannot be edited."""
    updated = copy.deepcopy(analysis)
    seen: set[str] = set()
    for edit in edits:
        target = str(edit["target"])
        if target in seen:
            raise DiscoveryAnalysisError(f"Section {target} was edited more than once")
        seen.add(target)
        kind, section = _resolve(updated, target)
        value = edit["value"]
        unknown = sorted(set(value) - set(_FIELDS[kind]))
        if unknown:
            raise DiscoveryAnalysisError(f"Section {target} has no editable field {', '.join(unknown)}")
        for field, new in value.items():
            section[field] = _merged(section[field], new, f"{target}.{field}")
    return updated


def _merged(current: Any, new: Any, where: str) -> Any:
    """Objects merge key by key on existing keys only; texts and lists are replaced."""
    if isinstance(current, dict):
        if not isinstance(new, dict):
            raise DiscoveryAnalysisError(f"{where} must be an object")
        unknown = sorted(set(new) - set(current))
        if unknown:
            raise DiscoveryAnalysisError(f"{where} has no field {', '.join(unknown)}")
        return {key: _merged(value, new[key], f"{where}.{key}") if key in new else value for key, value in current.items()}
    return copy.deepcopy(new)


def _resolve(analysis: dict[str, Any], target: str) -> tuple[str, dict[str, Any]]:
    kind, _, ref = target.partition(":")
    if kind == "thesis" and not ref:
        return kind, analysis["research"]["core_thesis"]
    if kind in {"framing", "shadow_findings", "target_picture", "closing"} and not ref:
        return kind, analysis[kind]
    if kind == "area":
        return kind, _by_id(analysis["areas"], ref, target)
    if kind == "opportunity":
        area_id, _, opportunity_id = ref.partition("/")
        return kind, _by_id(_by_id(analysis["areas"], area_id, target)["opportunities"], opportunity_id, target)
    if kind == "shadow_process":
        return kind, _by_id(analysis["shadow_processes"], ref, target)
    if kind == "target_workflow":
        return kind, _by_id(analysis["target_workflows"], ref, target)
    if kind == "optional":
        table = analysis["optional_deep_dives"].get(ref)
        if table is not None:
            return kind, table
    raise DiscoveryAnalysisError(f"Unknown section {target}")


def _by_id(items: list[dict[str, Any]], item_id: str, target: str) -> dict[str, Any]:
    for item in items:
        if item["id"] == item_id:
            return item
    raise DiscoveryAnalysisError(f"Unknown section {target}")
