import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import workshopClear from "../../../../packages/contracts/fixtures/followup_extraction/workshop_clear.json";
import { FollowUpEmailView } from "./FollowUpEmailView.js";
import {
  emptyFollowupChecklist,
  renderFollowupDraft,
  type FollowupExtraction,
  type FollowupProjectStatics,
} from "../lib/followupReview.js";
import { getStageEmailReviewContext } from "../lib/stageEmailReview.js";

const statics: FollowupProjectStatics = {
  project_name: "Acme Invoice Pilot",
  client_short: "Acme",
  salutation_style: "informal",
  standard_recipients: [
    {
      email: "markus@example.com",
      first_name: "Markus",
      last_name: "Weber",
      salutation: "Mr",
      kind: "to",
      primary: true,
    },
  ],
  sender_profile: {
    name: "Lena Hoffmann",
    role: "Project Lead",
    email: "lena@borek.example",
  },
};
const draft = renderFollowupDraft(workshopClear as FollowupExtraction, statics);
const checks = emptyFollowupChecklist();
const deepeningContext = getStageEmailReviewContext("deepening", false);
const demoContext = getStageEmailReviewContext("deepening", true);

function render(
  status: "draft" | "reviewed" | "sent" = "draft",
  overrides: Partial<React.ComponentProps<typeof FollowUpEmailView>> = {},
) {
  return renderToStaticMarkup(
    <FollowUpEmailView
      opportunityId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      clientName="Acme"
      stageContext={deepeningContext}
      demoMode={false}
      statics={statics}
      staticsSaved
      draft={{ ...draft, status }}
      draftUnavailable={false}
      checklist={checks}
      acknowledgedFlags={new Set()}
      busy={false}
      error={null}
      info={null}
      onStaticsChange={() => undefined}
      onSaveStatics={() => undefined}
      onDraftChange={() => undefined}
      onChecklistChange={() => undefined}
      onFlagChange={() => undefined}
      onConfirm={() => undefined}
      {...overrides}
    />,
  );
}

const html = render();
assert.match(html, /Review follow-up email/);
assert.match(html, /Requirements Workshop/);
assert.match(html, /Confirm email/);
assert.doesNotMatch(html, />Send email</);
assert.match(html, /Project email settings/);

const demoHtml = render("draft", { stageContext: demoContext, demoMode: true });
assert.match(demoHtml, /EDITABLE EMAIL/);

const unavailableHtml = renderToStaticMarkup(
  <FollowUpEmailView
    opportunityId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    clientName="Acme"
    stageContext={deepeningContext}
    demoMode={false}
    statics={statics}
    staticsSaved
    draft={null}
    draftNotGenerated
    draftUnavailable={false}
    checklist={checks}
    acknowledgedFlags={new Set()}
    busy={false}
    error={null}
    info={null}
    onStaticsChange={() => undefined}
    onSaveStatics={() => undefined}
    onDraftChange={() => undefined}
    onChecklistChange={() => undefined}
    onFlagChange={() => undefined}
    onGenerateDraft={() => undefined}
    onConfirm={() => undefined}
  />,
);
assert.match(unavailableHtml, /Generate email draft/);
assert.doesNotMatch(unavailableHtml, /Requirements Workshop/);

const reviewed = render("reviewed");
assert.match(reviewed, /Confirmed — not sent/);

const panelSource = readFileSync(
  fileURLToPath(new URL("./FollowupReviewPanel.tsx", import.meta.url)),
  "utf8",
);
assert.doesNotMatch(panelSource, /\/send\b|sendEmail|sendFollowup/);
assert.match(panelSource, /FollowUpEmailView/);
assert.match(panelSource, /confirmAdaptedEmailDraft/);

console.log("MS-32 follow-up review UI tests passed");
