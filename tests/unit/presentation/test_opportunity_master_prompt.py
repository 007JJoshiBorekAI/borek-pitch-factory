"""The opportunity-analysis master prompt governs PPT planning and slide writing."""

from __future__ import annotations

from pathlib import Path

from services.framework.synthesis import build_synthesis_system_prompt
from services.presentation.opportunity_master import (
    LAYOUT_SECTIONS,
    load_opportunity_master_prompt,
    slide_writing_guidance,
)
from services.presentation.planner import PROMPT_PATH
from services.slides.content_generation.group_a.common import GroupAGenerationConfig
from services.slides.content_generation.group_a.common import _generation_instructions as group_a_instructions
from services.slides.content_generation.group_c.common import (
    GroupCGenerationConfig,
)
from services.slides.content_generation.group_c.common import (
    _generation_instructions as group_c_instructions,
)

ROOT = Path(__file__).resolve().parents[3]


def test_master_prompt_matches_the_guide_and_german_discussion_paper() -> None:
    prompt = load_opportunity_master_prompt()
    assert "Your AI Department. Delivered, not built." in prompt
    assert "PART 1 · OVERVIEW" in prompt
    assert "PART 2 · DEEP DIVE" in prompt
    assert "PART 3 · PROCESSES OUTSIDE THE SYSTEMS" in prompt
    assert "PART 4 · TARGET PICTURE: SEMI-AUTONOMY" in prompt
    assert "PART 5 · ROLES" in prompt
    assert "PART 6 · DECISION MAP" in prompt
    assert "Opportunity if:" in prompt
    assert "baseline workshop" in prompt
    assert "working hypothesis" in prompt
    assert "do not copy another customer's opportunities" in prompt.lower()


def test_planner_orders_the_deck_as_a_discussion_paper() -> None:
    raw = PROMPT_PATH.read_text(encoding="utf-8")
    expected = (
        ROOT / "apps" / "api" / "llm" / "openai" / "prompts" / "presentation_planner_v2.txt"
    ).read_text(encoding="utf-8")
    assert raw == expected
    prompt = " ".join(raw.lower().split())
    assert "discussion basis" in prompt
    assert "opportunity map" in prompt
    assert "processes outside the systems" in prompt
    assert "decision map" in prompt
    assert "working hypotheses" in prompt
    assert "not a commitment" in prompt


def test_slide_writers_receive_the_master_prompt_for_their_section() -> None:
    cover = group_a_instructions(
        GroupAGenerationConfig(
            layout_id="COVER_01",
            schema_filename="cover_01.schema.json",
            allowed_chapter_ids=("1",),
            provenance_path_guidance="title",
            instructions="Create COVER_01 content.",
        )
    )
    assert "Your AI Department. Delivered, not built." in cover
    assert "THIS SLIDE (COVER_01)" in cover
    assert LAYOUT_SECTIONS["COVER_01"][:40] in cover

    metrics = group_c_instructions(
        GroupCGenerationConfig(
            layout_id="SUCCESS_METRICS_01",
            schema_filename="success_metrics_01.schema.json",
            allowed_chapter_ids=("3", "9"),
            provenance_path_guidance="title",
            instructions="Create SUCCESS_METRICS_01 criteria.",
            exclude_monetary_fields=True,
        )
    )
    assert "THIS SLIDE (SUCCESS_METRICS_01)" in metrics
    assert "no currency, pricing, ROI, payback" in metrics
    assert "excludeMonetaryFields=true" in metrics


def test_synthesis_includes_the_master_prompt() -> None:
    prompt = build_synthesis_system_prompt()
    assert "OPPORTUNITY ANALYSIS MASTER PROMPT" in prompt
    assert "PART 2 · DEEP DIVE" in prompt
    assert "Chapter 5 carries how it works" in prompt
    guidance = slide_writing_guidance("NEXT_STEPS_01")
    assert "baseline workshop" in guidance
