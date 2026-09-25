import assert from "node:assert/strict";

import {
  attachmentReadiness,
  bodyReadinessStatus,
  buildFollowUpEmailReadiness,
  followUpMeetingInputHref,
  followUpPrimaryCtaLabel,
  followUpSupportCopy,
  formatFollowUpRecipientDisplay,
  recipientReadinessStatus,
  subjectReadinessStatus,
} from "./followUpEmail.js";
import {
  emptyFollowupChecklist,
  emptyFollowupProjectStatics,
  renderFollowupDraft,
  type FollowupProjectStatics,
} from "./followupReview.js";
import workshopClear from "../../../../packages/contracts/fixtures/followup_extraction/workshop_clear.json";
import type { FollowupExtraction } from "./followupReview.js";

const statics: FollowupProjectStatics = {
  project_name: "Acme GmbH Pitch",
  client_short: "Acme GmbH",
  salutation_style: "informal",
  standard_recipients: [
    {
      email: "mira@acme.example",
      first_name: "Mira",
      last_name: "Koch",
      salutation: "Ms",
      kind: "to",
      primary: true,
    },
  ],
  sender_profile: { name: "Elena", role: "Lead", email: "elena@borek.example" },
};

const draft = renderFollowupDraft(workshopClear as FollowupExtraction, statics);
const checklist = emptyFollowupChecklist();

assert.equal(
  formatFollowUpRecipientDisplay(statics, "Acme GmbH"),
  "Mira Koch · Acme GmbH",
);
assert.equal(
  followUpMeetingInputHref("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
  "/upload?opportunityId=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb&journeyStage=deepening",
);
assert.equal(followUpMeetingInputHref(null), "/clients");

assert.equal(recipientReadinessStatus(statics, true).statusLabel, "Ready");
assert.equal(recipientReadinessStatus(emptyFollowupProjectStatics(), false).statusLabel, "Incomplete");
assert.equal(subjectReadinessStatus(draft).statusLabel, "Ready");
assert.equal(subjectReadinessStatus({ ...draft, subject: "" }).statusLabel, "Missing");
assert.equal(bodyReadinessStatus(draft, true, false).statusLabel, "Ready");
assert.equal(bodyReadinessStatus(draft, true, true).statusLabel, "Edited");
assert.equal(attachmentReadiness({ ...draft, attachment_name: "deck.pdf" }).statusLabel, "Attached");
assert.equal(attachmentReadiness({ ...draft, attachment_name: null }).statusLabel, "None");

const incomplete = buildFollowUpEmailReadiness({
  statics,
  staticsSaved: true,
  draft,
  checklist,
  acknowledgedFlags: new Set(),
  demoMode: true,
  serverConfirmed: false,
  bodyEdited: false,
  busy: false,
  confirming: false,
  loading: false,
  error: null,
  clientName: "Acme GmbH",
});
assert.equal(incomplete.phase, "incomplete");
assert.equal(incomplete.canConfirm, false);
assert.equal(incomplete.primaryCtaLabel, "Confirm email");
assert.match(incomplete.supportCopy, /No email is sent/);

const readyChecklist = { ...checklist };
for (const key of Object.keys(readyChecklist) as Array<keyof typeof readyChecklist>) {
  readyChecklist[key] = true;
}
const ready = buildFollowUpEmailReadiness({
  statics,
  staticsSaved: true,
  draft,
  checklist: readyChecklist,
  acknowledgedFlags: new Set(draft.review_flags),
  demoMode: false,
  serverConfirmed: false,
  bodyEdited: false,
  busy: false,
  confirming: false,
  loading: false,
  error: null,
});
assert.equal(ready.phase, "ready");
assert.equal(ready.canConfirm, true);
assert.equal(ready.primaryCtaDisabled, false);

const confirmed = buildFollowUpEmailReadiness({
  statics,
  staticsSaved: true,
  draft: { ...draft, status: "reviewed" },
  checklist: readyChecklist,
  acknowledgedFlags: new Set(draft.review_flags),
  demoMode: false,
  serverConfirmed: true,
  bodyEdited: false,
  busy: false,
  confirming: false,
  loading: false,
  error: null,
});
assert.equal(confirmed.phase, "confirmed");
assert.equal(followUpPrimaryCtaLabel({ confirmed: true, confirming: false }), "Confirmed — not sent");
assert.match(followUpSupportCopy("Mira Koch", true), /not sent/);

console.log("FIGMA-07 follow-up email tests passed");
