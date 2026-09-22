# MS-34 — Client document upload for First contact

**Owner:** Mayank Somwani  
**Phase:** 3 · **Priority:** P0  
**Added:** 21 September 2026 — Feature redefinition sprint  
**Source:** `Pitch Factory input_output.docx` — Stage 1 uses sales-provided material, not meeting transcripts

## Goal

For **First contact (Stage 1 — Pre-meeting)**, replace transcript upload with
**client document upload**. The sales team uploads briefs, RFPs, company profiles,
or email threads — not Jamie/meeting transcripts (those belong to Stage 2 / Deepening).

## UI

- Panel title: **Client documents**
- Helper: *Upload background material from the client. Meeting transcripts are added
  after the first call (Deepening stage).*
- Formats: `.pdf`, `.docx`, `.txt`
- Multiple files; list with remove
- Continue when ≥1 document uploaded successfully
- Hide `TranscriptUploadPanel` when `journey_stage === first_contact`

## Done when

- First contact shows document upload only
- Deepening shows transcript upload (+ meeting feedback per MS-35)
- Upload errors are clear; files persist on reload

## Depends on

- BT-35 (upload endpoint)

## Blocks

- QA-02
