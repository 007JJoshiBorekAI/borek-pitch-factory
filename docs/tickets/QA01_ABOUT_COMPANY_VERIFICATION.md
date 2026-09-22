# QA-01 — Stage 1 intake + research outputs

**Owner:** Jaya Joshi (QA)  
**Phase:** 3 · **Priority:** P0  
**Source:** `Pitch Factory input_output.docx` — Stage 1 Pre-meeting

## Goal

Verify Stage 1 intake matches the docx and research outputs are generated from
documents + intake (not transcripts).

## Test scenarios

1. **Docx intake fields** — Enter client web page, POC name/position, sales topic,
   About company. Confirm all persist on reload.
2. **Voice recording** — Record or upload audio for sales topic; confirm transcript
   appears and is used (or graceful fallback if STT unavailable).
3. **Research brief** — Upload client document with known facts. Confirm outputs
   include: brief description, headcount, HQ, decision makers, revenue — only from
   stated/retrieved facts, no invention.
4. **Hypothesis + relevance** — Confirm hypothesis for Borek support and product
   relevance sections present and grounded.
5. **No transcript on Stage 1** — Confirm transcript upload hidden; API rejects
   transcript-only First contact path.

## Done when

- Five scenarios signed off with evidence
- Defects filed for any failure before close

## Depends on

- MS-33, BT-34, BT-35 on test environment
