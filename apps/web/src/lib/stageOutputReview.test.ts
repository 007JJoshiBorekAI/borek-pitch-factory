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

const partialStage1Availability = buildStageOutputHubItems(
  {
    journeyStage: "first_contact",
    opportunityId: "opp-1",
    processedClientDocumentCount: 2,
    hasStage1Intake: true,
    apiLoadFailed: false,
    stage1Availability: {
      company_research_brief: false,
      discovery_questions: true,
      use_case_relevance: false,
      first_meeting_deck: false,
      meeting_agenda: true,
    },
  },
  false,
);
assert.equal(
  partialStage1Availability.find((item) => item.id === "discovery_questions")?.status,
  "available",
);
assert.equal(
  partialStage1Availability.find((item) => item.id === "company_research_brief")?.status,
  "backend_unavailable",
);
assert.equal(
  partialStage1Availability.find((item) => item.id === "optional_email")?.status,
  "backend_unavailable",
);

const partialStage2Availability = buildStageOutputHubItems(
  {
    journeyStage: "deepening",
    opportunityId: "opp-2",
    processedClientDocumentCount: 0,
    hasStage1Intake: false,
    apiLoadFailed: false,
    stage2Availability: {
      call_summary: true,
      minutes_of_meeting: false,
      adjusted_deck: true,
    },
  },
  false,
);
assert.equal(
  partialStage2Availability.find((item) => item.id === "call_summary")?.status,
  "available",
);
assert.equal(
  partialStage2Availability.find((item) => item.id === "minutes_of_meeting")?.status,
  "backend_unavailable",
);
assert.equal(
  partialStage2Availability.find((item) => item.id === "draft_email")?.status,
  "backend_unavailable",
);

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
