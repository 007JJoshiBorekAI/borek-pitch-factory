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
  sender_profile: {
    name: "Elena Manovska",
    role: "Project Lead",
    email: "elena@borek.example",
  },
};

const draft = renderFollowupDraft(workshopClear as FollowupExtraction, statics);
const checklist = emptyFollowupChecklist();
const deepeningContext = getStageEmailReviewContext("deepening", false);
const demoContext = getStageEmailReviewContext("deepening", true);
const opportunityId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function render(overrides: Partial<React.ComponentProps<typeof FollowUpEmailView>> = {}) {
  return renderToStaticMarkup(
    <FollowUpEmailView
      opportunityId={opportunityId}
      clientName="Acme GmbH"
      stageContext={demoContext}
      demoMode={true}
      statics={statics}
      staticsSaved
      draft={draft}
      draftNotGenerated={false}
      draftUnavailable={false}
      checklist={checklist}
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
assert.match(html, /follow-up-email-workspace/);
assert.match(html, /follow-up-email-body/);
assert.match(html, /POST-MEETING/);
assert.match(html, /Review follow-up email/);
assert.match(html, /Meeting input/);
assert.match(html, /Generate \+ review/);
assert.match(html, /Mira Koch · Acme GmbH/);
assert.match(html, /Requirements Workshop/);
assert.match(html, /data-testid="follow-up-subject"/);
assert.match(html, /data-testid="follow-up-body"/);
assert.match(html, /data-testid="follow-up-readiness-checklist"/);
assert.match(html, /data-testid="follow-up-readiness-state"/);
assert.match(html, /READY TO CONFIRM/);
assert.match(html, /Confirm email/);
assert.doesNotMatch(html, />Send email</);
assert.match(html, /Back to meeting input/);
assert.match(
  html,
  /href="\/upload\?opportunityId=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb&amp;journeyStage=deepening"/,
);
assert.match(html, /No email is sent from this application/);

assert.match(html, /EDITABLE EMAIL/);
assert.doesNotMatch(html, /readonly/i);

const liveHtml = render({
  stageContext: deepeningContext,
  demoMode: false,
  liveDraftReadOnly: true,
  selectedLength: "medium",
  onLengthChange: () => undefined,
});
assert.match(liveHtml, /GENERATED DRAFT/);
assert.match(liveHtml, /Short/);
assert.match(liveHtml, /Medium/);
assert.match(liveHtml, /Extensive/);
assert.match(liveHtml, /readonly/i);

const confirmedHtml = render({ serverConfirmed: true });
assert.match(confirmedHtml, /Confirmed — not sent/);
assert.match(confirmedHtml, /Review confirmed/);
assert.match(confirmedHtml, /data-workflow-state-key="confirmed_email_not_sent"/);

const attachmentHtml = render({
  draft: { ...draft, attachment_name: "Acme_summary.docx" },
});
assert.match(attachmentHtml, /Attached/);

const panelSource = readFileSync(
  fileURLToPath(new URL("./FollowupReviewPanel.tsx", import.meta.url)),
  "utf8",
);
assert.match(panelSource, /FollowUpEmailView/);
assert.match(panelSource, /WorkspaceShell/);
assert.doesNotMatch(panelSource, /StageReviewLayout/);
assert.doesNotMatch(panelSource, /\/send\b|sendEmail|sendFollowup/);
assert.match(panelSource, /confirmAdaptedEmailDraft/);
assert.match(panelSource, /confirmReviewedMessageLive/);

const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");
assert.match(css, /\.follow-up-email-body\s*\{[\s\S]*760px/);
assert.match(css, /@media \(max-width: 1024px\)[\s\S]*\.follow-up-email-body\s*\{[\s\S]*1fr/);

console.log("FIGMA-07 follow-up email view tests passed");
