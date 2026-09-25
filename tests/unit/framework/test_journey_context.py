"""Unit tests for journey_context prompt blocks."""

from __future__ import annotations

from services.framework.journey_context import (
    build_journey_context_block,
    format_stage1_outputs_for_prompt,
)


def test_format_stage1_outputs_skips_not_generated() -> None:
    assert format_stage1_outputs_for_prompt({"status": "not_generated", "outputs": None}) == ""


def test_format_stage1_outputs_includes_hypothesis_and_questions() -> None:
    block = format_stage1_outputs_for_prompt(
        {
            "status": "ready",
            "outputs": {
                "hypothesis": {"statement": "Manual AP is the bottleneck", "origin": "AI_HYPOTHESIS"},
                "product_relevance": {"statement": "Borek agents fit matching", "origin": "AI_HYPOTHESIS"},
                "discovery_questions": [{"id": "q1", "text": "How many invoices per month?"}],
                "use_cases": [],
                "agenda": {"title": "Discovery", "items": [{"order": 1, "label": "Pain review"}]},
                "presentation": {
                    "status": "unfrozen",
                    "profile": "first_meeting_3",
                    "code": None,
                    "presentation_id": None,
                    "download_url": None,
                },
                "research": None,
                "generated_at": "2026-01-01T00:00:00Z",
            },
        }
    )
    assert "Manual AP is the bottleneck" in block
    assert "How many invoices per month?" in block
    assert "Pain review" in block


def test_build_journey_context_block_composes_documents_and_outputs() -> None:
    block = build_journey_context_block(
        client_document_sources=[
            {
                "id": "doc-1",
                "file_name": "brief.txt",
                "processing_status": "processed",
                "sections": [{"content": "Annual revenue EUR 120M"}],
            }
        ],
        stage1_outputs={
            "status": "ready",
            "outputs": {
                "hypothesis": {"statement": "Ops-heavy AP", "origin": "AI_HYPOTHESIS"},
                "product_relevance": {"statement": "Agents", "origin": "AI_HYPOTHESIS"},
                "discovery_questions": [{"id": "q1", "text": "Volume?"}],
                "use_cases": [],
                "agenda": {"title": "Intro", "items": [{"order": 1, "label": "Goals"}]},
                "presentation": {
                    "status": "unfrozen",
                    "profile": "first_meeting_3",
                    "code": None,
                    "presentation_id": None,
                    "download_url": None,
                },
                "research": None,
                "generated_at": "2026-01-01T00:00:00Z",
            },
        },
        redact=False,
    )
    assert "Annual revenue EUR 120M" in block
    assert "Ops-heavy AP" in block
    assert "JOURNEY_CONTEXT" in block
