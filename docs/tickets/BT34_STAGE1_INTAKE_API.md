# BT-34 Stage 1 intake API contract v1

Frozen for MS-33 on 2026-09-22 in **borek-pitch-factory**. Backend scope only; BT-35 and BT-36 are not implemented here.

## Existing opportunity resource

Use the existing authenticated endpoints with the bearer token:

| Method | Path | Success |
| --- | --- | --- |
| POST | `/opportunities` | 201, full OpportunityResponse |
| PATCH | `/opportunities/{opportunity_id}` | 200, full OpportunityResponse |
| GET | `/opportunities/{opportunity_id}` | 200, full OpportunityResponse |
| GET | `/opportunities` | 200, owner's OpportunityResponse array |

### Nested API, flat database

The API exposes **`stage1_intake: Stage1Intake | null`**. Postgres stores nullable flat columns (`client_web_page`, `poc_name`, `poc_position`, `sales_topic_description`, `about_company`, `voice_recording_artifact_id`). Mapping is in `app/services/stage1_intake_store.py`.

Reuse top-level **`client_name`**; do not duplicate it inside `stage1_intake`.

| Field within stage1_intake | Type | Validation |
| --- | --- | --- |
| `client_web_page` | string or null | Max 2,048; absolute HTTP(S) URL, hostname, no credentials/whitespace |
| `poc_name` | string or null | Max 200 characters |
| `poc_position` | string or null | Max 200 characters |
| `sales_topic_description` | string or null | Max 20,000 characters |
| `about_company` | string or null | Max 20,000 characters |

All fields optional. Empty/whitespace-only strings normalize to null. NUL (`\u0000`) rejected with 422. Unknown nested keys rejected. Voice/transcript text is **not** a supported nested field.

### PATCH semantics

| Request body | Saved result |
| --- | --- |
| `{"department":"Operations"}` | Existing intake preserved |
| `{"stage1_intake":{"about_company":"Updated"}}` | Entire intake replaced; other four fields read as null |
| `{"stage1_intake":null}` | All intake columns cleared |
| `{"stage1_intake":{}}` | Empty intake; all five fields read as null |

Migration: `027_bt34_stage1_intake.sql`.

## Research resource

`POST /opportunities/{opportunity_id}/stage1-research` — no body, returns JSON conforming to `packages/contracts/stage1_research.schema.json` v1.0.

No approved client research provider is configured. Default response returns unknown client facts and `COMPANY_RESEARCH_PROVIDER_UNAVAILABLE`.

## Voice boundary

`POST /opportunities/{opportunity_id}/stage1-voice` — missing/zero-byte file: 200 `{"status":"not_provided","transcript":null}`. Nonempty file: 503 `STAGE1_VOICE_UNAVAILABLE`. `voice_recording_artifact_id` is never fabricated.

## Errors

| Status | Meaning |
| --- | --- |
| 502 | `STAGE1_RESEARCH_FAILED` |
| 503 | `STAGE1_VOICE_UNAVAILABLE` |

## Completion status

Text intake, prompt integration, research schema, and mocked coverage are implemented locally in **borek-pitch-factory**. BT-34 is **not complete**: external research/voice providers, live migration verification, and QA-01 remain outstanding.
