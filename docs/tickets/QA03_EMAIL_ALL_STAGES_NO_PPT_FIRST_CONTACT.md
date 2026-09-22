# QA-03 — Stage 2 outputs + email all stages + Concretisation

**Owner:** Jaya Joshi (QA)  
**Phase:** 4 · **Priority:** P0  
**Source:** `Pitch Factory input_output.docx` — Stage 2 + email on all stages

## Goal

Verify Stage 2 (Deepening) outputs, email on all three journey stages, and
Concretisation regression.

## Stage 2 — After 1st meeting (Deepening)

1. **Inputs** — Provide Jamie transcript + meeting feedback text + optional
   document. Confirm all three intake paths work.
2. **Call summary** — Generated summary matches transcript content; no invented facts.
3. **MOM** — Minutes of meeting artefact present and downloadable.
4. **Draft email** — Post-meeting email draft created; MS-32 review checklist enforced;
   confirm does not auto-send.
5. **Adjusted PPT** — Deck updated from meeting discussion; downloadable; differs from
   Stage 1 first-meeting deck where content changed.

## Email on all 3 stages

6. **First contact email** — Optional pre-meeting email draft available and reviewable.
7. **Deepening email** — Post-meeting email (primary Stage 2 output).
8. **Concretisation email** — Follow-up email available after priced proposal deck.

## Transcript → summary (global rule)

13. Upload a multi-turn meeting transcript on Deepening. Inspect logged LLM payload
    (or test hook): prompt contains `TRANSCRIPT_SUMMARY` block with key facts; **does
    not** contain raw speaker-turn dialogue. Raw transcript still retrievable via API
    for human review.

## Journey unlock

14. First contact completion (research + first-meeting PPT/agenda) unlocks Deepening.
15. Deepening completion (adjusted PPT + email) unlocks Concretisation.
16. Concretisation pricing rules unchanged (ES-39 grounded only).
17. German smoke — one Stage 1 and one Stage 2 path.

## Done when

- All seventeen scenarios documented
- Sign-off blocks release of MS-35 and BT-36

## Depends on

- MS-35, BT-36, QA-01, QA-02 complete
