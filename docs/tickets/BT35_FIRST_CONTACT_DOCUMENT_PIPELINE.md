# BT-35 — First contact client document pipeline

**Owner:** Mayank Somwani
**Phase:** 3 · **Priority:** P0  
**Added:** 21 September 2026 — Feature redefinition sprint  
**Source:** `Pitch Factory input_output.docx` — Stage 1 document-based prep

## Goal

Client documents are the **primary source for Stage 1 (First contact)**. Meeting
transcripts are rejected as the Stage 1 input; they are required later on Deepening
(Stage 2).

## API

- `POST /opportunities/{id}/client-documents` — multipart, private storage
- Formats: `.pdf`, `.docx`, `.txt` → plain text sections for LLM

## Orchestration

**First contact:**

- Require ≥1 processed client document
- Reject framework/research jobs that rely only on transcripts
- Feed document text + Stage 1 intake (BT-34) into research and output pipelines

**Deepening (Stage 2):**

- Require meeting transcript (Jamie transcript per docx)
- Client documents optional supplementary input

## Done when

- Stage 1 job runs from documents + intake without transcript
- Transcript-only First contact refused with classified error
- Deepening still requires transcript
- Integration test passes

## Depends on

- BT-34

## Blocks

- MS-34, BT-36, QA-02
