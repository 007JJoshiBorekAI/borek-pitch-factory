import assert from "node:assert/strict";

import {
  FIRST_CONTACT_ARTIFACTS,
  FIRST_CONTACT_SLIDE_COUNT,
  DEEPENING_ARTIFACTS,
} from "./stageOutputArtifacts.js";
import {
  buildStageOutputHubItems,
  FIRST_CONTACT_REVIEW_STEPS,
  DEEPENING_REVIEW_STEPS,
  isStageOutputDemoMode,
} from "./stageOutputReview.js";
import { demoFirstMeetingDeckProfile } from "./stageOutputDemoContent.js";

assert.equal(FIRST_CONTACT_SLIDE_COUNT, 3);
assert.equal(demoFirstMeetingDeckProfile(), "first_meeting_3_slide");
assert.equal(FIRST_CONTACT_ARTIFACTS.length, 6);
assert.equal(DEEPENING_ARTIFACTS.length, 4);
assert.equal(FIRST_CONTACT_REVIEW_STEPS.length, 4);
assert.equal(DEEPENING_REVIEW_STEPS.length, 4);

assert.equal(isStageOutputDemoMode("?demo=1"), true);
assert.equal(isStageOutputDemoMode("?opportunityId=x"), false);

const liveHub = buildStageOutputHubItems(
  {
    journeyStage: "first_contact",
    opportunityId: "opp-1",
    processedClientDocumentCount: 0,
    hasStage1Intake: false,
    apiLoadFailed: false,
  },
  false,
);
assert.equal(liveHub.every((item) => !item.isDemo), true);
assert.equal(
  liveHub.every((item) => item.status === "awaiting_generation" || item.status === "backend_unavailable"),
  true,
);
assert.equal(liveHub.some((item) => item.statusLabel === "Backend not available"), false);

const liveWithInputs = buildStageOutputHubItems(
  {
    journeyStage: "first_contact",
    opportunityId: "opp-1",
    processedClientDocumentCount: 2,
    hasStage1Intake: true,
    apiLoadFailed: false,
  },
  false,
);
assert.equal(liveWithInputs.every((item) => item.status === "backend_unavailable"), true);
assert.equal(liveWithInputs.every((item) => item.reviewHref === null), true);

const liveWithSessionResearch = buildStageOutputHubItems(
  {
    journeyStage: "first_contact",
    opportunityId: "opp-1",
    processedClientDocumentCount: 2,
    hasStage1Intake: true,
    apiLoadFailed: false,
    hasSessionResearch: true,
  },
  false,
);
const researchHubItem = liveWithSessionResearch.find((item) => item.id === "company_research_brief");
assert.equal(researchHubItem?.status, "available");
assert.match(researchHubItem?.reviewHref ?? "", /first-contact\/review/);

const demoHub = buildStageOutputHubItems(
  {
    journeyStage: "first_contact",
    opportunityId: "opp-1",
    processedClientDocumentCount: 0,
    hasStage1Intake: false,
    apiLoadFailed: false,
  },
  true,
);
assert.equal(demoHub.every((item) => item.isDemo), true);
assert.equal(demoHub.every((item) => item.statusLabel === "Demonstration data"), true);
assert.match(demoHub[0]?.reviewHref ?? "", /demo=1/);

console.log("MS-35 stageOutputReview tests passed");
