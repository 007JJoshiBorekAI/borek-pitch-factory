# TSK-013 — Follow-up email three lengths (never send)

**Owner:** Mayank Somwani  
**Phase:** Wave C after BT-36  
**Source:** 21 Sep feature-redefinition PDF

## Goal

One extraction / stage context → three reviewable draft lengths. Persist in the API. Confirm does not send.

| Length | Rule |
| --- | --- |
| short | At most 150 words |
| medium | Longer than short, still stated facts only |
| extensive | Longest review copy, still stated facts only |

## API

See [`BT36_MS35_HANDOFF.md`](BT36_MS35_HANDOFF.md).

## Done when

- GET/POST generate returns `short`, `medium`, `extensive`
- Confirm sets `status: confirmed` and `send_status: not_sent`
- POST send returns `EMAIL_SEND_FORBIDDEN`
- No invented prices or company facts

## Out of scope

Mail.Send, Entra multitenant app, Outlook draft creation (optional later).
