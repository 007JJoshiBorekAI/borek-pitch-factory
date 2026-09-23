import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { JourneyOutputStepper } from "./JourneyOutputStepper.js";
import { StageOutputHubPanel } from "./StageOutputHubPanel.js";
import {
  buildStageOutputHubItems,
  FIRST_CONTACT_REVIEW_STEPS,
} from "../lib/stageOutputReview.js";
import { FIRST_CONTACT_SLIDE_COUNT } from "../lib/stageOutputArtifacts.js";
import { demoFirstMeetingDeckProfile } from "../lib/stageOutputDemoContent.js";

const demoItems = buildStageOutputHubItems(
  {
    journeyStage: "first_contact",
    opportunityId: "opp-1",
    processedClientDocumentCount: 0,
    hasStage1Intake: false,
    apiLoadFailed: false,
  },
  true,
);

const hubHtml = renderToStaticMarkup(<StageOutputHubPanel items={demoItems} />);
assert.match(hubHtml, /Demonstration data only/i);
assert.match(hubHtml, /Company research brief/);
assert.doesNotMatch(hubHtml, /storage_path/i);

const liveItems = buildStageOutputHubItems(
  {
    journeyStage: "deepening",
    opportunityId: "opp-2",
    processedClientDocumentCount: 0,
    hasStage1Intake: false,
    apiLoadFailed: false,
  },
  false,
);
const liveHubHtml = renderToStaticMarkup(<StageOutputHubPanel items={liveItems} showBackendNote />);
assert.match(liveHubHtml, /Backend not available|Awaiting generation/);
assert.match(liveHubHtml, /BT-36 Phase 3 onward/i);

const stepperHtml = renderToStaticMarkup(
  <JourneyOutputStepper
    journeyStage="first_contact"
    currentStep="research"
    opportunityId="opp-1"
    demoMode
  />,
);
assert.match(stepperHtml, /Research review/);
assert.match(stepperHtml, /Meeting materials/);
assert.match(stepperHtml, /demo=1/);
assert.doesNotMatch(stepperHtml, /✓/);

const pipelineStepperSource = readFileSync(
  fileURLToPath(new URL("./PipelineStepper.tsx", import.meta.url)),
  "utf8",
);
assert.match(pipelineStepperSource, /PipelineStepper/);
assert.doesNotMatch(pipelineStepperSource, /JourneyOutputStepper/);

const deckCenterSource = readFileSync(
  fileURLToPath(new URL("./DeckCenterPanel.tsx", import.meta.url)),
  "utf8",
);
assert.match(deckCenterSource, /PipelineStepper|WorkflowStepIndicator/);
assert.doesNotMatch(deckCenterSource, /JourneyOutputStepper/);

const uploadSource = readFileSync(
  fileURLToPath(new URL("./TranscriptUploadPanel.tsx", import.meta.url)),
  "utf8",
);
assert.match(uploadSource, /Stage1IntakePanel/);
assert.match(uploadSource, /ClientDocumentUploadPanel/);
assert.doesNotMatch(uploadSource, /first-contact\/review/);

const reviewPageSource = readFileSync(
  fileURLToPath(new URL("../app/first-contact/review/page.tsx", import.meta.url)),
  "utf8",
);
assert.match(reviewPageSource, /FirstContactReviewPanel/);

const materialsPanelSource = readFileSync(
  fileURLToPath(new URL("./FirstContactMaterialsPanel.tsx", import.meta.url)),
  "utf8",
);
const demoFixtureSource = readFileSync(
  fileURLToPath(new URL("../lib/stageOutputDemoFixtures.ts", import.meta.url)),
  "utf8",
);
assert.match(materialsPanelSource, /FIRST_CONTACT_SLIDE_COUNT/);
assert.match(materialsPanelSource, /demoFirstMeetingDeckProfile/);
assert.match(demoFixtureSource, /first_meeting_3_slide/);
assert.equal(FIRST_CONTACT_SLIDE_COUNT, 3);
assert.equal(demoFirstMeetingDeckProfile(), "first_meeting_3_slide");

assert.equal(FIRST_CONTACT_REVIEW_STEPS[0]?.path, "/upload");

console.log("MS-35 stage output review UI tests passed");
