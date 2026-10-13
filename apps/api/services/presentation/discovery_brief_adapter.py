"""Compatibility hand-off: an approved AI Opportunity Analysis (Discovery v2) for the deck path.

The existing presentation path reads planner sections keyed like the Discovery v1 pages.
A v2 analysis has no such pages - it has dozens of printed pages that must never become
one slide each. This adapter turns the analysis' frozen ``presentation_brief`` into four
planner sections that reuse existing section keys, so the deck code stays unchanged.
It is not the Master Presentation and it does not rebuild the old seven-page paper.
"""

from __future__ import annotations

from typing import Any

BRIEF_SECTION_KEYS: tuple[str, ...] = ("cover", "client_context", "opportunity", "borek_approach")


def is_opportunity_analysis(paper: Any) -> bool:
    return isinstance(paper, dict) and paper.get("schema_version") == "2.0"


def planner_pages_from_brief(paper: dict[str, Any]) -> list[dict[str, Any]]:
    """Planner sections from the brief frozen on the approved version. Never from the draft."""
    brief = paper.get("presentation_brief")
    if not isinstance(brief, dict):
        raise ValueError("Approved Discovery analysis has no presentation brief")
    target = brief["target_picture_summary"]
    sections = {
        "cover": (
            "Cover",
            {
                "client_name": brief["client_name"],
                "meeting_purpose": brief["meeting_purpose"],
                "document_title": brief["document_title"],
            },
        ),
        "client_context": (
            "Core thesis and opportunity signals",
            {"working_hypothesis": brief["core_thesis"], "signals_to_listen_for": list(brief["opportunity_signals"])},
        ),
        "opportunity": (
            "Priority opportunities",
            {
                "priority_opportunities": [
                    f"{item['title']} — {item['result']}" for item in brief["priority_opportunities"]
                ]
            },
        ),
        "borek_approach": (
            "Target picture",
            {
                "target_picture": target["statement"],
                "people_decide": dict(zip(target["workflows"], target["human_gates"], strict=True)),
            },
        ),
    }
    return [
        {"key": key, "order": order, "title": sections[key][0], "content": sections[key][1]}
        for order, key in enumerate(BRIEF_SECTION_KEYS, start=1)
    ]
