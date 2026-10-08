"""Plan and frozen source manifest of a Master Presentation V1.

Master Presentation V1 = the canonical master deck (immutable) + an appendix planned from one
approved Discovery analysis. The plan carries every slide in finished form, so what was planned
is what is rendered; the manifest records exactly which master and which approved version the
deck was built from. Both are stored with the generation job and never re-derived on a retry.
"""

from __future__ import annotations

import copy
from typing import Any

from services.presentation.borek_deck.deck_plan import PLAN_ENGINE
from services.presentation.master_deck.appendix import (
    DISCOVERY_SCHEMA_VERSION,
    appendix_source_hash,
    approved_analysis,
    plan_appendix,
)
from services.presentation.master_deck.registry import DEFAULT_MASTER_ID, MasterDeck, get_master, verify_master

MASTER_V1 = "master_v1"
MANIFEST_KIND = "master_presentation_v1"
# Product stage of this deck. The post-meeting presentation (V2) is a later stage of the same
# presentation; a new pre-meeting revision stays V1 whatever its version number is.
PRODUCT_VERSION = "V1"
PRODUCT_STAGE = "pre_meeting"
CANONICAL_LAYOUT = "CANONICAL"
PLAN_VERSION = "master-presentation:v1"


def is_master_plan(plan_json: Any) -> bool:
    return isinstance(plan_json, dict) and plan_json.get("deck_kind") == MASTER_V1


def generation_manifest(version_row: dict[str, Any], master: MasterDeck | None = None) -> dict[str, Any]:
    """Identity of everything one V1 generation is built from."""
    master = master or get_master(DEFAULT_MASTER_ID)
    paper = approved_analysis(version_row)
    return {
        "schema_version": "1.0",
        "kind": MANIFEST_KIND,
        "product_version": PRODUCT_VERSION,
        "product_stage": PRODUCT_STAGE,
        **master.identity(),
        "master_slide_count": master.slide_count,
        "approved_discovery_version_id": str(version_row["id"]),
        "approved_discovery_document_id": str(version_row.get("document_id") or paper.get("document_id") or ""),
        "discovery_schema_version": DISCOVERY_SCHEMA_VERSION,
        "appendix_source_hash": appendix_source_hash(paper),
    }


def same_source(left: Any, right: Any) -> bool:
    """Two manifests describe the same master and the same approved Discovery content."""
    keys = ("kind", "master_id", "master_version", "master_sha256", "approved_discovery_version_id", "appendix_source_hash")
    return isinstance(left, dict) and isinstance(right, dict) and all(left.get(key) == right.get(key) and left.get(key) for key in keys)


def build_master_plan(version_row: dict[str, Any], master: MasterDeck | None = None) -> dict[str, Any]:
    """The stored plan: 26 canonical slide references followed by the finished appendix slides."""
    master = master or get_master(DEFAULT_MASTER_ID)
    manifest = verify_master(master)
    paper = approved_analysis(version_row)
    appendix = plan_appendix(paper, first_order=master.slide_count + 1)
    client = str(paper["presentation_brief"].get("client_name") or "").strip()
    slides: list[dict[str, Any]] = [
        {
            "order": slide["number"],
            "purpose": f"canonical: {slide['title']}",
            "layoutId": CANONICAL_LAYOUT,
            "frameworkReferences": [],
            "borekSlide": {
                "layout": "canonical",
                "master_id": master.master_id,
                "master_slide": slide["number"],
                "title": slide["title"],
            },
        }
        for slide in manifest["slides"]
    ]
    slides.extend(
        {
            "order": slide["order"],
            "purpose": slide["purpose"],
            "layoutId": slide["layout_id"],
            "frameworkReferences": list(slide["source_references"]),
            "borekSlide": copy.deepcopy(slide["content"]),
        }
        for slide in appendix
    )
    return {
        "schema_version": "1.0",
        "engine": PLAN_ENGINE,
        "deck_kind": MASTER_V1,
        "prompt_version": PLAN_VERSION,
        "lang": master.language.upper(),
        "title": f"Master Presentation — {client}" if client else "Master Presentation",
        "master": {**master.identity(), "slide_count": master.slide_count},
        "appendix": {"first_slide": master.slide_count + 1, "slide_count": len(appendix), "source_hash": appendix_source_hash(paper)},
        "slides": slides,
    }
