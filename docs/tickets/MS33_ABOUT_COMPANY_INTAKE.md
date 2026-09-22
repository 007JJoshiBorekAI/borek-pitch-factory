# MS-33 — Stage 1 sales intake (docx fields + About Company + voice)

**Owner:** Mayank Somwani  
**Phase:** 3 · **Priority:** P0  
**Added:** 21 September 2026 — Feature redefinition sprint  
**Source:** `Pitch Factory input_output.docx` — Stage 1 Pre-meeting inputs

## Goal

Build the **Stage 1 — Pre-meeting** intake form (First contact journey stage) matching
the docx. Collect everything the sales team provides before the first client meeting.

## Fields (First contact / Stage 1)

| Field | Required | Notes |
| --- | --- | --- |
| Client name | Yes | Existing opportunity field |
| Client web page | Optional | URL with validation |
| POC name | Optional | Point of contact |
| POC position | Optional | Job title / role |
| Sales topic description | Optional | Free text — what the first conversation is about |
| Voice recording | Optional | Record or upload audio for sales topic; transcribe server-side (BT-34) |
| About company | Optional | Free-text background — injected into main prompts (BT-34) |

Persist all fields on the opportunity (new columns — see BT-34). Group under a clear
**Pre-meeting information** section on intake.

## UX

- Voice recording: record in-browser or upload `.mp3`/`.m4a`/`.wav`; show transcript
  preview when ready; failure does not block text-only path
- About company: multiline textarea, ~4 000 char limit with counter
- Helper copy matches docx intent: *Prepare for the first meeting — no meeting
  transcript needed at this stage.*

## Done when

- All docx Stage 1 input fields round-trip on the opportunity
- Voice recording optional; text sales topic works without it
- About company saves and reloads correctly
- First contact intake does **not** show transcript upload (MS-34 handles documents)

## Depends on

- BT-34 (API schema for new fields + voice transcription hook)

## Blocks

- QA-01
