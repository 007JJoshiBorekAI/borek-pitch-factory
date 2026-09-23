# BT-34 — Intake context + company research in main prompts

**Owner:** Mayank Somwani  
**Phase:** 3 · **Priority:** P0  
**Added:** 21 September 2026 — Feature redefinition sprint  
**Source:** `Pitch Factory input_output.docx` — Stage 1 inputs → research outputs

## Goal

1. Persist all Stage 1 intake fields from MS-33 on the opportunity.
2. Inject intake context into main generation prompts.
3. Generate **Stage 1 research outputs** from client documents + intake (no transcript).

## Schema (freeze day one)

Add to opportunity (migration + API):

- `client_web_page`, `poc_name`, `poc_position`, `sales_topic_description`
- `about_company` (text)
- `voice_recording_artifact_id` (optional — links to stored audio + transcript)

## Prompt injection

Build `STAGE1_INTAKE_BEGIN … END` block in extraction/synthesis user messages from
all non-empty intake fields plus About Company. Rules:

- Use only stated intake and document content; never invent company facts
- Missing research fields → open questions, not guesses
- Ground headcount/revenue from documents or retrieval when available; otherwise mark
  as unknown

## Stage 1 research generation

From client documents + intake, produce structured JSON (new contract) containing:

- Brief company description
- Employee headcount
- HQ location
- Decision makers
- Annual revenue
- Hypothesis for Borek support
- Relevance to product offering

Voice recording: transcribe via existing LLM/STT path; run through
`TRANSCRIPT_SUMMARIZING` (BT-36) before merging into prompt context — inject summary,
not raw transcription.

## Done when

- All MS-33 fields persist and appear in logged prompts when set
- Research JSON validates against frozen schema
- Eval fixture: known client document → expected research fields populated or
  explicitly unknown
- Empty intake still allows document-only path

## Depends on

- None (schema freeze is day-one output)

## Blocks

- MS-33, BT-36, QA-01
