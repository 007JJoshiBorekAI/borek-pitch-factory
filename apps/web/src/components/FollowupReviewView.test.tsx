import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import workshopClear from "../../../../packages/contracts/fixtures/followup_extraction/workshop_clear.json";
import { FollowupReviewView } from "./FollowupReviewView.js";
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
  overrides: Partial<React.ComponentProps<typeof FollowupReviewView>> = {},
) {
  return renderToStaticMarkup(
    <FollowupReviewView
      stageContext={deepeningContext}
      demoMode={false}
      statics={statics}
      staticsSaved
      draft={{ ...draft, status }}
      draftUnavailable={false}
      checklist={checks}
      acknowledgedFlags={new Set()}
      canConfirm={false}
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
assert.equal(deepeningContext.title, "Review the client email");
assert.match(html, /Review only — no Outlook draft or client email has been created or sent/);
assert.match(html, /Requirements Workshop/);
assert.match(html, /Interface will be REST, not SOAP/);
assert.match(html, /Provide test invoices/);
assert.match(html, /Intended recipients: TO markus@example.com/);
assert.match(html, /Every name and date is correct/);
assert.match(html, /No attachment is referenced, or every referenced attachment is attached/);
assert.match(html, /No extraction flags require acknowledgement/);
assert.match(html, /Confirm review/);
assert.doesNotMatch(html, />Send</);

const demoHtml = render("draft", { stageContext: demoContext, demoMode: true });
assert.match(demoHtml, /MS-35 demonstration email/);
assert.match(demoHtml, /Demonstration email content only/);

const unavailableHtml = renderToStaticMarkup(
  <FollowupReviewView
    stageContext={deepeningContext}
    demoMode={false}
    statics={statics}
    staticsSaved
    draft={null}
    draftNotGenerated
    draftUnavailable={false}
    checklist={checks}
    acknowledgedFlags={new Set()}
    canConfirm={false}
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
assert.match(unavailableHtml, /No email draft has been generated for Deepening yet/);
assert.match(unavailableHtml, /Generate email draft/);
assert.doesNotMatch(unavailableHtml, /Requirements Workshop/);

const withCc = structuredClone(statics);
withCc.standard_recipients.push({
  email: "observer@example.com",
  first_name: null,
  last_name: null,
  salutation: null,
  kind: "cc",
  primary: false,
});
const recipientsHtml = renderToStaticMarkup(
  <FollowupReviewView
    stageContext={deepeningContext}
    demoMode={false}
    statics={withCc}
    staticsSaved
    draft={renderFollowupDraft(workshopClear as FollowupExtraction, withCc)}
    draftUnavailable={false}
    checklist={checks}
    acknowledgedFlags={new Set()}
    canConfirm={false}
    busy={false}
    error={null}
    info={null}
    onStaticsChange={() => undefined}
    onSaveStatics={() => undefined}
    onDraftChange={() => undefined}
    onChecklistChange={() => undefined}
    onFlagChange={() => undefined}
    onConfirm={() => undefined}
  />,
);
assert.match(recipientsHtml, /observer@example.com/);
assert.match(recipientsHtml, /CC observer@example.com/);
assert.match(recipientsHtml, /Remove/);

const setupHtml = renderToStaticMarkup(
  <FollowupReviewView
    stageContext={deepeningContext}
    demoMode={false}
    statics={statics}
    staticsSaved={false}
    draft={null}
    draftUnavailable={false}
    checklist={checks}
    acknowledgedFlags={new Set()}
    canConfirm={false}
    busy={false}
    error={null}
    info={null}
    onStaticsChange={() => undefined}
    onSaveStatics={() => undefined}
    onDraftChange={() => undefined}
    onChecklistChange={() => undefined}
    onFlagChange={() => undefined}
    onConfirm={() => undefined}
  />,
);
assert.match(setupHtml, /Save project settings/);
assert.doesNotMatch(setupHtml, /id="followup-project-name"[^>]*disabled/);

const reviewed = render("reviewed");
assert.match(reviewed, /Reviewed — not sent/);
assert.match(reviewed, /disabled=""/);

const sent = render("sent");
assert.match(sent, />Sent</);
assert.match(sent, /disabled=""/);

const panelSource = readFileSync(
  fileURLToPath(new URL("./FollowupReviewPanel.tsx", import.meta.url)),
  "utf8",
);
assert.doesNotMatch(panelSource, /\/send\b|sendEmail|sendFollowup/);
assert.match(panelSource, /fetchAdaptedEmailDraft/);
assert.match(panelSource, /confirmAdaptedEmailDraft/);
assert.match(panelSource, /confirmReviewedMessageLive/);
assert.match(panelSource, /setChecklist\(emptyFollowupChecklist\(\)\)/);

const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");
assert.match(css, /\.followup-form-grid\s*\{[\s\S]*grid-template-columns:/);
assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.followup-form-grid\s*\{[\s\S]*grid-template-columns:\s*1fr/);

console.log("MS-32 follow-up review UI tests passed");
