# TSK-009 — Build Jamie AI connector (D8)

**Owner:** Mayank Somwani  
**Phase:** Implementation · **Priority:** Critical  
**Added:** 21 September 2026 — Feature redefinition sprint  
**Source:** Control Tower D8 / Feature Redefinition PDF

## Goal

A finished Jamie meeting is picked up automatically. Transcript, participants,
and actions feed Pitch Factory (and later Control Tower).

## Dummy-first (until credentials)

Do **not** wait on Microsoft 365 / Jamie access to unblock BT-36 / TSK-015.

1. Freeze `packages/contracts/jamie_ingest.schema.json`.
2. Ship `DummyJamieClient` + `fixtures/jamie_ingest/dummy_workshop.json`.
3. `JAMIE_EXECUTION_MODE=dummy` (default). `live` must fail closed until the
   real adapter is wired — never stamp `source: jamie` on a fixture.
4. Store speaker turns for audit. **Never** inject them into LLM prompts
   (BT-36 `TRANSCRIPT_SUMMARY` only).

When credentials arrive: map vendor JSON → the same ingest schema. Swap the
client. Downstream tests keep using the dummy fixture.

## Live Done when (not dummy)

Transcript, participants, and actions available within **ten minutes** of a
real meeting end. Dummy mode cannot close this ticket.

## Depends on

Microsoft 365 / Jamie access (live half only). Dummy half depends on nothing.

## Blocks

TSK-015 live MOM from a real meeting. Dummy ingest unblocks MOM **pipeline**
work against the fixture.
