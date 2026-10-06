"""Storage shape of a Borek-engine deck inside the existing plan / slide tables.

The generator's slide dictionaries (``{"layout": "contrast", "title": ...}``) have
no connection to the registered ``*_01`` layouts, so they travel as opaque content:

* ``presentation_plans.plan_json`` carries ``engine: "borek_deck"`` and, per planned
  slide, the finished slide in ``borekSlide``. A plan is immutable once stored, so the
  content that was planned is the content that is rendered.
* ``presentation_versions.slides_json`` / ``slides.slide_spec`` hold one wrapper per
  slide (``engine``, ``layoutId``, ``sourceChapterIds``, ``content``).

This module has no heavy imports so the stores and the orchestrator can use it freely.
"""

from __future__ import annotations

import copy
from typing import Any

PLAN_ENGINE = "borek_deck"
PRE_MEETING = "pre_meeting"
POST_MEETING = "post_meeting"
# Slides whose content is fixed by Borek; they cite no Discovery / meeting source.
FIXED_LAYOUTS = frozenset({"who_we_are", "closing"})


def is_borek_plan(plan_json: Any) -> bool:
    return isinstance(plan_json, dict) and plan_json.get("engine") == PLAN_ENGINE


def is_borek_slide_specs(slide_specs: Any) -> bool:
    return (
        isinstance(slide_specs, list)
        and bool(slide_specs)
        and all(isinstance(spec, dict) and spec.get("engine") == PLAN_ENGINE for spec in slide_specs)
    )


def slide_title(slide: dict[str, Any]) -> str:
    return " ".join(str(slide.get("title") or "").split())


def planned_slide(order: int, slide: dict[str, Any], references: list[str]) -> dict[str, Any]:
    """One entry of ``plan_json['slides']``."""
    layout = str(slide["layout"])
    label = slide_title(slide) or str(slide.get("kicker") or "").strip()
    return {
        "order": order,
        "purpose": f"{layout}: {label}" if label else layout,
        "layoutId": layout,
        "frameworkReferences": list(references),
        "borekSlide": copy.deepcopy(slide),
    }


def borek_slide_spec(planned: dict[str, Any]) -> dict[str, Any]:
    """The persisted SlideSpec wrapper for one planned slide."""
    order = int(planned["order"])
    content = copy.deepcopy(planned["borekSlide"])
    return {
        "schema_version": "1.0",
        "engine": PLAN_ENGINE,
        "layoutId": str(planned["layoutId"]),
        "title": slide_title(content),
        "sourceChapterIds": [str(item) for item in planned.get("frameworkReferences") or []],
        "slideId": f"slide_{order:02d}",
        "content": content,
    }


def borek_slides_from_specs(slide_specs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Generator slide dictionaries, ready for ``borek_pptx.build_deck``."""
    return [copy.deepcopy(spec["content"]) for spec in slide_specs]
