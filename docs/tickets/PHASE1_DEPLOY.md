# Phase 1 deploy checklist (Mayank)

**Phase 1 code is on `main`** (PR #6 + PR #7 merged). Blenard wires MS-35 against this branch only.

**Phase 2 (deferred):** live Jamie (TSK-009), Outlook/deck attach (TSK-013), automated MOM (TSK-015), Entra/Mail.Send.

## 1. Pull latest main

```powershell
cd C:\Users\mayank\borek-pitch-factory
git fetch origin
git checkout main
git pull origin main
```

## 2. Apply migrations on live Supabase

Requires `.env` with `DATABASE_URL` **or** `SUPABASE_URL` + `SUPABASE_DB_PASSWORD`.

```powershell
py -3 scripts/apply_migrations.py
py -3 scripts/verify_db.py
```

Phase 1 adds (among earlier files):

| File | Ticket | What |
| --- | --- | --- |
| `028_bt34_stage1_intake.sql` | BT-34 | Stage 1 intake columns on `opportunities` |
| `029_client_documents.sql` | BT-35 | `client_documents` + sections |
| `030_bt36_stage_outputs.sql` | BT-36 / TSK-013 | `stage1_outputs`, `stage2_outputs`, `meeting_feedback_*`, `email_drafts` |
| `031_transcript_summaries.sql` | BT-36 | `transcript_summaries` table (not a second `030`) |

Safe to re-run: all files use `IF NOT EXISTS`.

## 3. Tell Blenard

Handoff: `docs/tickets/BT36_MS35_HANDOFF.md`

- Wire against **`main`** retrieve envelope `{ schema_version, opportunity_id, status, outputs }`.
- Do **not** use `origin/bt/bt36-stage-outputs` generation schemas (same filenames, different shape).
- Confirm email never sends (`EMAIL_SEND_FORBIDDEN`).
- First-meeting PPT stays `FIRST_MEETING_PPT_PROFILE_UNFROZEN` until JJ-31 (Jaya).

## 4. Optional Phase 1 leftovers (not blocking Blenard fixture path)

- Live company research provider (BT-34 full close / QA-01).
- Voice STT vendor (BT-34 optional voice).
- JJ-31 3-slide profile (Jaya) — blocks real PPT, not retrieve APIs.
