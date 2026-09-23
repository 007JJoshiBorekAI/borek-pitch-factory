# BT-36 to MS-35 handoff

**READY for wiring (fixture path).** Confirm never sends mail. First-meeting PPT stays `unfrozen` until JJ-31.

Base path: `/opportunities/{opportunity_id}`  
Auth: same bearer token as intake/documents.

## Stage 1 / 2 output retrieval

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/stage1-outputs` | `{ schema_version, opportunity_id, status, outputs }` |
| POST | `/stage1-outputs/generate` | Requires ≥1 processed client document |
| GET | `/stage2-outputs` | Same envelope shape |
| POST | `/stage2-outputs/generate` | Requires ≥1 transcript |

`status` is `not_generated` (outputs null) or `ready`.

Stage 1 `outputs.presentation`: `status: "unfrozen"`, `code: "FIRST_MEETING_PPT_PROFILE_UNFROZEN"`, `profile: "first_meeting_3"`. Do not invent a 3-slide deck.

Stage 2 `outputs.transcript_summary` is the contract object. Call summary / MOM are grounded in that summary plus meeting feedback.

Existing `POST /stage1-research` still works; Stage 1 generate also embeds `outputs.research`.

Contracts for **MS-35 GET/POST retrieve**: `packages/contracts/stage1_outputs.schema.json` and `stage2_outputs.schema.json` on **`main`** (envelope `{ status, outputs }`). Do not wire against `origin/bt/bt36-stage-outputs` generation schemas even though the filenames match.

`030_bt36_stage_outputs.sql` is the live retrieve migration. Transcript summary **table** is `031_transcript_summaries.sql` (never a second `030`).

## Deepening meeting feedback and optional documents

| Method | Path |
| --- | --- |
| GET | `/meeting-feedback` |
| PUT | `/meeting-feedback` body `{ "text": "..." }` |

Optional extra files on Deepening reuse:

`POST /client-documents` (pdf/docx/txt, 10 MB) — same as First contact.

Transcripts stay `POST /transcripts`.

## Email draft retrieve / confirm

Query `journey_stage=first_contact|deepening|concretisation`.

| Method | Path |
| --- | --- |
| GET | `/email-drafts?journey_stage=` |
| POST | `/email-drafts/generate` body `{ "journey_stage": "deepening" }` |
| POST | `/email-drafts/{draft_id}/confirm` body `{ "selected_length": "short\|medium\|extensive" }` |
| POST | `/email-drafts/{draft_id}/send` | Always `400 EMAIL_SEND_FORBIDDEN` |

`draft.send_status` is always `not_sent`. Short body is capped at 150 words.

Contract: `packages/contracts/email_draft.schema.json`.

## Classified errors

| Code | HTTP |
| --- | --- |
| `CLIENT_DOCUMENT_REQUIRED` | 400 |
| `TRANSCRIPT_REQUIRED` | 400 |
| `INVALID_JOURNEY_STAGE` | 400 |
| `INVALID_EMAIL_LENGTH` | 400 |
| `EMAIL_SEND_FORBIDDEN` | 400 |
| `EMAIL_DRAFT_NOT_FOUND` | 404 |

## Not ready

- Live JJ-31 3-slide first-meeting PPT download URL
- Live company-research provider (facts stay `unknown` without evidence)
- Outlook / Graph send (never from confirm)
- Knowledge-extraction / 14-chapter job still uses the legacy transcript prompt (follow-up extraction now uses `TRANSCRIPT_SUMMARY` only)

Migration: `030_bt36_stage_outputs.sql` on live Supabase before QA.
