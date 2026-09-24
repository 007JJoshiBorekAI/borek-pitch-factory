"""Prior-stage client context for Deepening framework generation (BT-35 / BT-36)."""

from __future__ import annotations

import json
from typing import Any

from services.framework.client_documents import (
    format_client_documents_for_prompt,
    safe_client_document_sources_for_llm,
)

JOURNEY_CONTEXT_RULE = (
    "JOURNEY_CONTEXT holds earlier-stage material (client documents, First contact outputs). "
    "Use it to align terminology and open questions. Do not cite it as transcript turn evidence. "
    "AI hypotheses remain AI_INFERENCE until confirmed in meeting transcripts."
)


def format_stage1_outputs_for_prompt(envelope: dict[str, Any] | None) -> str:
    if not isinstance(envelope, dict):
        return ""
    if str(envelope.get("status") or "") != "ready":
        return ""
    outputs = envelope.get("outputs")
    if not isinstance(outputs, dict):
        return ""
    lines = ["STAGE1_OUTPUTS_BEGIN", "First contact generated outputs (not transcript evidence)."]
    hypothesis = outputs.get("hypothesis")
    if isinstance(hypothesis, dict) and hypothesis.get("statement"):
        lines.append(f"hypothesis: {hypothesis['statement']}")
    relevance = outputs.get("product_relevance")
    if isinstance(relevance, dict) and relevance.get("statement"):
        lines.append(f"product_relevance: {relevance['statement']}")
    questions = outputs.get("discovery_questions") or []
    if questions:
        lines.append("discovery_questions:")
        for item in questions[:15]:
            if isinstance(item, dict) and item.get("text"):
                lines.append(f"- {item['text']}")
    use_cases = outputs.get("use_cases") or []
    if use_cases:
        lines.append("use_cases:")
        for item in use_cases:
            if isinstance(item, dict) and item.get("title"):
                rationale = str(item.get("rationale") or "").strip()
                suffix = f" — {rationale}" if rationale else ""
                lines.append(f"- {item['title']}{suffix}")
    agenda = outputs.get("agenda")
    if isinstance(agenda, dict):
        title = str(agenda.get("title") or "").strip()
        if title:
            lines.append(f"agenda_title: {title}")
        for item in agenda.get("items") or []:
            if isinstance(item, dict) and item.get("label"):
                lines.append(f"- agenda: {item['label']}")
    research = outputs.get("research")
    if isinstance(research, dict) and research:
        lines.append(f"research: {json.dumps(research, ensure_ascii=True)}")
    lines.append("STAGE1_OUTPUTS_END")
    return "\n".join(lines)


def build_journey_context_block(
    *,
    client_document_sources: list[dict[str, Any]] | None,
    stage1_outputs: dict[str, Any] | None,
    redact: bool,
) -> str:
    blocks: list[str] = []
    sources = client_document_sources or []
    if sources:
        safe = safe_client_document_sources_for_llm(sources, redact=redact)
        document_block = format_client_documents_for_prompt(safe)
        if document_block:
            blocks.append(document_block)
    outputs_block = format_stage1_outputs_for_prompt(stage1_outputs)
    if outputs_block:
        blocks.append(outputs_block)
    if not blocks:
        return ""
    return JOURNEY_CONTEXT_RULE + "\n\n" + "\n\n".join(blocks)
