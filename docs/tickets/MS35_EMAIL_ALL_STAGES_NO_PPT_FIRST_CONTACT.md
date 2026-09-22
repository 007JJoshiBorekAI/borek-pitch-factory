# MS-35 — Stage output review UI + email on all 3 stages

**Owner:** Mayank Somwani  
**Phase:** 4 · **Priority:** P0  
**Added:** 21 September 2026 — Feature redefinition sprint  
**Source:** `Pitch Factory input_output.docx` — Stage 1 & 2 expected outputs

## Goal

Review and download surfaces for every docx output, plus **draft email send/review
on all three journey stages**.

## Stage 1 — First contact (Pre-meeting) review screens

After BT-36 generates Stage 1 outputs, show:

| Output (docx) | UI |
| --- | --- |
| Company research brief | Read-only review panel (description, headcount, HQ, decision makers, revenue) |
| Hypothesis + product relevance | Section in research review |
| 10–15 probing questions | Numbered list, copy-friendly |
| Use case relevance | List with rationale |
| First-meeting PPT | Preview + download (AI-tech, hypothesis, use-case slides) |
| 1st-meeting agenda | Review + download |
| Draft email | MS-32-style review *(optional pre-meeting note to client)* |

Workflow steps for First contact:

1. Intake (MS-33 + MS-34)
2. Research review (company brief + questions + use cases)
3. First-meeting materials (PPT + agenda)
4. Email (optional draft review)

## Stage 2 — Deepening (After 1st meeting)

**New intake fields on Deepening:**

- Meeting transcript (Jamie transcript — existing upload)
- Meeting feedback — rep learnings from the call (multiline text)
- Additional documents (optional upload)

**Review screens after generation:**

| Output (docx) | UI |
| --- | --- |
| Call summary | Review panel |
| MOM | Review + download |
| Draft email | MS-32 review — **primary post-meeting artefact** |
| Adjusted PPT | Preview + download |

## Concretisation

Existing deck flow unchanged. Add **Prepare follow-up email** after deck ready
(same MS-32 surface).

## Email on all 3 stages

- First contact: optional pre-meeting / intro email draft
- Deepening: post-meeting email draft (docx primary output)
- Concretisation: proposal follow-up email draft

Confirming review does not auto-send (BT-33 / MS-32 rules).

## Done when

- Every docx Stage 1 and Stage 2 output has a review or download surface
- Deepening intake collects transcript + meeting feedback + optional docs
- Email review available on all three stages
- Workflow step indicator reflects stage-specific paths

## Depends on

- BT-36 (outputs), MS-32 (email review), MS-33, MS-34

## Blocks

- QA-03
