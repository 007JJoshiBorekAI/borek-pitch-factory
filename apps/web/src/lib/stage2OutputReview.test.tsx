import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ActionItemsPanel } from "../components/ActionItemsPanel.js";
import { AdjustedPresentationPanel } from "../components/AdjustedPresentationPanel.js";
import { CallSummaryPanel } from "../components/CallSummaryPanel.js";
import { DecisionsListPanel } from "../components/DecisionsListPanel.js";
import { MinutesOfMeetingPanel } from "../components/MinutesOfMeetingPanel.js";
import { OpenQuestionsPanel } from "../components/OpenQuestionsPanel.js";
import { journeyStageForProfile } from "./presentationStageVerification.js";
import { stage2OutputsDemo } from "./stageOutputDemoFixtures.js";
import { displayDue, displayOwner } from "./stage2OutputsView.js";

assert.equal(journeyStageForProfile("first_meeting_3_slide"), "first_contact");
assert.equal(journeyStageForProfile("deepening_adjusted"), "deepening");
assert.equal(journeyStageForProfile("other"), null);

assert.equal(displayOwner(null), "Unknown owner");
assert.equal(displayDue(null), "No deadline stated");

const callSummaryHtml = renderToStaticMarkup(
  <CallSummaryPanel
    summary={stage2OutputsDemo.call_summary}
    dependencies={stage2OutputsDemo.dependencies}
  />,
);
assert.match(callSummaryHtml, /finance close automation/);
assert.match(callSummaryHtml, /Source-backed/);
assert.match(callSummaryHtml, /turn:4/);

const momHtml = renderToStaticMarkup(
  <MinutesOfMeetingPanel
    mom={stage2OutputsDemo.minutes_of_meeting}
    dependencies={stage2OutputsDemo.dependencies}
  />,
);
assert.match(momHtml, /Scope confirmation/);
assert.match(momHtml, /MOM document download is unavailable/);

const decisionsHtml = renderToStaticMarkup(
  <DecisionsListPanel decisions={stage2OutputsDemo.decisions} />,
);
assert.match(decisionsHtml, /six-week discovery/);
assert.match(decisionsHtml, /High confidence/);

const actionHtml = renderToStaticMarkup(
  <ActionItemsPanel items={stage2OutputsDemo.action_items} />,
);
assert.match(actionHtml, /Anna Keller/);
assert.match(actionHtml, /TBD/);
assert.equal(stage2OutputsDemo.action_items.filter((i) => i.origin === "SOURCE_FACT").length, 1);

const openQuestionsHtml = renderToStaticMarkup(
  <OpenQuestionsPanel questions={stage2OutputsDemo.open_questions} />,
);
assert.match(openQuestionsHtml, /SAP modules/);

const adjustedHtml = renderToStaticMarkup(
  <AdjustedPresentationPanel
    presentationRef={stage2OutputsDemo.presentation_ref}
    dependencies={stage2OutputsDemo.dependencies}
    opportunityId="opp-1"
    demoMode
  />,
);
assert.match(adjustedHtml, /deepening_adjusted/);
assert.match(adjustedHtml, /pending/);
assert.doesNotMatch(adjustedHtml, /Open adjusted presentation/);

const unknownCallHtml = renderToStaticMarkup(
  <CallSummaryPanel
    summary={{ status: "unknown", origin: "UNKNOWN", text: null, source_refs: [] }}
    dependencies={["CALL_SUMMARY_NOT_RUN"]}
  />,
);
assert.match(unknownCallHtml, /Call summary unavailable/);

const deepeningSource = readFileSync(
  fileURLToPath(new URL("../components/DeepeningReviewPanel.tsx", import.meta.url)),
  "utf8",
);
assert.match(deepeningSource, /CallSummaryPanel/);
assert.match(deepeningSource, /MinutesOfMeetingPanel/);
assert.match(deepeningSource, /ActionItemsPanel/);
assert.match(deepeningSource, /resolveVerifiedStagePresentation/);
assert.match(deepeningSource, /Demonstration data/);
assert.doesNotMatch(deepeningSource, /generateStage2/);

const verificationSource = readFileSync(
  fileURLToPath(new URL("./presentationStageVerification.ts", import.meta.url)),
  "utf8",
);
assert.match(verificationSource, /listArchiveArtifacts/);
assert.match(verificationSource, /artifact\.opportunity_id === opportunityId/);
assert.match(verificationSource, /artifact\.journey_stage === journeyStage/);
assert.doesNotMatch(verificationSource, /getLatestPresentation/);
assert.doesNotMatch(verificationSource, /slides\.length/);

const transcriptSource = readFileSync(
  fileURLToPath(new URL("../components/TranscriptUploadPanel.tsx", import.meta.url)),
  "utf8",
);
assert.match(transcriptSource, /listTranscripts/);
assert.doesNotMatch(transcriptSource, /meeting_feedback/);

console.log("MS-35 stage2 output review tests passed");
