# Follow-up email: review interface

The follow-up email is confirmed by its owner before it can be exported. There are two interfaces
for that review. Both call the same API endpoint (`POST .../email-drafts/{id}/confirm`) with the
same payload; the backend rules are identical and there is one workflow.

## Review & confirm dialog (default)

The page shows the email, its attachments and one next action. **Review & confirm** opens a dialog
with the saved email as it will be exported: recipient, sender, subject, length, attachments, the
message, and every point the owner has to check:

- the review flags stored with the draft (for example demo extraction, unverified speaker,
  omitted personal notes, next steps without an owner or a date, trimmed content);
- what the current selection adds: a selected file that is not available, a finalized package that
  changed, a message that announces an attachment while no file is selected.

Nothing starts ticked, and the approval records only what the owner does in the dialog:

- every point to check has its own tick. **Approve email** stays disabled until each one is
  ticked, and only the review flags that were ticked are sent as acknowledged;
- the six review checks (recipients, dates and owners, supported statements, review flags, tone,
  attachments) are written out in the dialog and confirmed with one tick that names them. Without
  that tick no check is sent.

The API still validates the six checks, each flag by name, the draft revision, the finalized
source and the attachments, and stores the review with the confirmation. A point marked "Cannot
be approved" (a selected file that is missing, a changed package) has no tick and disables the
approval.

### Attachments and the text

Generated text only says that the presentation is attached while a file is selected. Both texts
(with and without that sentence) are kept from the moment the draft is generated, so changing the
selection switches the texts the owner has not edited without a new generation. A text the owner
edited is never rewritten. If it still says that something is attached while no file is selected,
that is a contradiction: the page says so, the dialog marks it "Cannot be approved", and the API
refuses the confirmation (`EMAIL_ATTACHMENT_CONTRADICTION`) until the owner selects the file or
changes the sentence.

## Who writes the email

The draft records who wrote the generated text, and the page shows it under the message:

| `writer.mode` | Meaning |
| --- | --- |
| `ai` | The configured model wrote the text from the confirmed findings and every sentence passed the grounding checks. |
| `fallback` | AI writing is enabled, but the model could not be reached or its draft was rejected. The rule-based writer wrote the text; the reason is shown. |
| `deterministic` | AI writing is not enabled in this environment. The rule-based writer wrote the text. |

AI writing is off by default. It needs both API settings:

    FOLLOWUP_AI_WRITER_ENABLED=true
    AI_EXECUTION_MODE=live

and a valid `ANTHROPIC_API_KEY` (`ANTHROPIC_MODEL` optional). It then uses the shared Claude
client, with the egress policy and the generation log. Without the switch every draft is written
by the rule-based writer and no model is called, also in a live environment; fixture mode never
calls a model. With the switch on, a missing, placeholder or malformed key is recognised before
any request, and a key the provider refuses is tried once: in both cases the draft is a labelled
`fallback`.

The AI writer has been tested with scripted model answers only. Before switching it on, run the
opt-in checks against the real model (they send synthetic findings only):

    BOREK_ALLOW_LIVE_MODEL_CALLS=1 pytest tests/integration/followup/test_ai_writer_live_smoke.py -m live_claude -s
    BOREK_ALLOW_LIVE_MODEL_CALLS=1 pytest tests/integration/followup/test_ai_writer_live.py -m live_claude -s

What the model receives: the client's short name, the project name and the confirmed findings of
the finalized package, each marked as requirement, challenge, priority, decision, discussed
solution, opportunity or next step. It does not receive the transcript, speaker turns, personal
notes, findings that came only from personal notes, or the recipient and sender. Greeting,
attachment sentence and signature are added by code.

The grounding gate (`apps/api/services/followup/ai_writer.py`):

1. The writer returns sentences, each with the ids of the findings it rests on.
2. Rule checks reject a draft in which a sentence cites a finding that does not exist or does not
   fit its paragraph, contains a number, quantity, date, deadline, name or commitment the cited
   findings do not contain, presents an idea as agreed or decided, says who said something,
   mentions an attachment, or breaks the word limit.
3. A second, independent model call judges every sentence against the findings it cites.
4. One correction is requested with the reasons. If the second draft fails as well, the
   rule-based writer is used and the draft is labelled `fallback`.

A rejected draft is never stored or shown. An AI-written draft carries the review flag
`ai_written`, a fallback `ai_fallback`; like every flag they are ticked by the owner in the review.

## Original detailed review (disabled by default)

The earlier interface is kept in `apps/web/src/components/FollowUpAdvancedReview.tsx`: a card on
the page with one checkbox per review flag ("Review flags - acknowledge each one"), the six-item
"Checklist" and a "Confirm the ... draft" button.

To restore it, set the switch when the web application is **built** (`NEXT_PUBLIC_*` values are
compiled into the bundle, so changing it needs a rebuild, not a restart):

    # local development (apps/web/.env.local or the shell)
    NEXT_PUBLIC_FOLLOWUP_ADVANCED_REVIEW_UI=true

    # Docker image
    docker build -f docker/web/Dockerfile --build-arg NEXT_PUBLIC_FOLLOWUP_ADVANCED_REVIEW_UI=true ...

Only the exact value `true` enables it. With the switch on, the dialog and its button are not
rendered and the page behaves as it did before. No data migration is involved in either
direction: a draft confirmed in one interface is a confirmed draft in the other.
