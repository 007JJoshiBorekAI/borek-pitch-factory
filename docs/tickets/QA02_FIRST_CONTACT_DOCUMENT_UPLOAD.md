# QA-02 — Stage 1 documents + first-meeting PPT and agenda

**Owner:** Jaya Joshi (QA)  
**Phase:** 3 · **Priority:** P0  
**Source:** `Pitch Factory input_output.docx` — Stage 1 expected outputs

## Goal

Verify client document upload drives Stage 1 generation and all pre-meeting
materials from the docx are produced.

## Test scenarios

1. **Document upload** — Upload `.pdf` and `.docx` on First contact; confirm ≥1
   required, multi-file supported, bad format rejected.
2. **Probing questions** — Confirm 10–15 discovery questions generated, numbered,
   relevant to intake + documents.
3. **Use case relevance** — Confirm use cases from corpus/fixture matched with
   rationale (or honest miss when none apply).
4. **First-meeting PPT** — Download deck; confirm contains: AI-tech generic slides,
   1-page hypothesis slide, use-case slide (3 slide types per docx).
5. **Meeting agenda** — Confirm 1st-meeting agenda generated and downloadable.
6. **Deepening unchanged intake** — Deepening requires transcript, not documents
   as primary input.

## Done when

- All six scenarios pass with screenshots or artifact hashes
- PPT slide count/types match docx spec

## Depends on

- MS-34, BT-36 (Stage 1 output path) on test environment
