# TSK-015 — Automated MOM

**Owner:** Mayank Somwani  
**Phase:** After TSK-009 (live Jamie) and BT-36 summary  
**Source:** 21 Sep feature-redefinition PDF

## Goal

File minutes of meeting from `TRANSCRIPT_SUMMARY` plus Jamie participants/actions when live. Never paste raw speaker turns into the LLM.

## Inputs

- Stored transcript (audit only)
- `transcript_summary.schema.json`
- Meeting feedback (`PUT /meeting-feedback`)
- Jamie ingest participants/actions when `source` is live (dummy fixture until TSK-009)

## Output

Stage 2 `outputs.mom` already returns a review JSON from the summary. TSK-015 Done-when is filing that MOM through the AT-61 archive shape once Jamie actions exist.

## Do not

- Manual-transcription product path
- Invent attendees or actions
- Absorb MS-35 UI
