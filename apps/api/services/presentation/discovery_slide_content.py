"""Build PPT #1 SlideSpecs from approved Discovery pages.

This is the content path. It does not read or write a FrameworkObject.
Commercial source sentences are left out of the slide copy. The finished
specs are then rejected if any prohibited commercial string remains.
"""

from __future__ import annotations

from typing import Any

from services.presentation.first_pitch import PAGE_LAYOUTS
from services.presentation.ppt1_constraints import (
    is_ppt1_commercial_text,
    reject_ppt1_slide_content,
)

_SKIP_CONTENT_KEYS = frozenset({"origin", "status", "schema_version"})


def build_discovery_slide_specs(
    plan_json: dict[str, Any],
    pages: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Ground each planned PPT #1 slide in the referenced Discovery page."""
    by_key = {str(page.get("key")): page for page in pages if isinstance(page, dict)}
    specs: list[dict[str, Any]] = []
    for planned in plan_json.get("slides") or []:
        reference = str((planned.get("frameworkReferences") or ["discovery.cover"])[0])
        key = reference.removeprefix("discovery.")
        page = by_key.get(key) or {"key": key, "title": key, "content": None}
        layout_id = str(planned.get("layoutId") or PAGE_LAYOUTS.get(key) or "")
        order = int(planned.get("order") or len(specs) + 1)
        lines = _safe_lines(page.get("content"), fallback=str(page.get("title") or key))
        specs.append(_spec_for_layout(layout_id, key, order, lines))
    reject_ppt1_slide_content(specs)
    return specs


def _spec_for_layout(
    layout_id: str,
    key: str,
    order: int,
    lines: list[str],
) -> dict[str, Any]:
    title = _clip(lines[0])
    detail = _clip(lines[1] if len(lines) > 1 else lines[0])
    reference = f"discovery.{key}"
    base = {
        "schema_version": "1.0",
        "layoutId": layout_id,
        "title": title,
        "sourceChapterIds": [reference],
        "slideId": f"slide_{order:02d}",
    }
    if layout_id == "COVER_01":
        return {
            **base,
            "subtitle": detail,
            "statBadges": [{"value": "Approved", "label": "Discovery"}],
        }
    if layout_id == "CONTEXT_01":
        return {
            **base,
            "problem": _block("Client context", lines[0]),
            "solution": _block("What we know", detail),
            "currentState": _block("Current picture", _clip(_join(lines[:2]))),
            "targetState": _block("Discussion aim", _clip(_join(lines[2:]) or detail)),
        }
    if layout_id == "PROBLEM_SOLUTION_01":
        return {
            **base,
            "problem": _block("Opportunity", lines[0]),
            "solution": _block("Direction", detail),
        }
    if layout_id == "SCOPE_01":
        return {
            **base,
            "included": [_clip(line) for line in lines[:3]],
            "later": [_clip(lines[-1])],
        }
    if layout_id == "EXECUTIVE_SUMMARY_01":
        return {
            **base,
            "headline": title,
            "highlights": [
                {"title": _clip(line), "description": detail} for line in lines[:3]
            ],
        }
    if layout_id == "MILESTONES_01":
        return {
            **base,
            "milestones": [
                {"name": _clip(line), "description": detail} for line in lines[:3]
            ],
        }
    if layout_id == "NEXT_STEPS_01":
        return {
            **base,
            "checklist": [_clip(line) for line in lines[:3]],
            "steps": [
                {"number": index, "text": _clip(line)}
                for index, line in enumerate(lines[:3], start=1)
            ],
            "darkBackground": False,
        }
    raise ValueError(f"PPT #1 has no Discovery content mapping for {layout_id}")


def _block(title: str, description: str) -> dict[str, str]:
    return {"title": title, "description": _clip(description)}


def _safe_lines(content: Any, *, fallback: str) -> list[str]:
    lines = [
        line
        for line in _iter_strings(content)
        if line and not is_ppt1_commercial_text(line)
    ]
    if not lines:
        lines = [fallback if not is_ppt1_commercial_text(fallback) else "Approved Discovery"]
    return lines


def _iter_strings(value: Any) -> list[str]:
    found: list[str] = []

    def walk(node: Any) -> None:
        if isinstance(node, str):
            text = " ".join(node.split())
            if text:
                found.append(text)
            return
        if isinstance(node, dict):
            for key, item in node.items():
                if key in _SKIP_CONTENT_KEYS:
                    continue
                walk(item)
            return
        if isinstance(node, list):
            for item in node:
                walk(item)

    walk(value)
    return found


def _join(lines: list[str]) -> str:
    return " ".join(line for line in lines if line).strip()


def _clip(text: str, limit: int = 240) -> str:
    compact = " ".join(str(text).split())
    if not compact:
        return "Approved Discovery"
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1].rstrip() + "…"
