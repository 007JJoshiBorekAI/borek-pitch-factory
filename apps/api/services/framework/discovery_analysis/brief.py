"""Presentation brief: the compact hand-off the existing presentation path consumes.

Derived from the analysis and frozen with the approved version. It is a summary for a deck,
not a page list - the presentation never gets one slide per analysis page.
"""

from __future__ import annotations

from typing import Any

MAX_PRIORITIES = 5


def build_presentation_brief(paper: dict[str, Any]) -> dict[str, Any]:
    analysis = paper["analysis"]
    context = paper["intake_context"]
    areas = analysis["areas"]
    # Areas the user's context points at first, then quick wins, then the rest - one lead
    # opportunity per area so the brief spans the organisation instead of one function.
    ranked = sorted(
        areas,
        key=lambda area: (not area["priority"], area["business_case"]["payback_type"] != "quick_win"),
    )[:MAX_PRIORITIES]
    priorities = [
        {
            "area": area["name"],
            "title": area["opportunities"][0]["title"],
            "result": area["opportunities"][0]["result"],
            "payback_type": area["business_case"]["payback_type"],
        }
        for area in ranked
    ]
    workflows = analysis["target_workflows"]
    provenance = analysis["provenance"]
    return {
        "schema_version": "1.0",
        "client_name": context["client_name"],
        "meeting_purpose": context["meeting_purpose"],
        "document_title": analysis["framing"]["document"]["title"],
        "core_thesis": analysis["research"]["core_thesis"]["text"],
        "priority_opportunities": priorities,
        "opportunity_signals": [area["opportunities"][0]["opportunity_signal"] for area in ranked],
        "target_picture_summary": {
            "statement": analysis["framing"]["chapters"]["target"]["key_message"],
            "workflows": [workflow["name"] for workflow in workflows],
            "human_gates": [workflow["human_decision_gate"] for workflow in workflows],
        },
        "provenance": {
            "figures_basis": provenance["figures_basis"],
            "customer_facts_origin": provenance["customer_facts_origin"],
            "source_refs": list(provenance["sources"]),
        },
    }
