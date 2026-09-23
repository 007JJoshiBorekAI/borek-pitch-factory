# BT-36 — Stage 1 & 2 output pipelines (docx expected outputs)

**Owner:** Mayank Somwani  
**Phase:** 4 · **Priority:** P0  
**Added:** 21 September 2026 — Feature redefinition sprint  
**Source:** `Pitch Factory input_output.docx` — both stages' expected outputs

## Goal

Implement generation pipelines for **all docx expected outputs**, plus email on
every journey stage.

---

## Global — transcript → summary before LLM

**Applies to every path that reads meeting transcript input** (Deepening,
Concretisation, follow-up extraction, existing framework extraction/synthesis when
transcripts are present).

| Step | What happens |
| --- | --- |
| 1 | Raw transcript stored as today (parsed speaker turns, private storage) |
| 2 | New job stage `TRANSCRIPT_SUMMARIZING` — one structured summary per conversation |
| 3 | Downstream LLM prompts receive `TRANSCRIPT_SUMMARY` block only — **never** raw turns |

Summary content rules:

- Preserve decisions, action items (with named owners where stated), dates/TBD,
  client terms verbatim, and open questions
- Omit small talk and repetition
- Never invent facts not in the transcript
- Cap length to model token budget; set `summary_truncated: true` in metadata when clipped

Consumers updated to read summary instead of raw turns:

- Knowledge extraction (`extraction_v1`)
- Framework synthesis (`synthesis_v1`)
- Follow-up extraction (JJ-32 / `followup_extraction_v1`)
- Stage 2 call summary, MOM, adjusted PPT, and email pipelines

Raw transcript remains available via existing API for human review (MS-32 checklist:
“check against transcript”).

Voice intake (MS-33): transcribed audio → same summarization step before any prompt
injection.

Freeze `transcript_summary.schema.json` in `packages/contracts` on day one.

---

## Stage 1 — First contact (Pre-meeting)

**Inputs:** Stage 1 intake (BT-34) + client documents (BT-35)

**Generate:**

1. Company research brief (description, headcount, HQ, decision makers, revenue)
2. Hypothesis for Borek support
3. Relevance to product offering
4. 10–15 probing / discovery questions
5. Use case relevance (RAG over past Borek use cases — AT-59 corpus when live)
6. **First-meeting PPT** personalised for prospect:
   - AI-tech generic slides
   - 1-page hypothesis slide
   - Use-case slide
7. **1st-meeting agenda**
8. Draft email (optional — pre-meeting intro)

**Job graph (First contact):**

```
CLIENT_DOCUMENT_PROCESSING
  → STAGE1_RESEARCH (BT-34 JSON)
  → DISCOVERY_QUESTIONS + USE_CASE_MATCHING
  → PRESENTATION_PLANNING (3-slide first-meeting profile)
  → GAMMA_RENDERING or PPTX_RENDERING
  → AGENDA_GENERATION
  → FOLLOWUP_EXTRACTION → FOLLOWUP_RENDERING → FOLLOWUP_DRAFT (optional email)
```

First contact **does** produce a deck per docx — a short first-meeting PPT, not the
full 15-card Deepening deck.

---

## Stage 2 — Deepening (After 1st meeting)

**Inputs:** Meeting transcript + meeting feedback + optional documents

**Generate:**

1. Call summary
2. MOM (minutes of meeting)
3. Draft email to send after the call
4. Adjusted PPT based on meeting discussion

**Job graph (Deepening):**

```
TRANSCRIPT_PROCESSING
  → TRANSCRIPT_SUMMARIZING          ← summary only goes to LLM from here on
  → MEETING_FEEDBACK merge
  → FRAMEWORK_SYNTHESIZING (existing path, enriched — uses TRANSCRIPT_SUMMARY)
  → CALL_SUMMARY + MOM_GENERATION
  → PRESENTATION_PLANNING → GAMMA/PPTX (adjusted deck)
  → FOLLOWUP_EXTRACTION → FOLLOWUP_RENDERING → FOLLOWUP_DRAFT
```

---

## Concretisation

Existing priced-proposal pipeline unchanged. Add optional post-deck
`FOLLOWUP_*` stages when user requests email (MS-35).

---

## BT-31 prerequisites

- **First contact complete** = Stage 1 research confirmed + first-meeting PPT/agenda
  generated (and optional email reviewed)
- **Deepening complete** = Stage 2 adjusted PPT + email draft reviewed
- Unlocks chain unchanged in principle; completion markers reference new artefact types

## Contracts to freeze

- `stage1_research.schema.json` — research brief fields
- `stage1_outputs.schema.json` — questions, use cases, agenda
- `stage2_outputs.schema.json` — summary, MOM
- `transcript_summary.schema.json` — structured summary fed to all LLM prompts
- First-meeting PPT profile in `gamma_template.json` (3 slide types per docx)

## Done when

- Logged LLM payloads contain `TRANSCRIPT_SUMMARY` block, not raw speaker turns, for
  every transcript-backed job
- Fixture transcript → valid summary JSON → downstream extraction/synthesis succeed
- Fixture path produces every docx Stage 1 output including 3-slide PPT and agenda
- Fixture path produces every docx Stage 2 output including adjusted PPT and email draft
- Concretisation can trigger follow-up email after deck
- BT-31 eligibility uses new completion markers

## Depends on

- BT-34, BT-35, BT-33 (email), JJ-31 stage profiles (first-meeting slide profile)

## Blocks

- MS-35, QA-02, QA-03
