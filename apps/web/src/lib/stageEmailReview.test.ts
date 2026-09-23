import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  demoEmailDraftForStage,
  demoFollowupProjectStatics,
  followupReviewHref,
  getStageEmailReviewContext,
  journeyStageForEmailArtifact,
  parseEmailReviewJourneyStage,
  shouldShowConcretisationEmailReviewLink,
} from "./stageEmailReview.js";
import { buildStageOutputHubItems } from "./stageOutputReview.js";

assert.equal(parseEmailReviewJourneyStage("first_contact"), "first_contact");
assert.equal(parseEmailReviewJourneyStage("deepening"), "deepening");
assert.equal(parseEmailReviewJourneyStage("concretisation"), "concretisation");
assert.equal(parseEmailReviewJourneyStage(undefined), "deepening");

assert.equal(journeyStageForEmailArtifact("optional_email"), "first_contact");
assert.equal(journeyStageForEmailArtifact("draft_email"), "deepening");
assert.equal(journeyStageForEmailArtifact("proposal_followup_email"), "concretisation");
assert.equal(journeyStageForEmailArtifact("call_summary"), null);

const firstContactHref = followupReviewHref("opp-1", "first_contact", true);
assert.match(firstContactHref, /journeyStage=first_contact/);
assert.match(firstContactHref, /demo=1/);
assert.match(followupReviewHref("opp-1", "deepening", false), /journeyStage=deepening/);
assert.doesNotMatch(followupReviewHref("opp-1", "deepening", false), /demo=1/);

const firstContactContext = getStageEmailReviewContext("first_contact", true);
assert.match(firstContactContext.kicker, /Pre-meeting/i);
assert.match(firstContactContext.sourceBadgeLabel ?? "", /demonstration email/i);

const deepeningLive = getStageEmailReviewContext("deepening", false);
assert.equal(deepeningLive.sourceBadgeLabel, null);
assert.match(deepeningLive.draftUnavailableMessage, /generate a draft/i);
assert.match(deepeningLive.confirmReviewedMessageLive, /not sent/i);

const concretisationContext = getStageEmailReviewContext("concretisation", true);
assert.match(concretisationContext.title, /proposal follow-up/i);

const statics = demoFollowupProjectStatics();
const firstContactDraft = demoEmailDraftForStage("first_contact", statics);
const deepeningDraft = demoEmailDraftForStage("deepening", statics);
const concretisationDraft = demoEmailDraftForStage("concretisation", statics);

assert.match(firstContactDraft.subject, /Intro before our first meeting/i);
assert.match(deepeningDraft.subject, /Follow-up Requirements Workshop/i);
assert.match(concretisationDraft.subject, /Proposal follow-up/i);
assert.ok(concretisationDraft.review_flags.includes("proposal_scope"));

const demoHub = buildStageOutputHubItems(
  {
    journeyStage: "deepening",
    opportunityId: "opp-2",
    processedClientDocumentCount: 0,
    hasStage1Intake: false,
    apiLoadFailed: false,
  },
  true,
);
const emailHubItem = demoHub.find((item) => item.id === "draft_email");
assert.match(emailHubItem?.reviewHref ?? "", /journeyStage=deepening/);

assert.equal(shouldShowConcretisationEmailReviewLink("concretisation", true), true);
assert.equal(shouldShowConcretisationEmailReviewLink("concretisation", false), false);
assert.equal(shouldShowConcretisationEmailReviewLink("deepening", true), false);
assert.equal(shouldShowConcretisationEmailReviewLink(undefined, true), false);

const concretisationDeckEmailHref = followupReviewHref("opp-deck", "concretisation", true);
assert.match(concretisationDeckEmailHref, /journeyStage=concretisation/);
assert.match(concretisationDeckEmailHref, /demo=1/);

const panelSource = readFileSync(
  fileURLToPath(new URL("../components/FollowupReviewPanel.tsx", import.meta.url)),
  "utf8",
);
assert.doesNotMatch(panelSource, /workshop_clear\.json/);
assert.doesNotMatch(panelSource, /\/send\b|sendEmail|sendFollowup/);
assert.match(panelSource, /demoEmailDraftForStage/);
assert.match(panelSource, /confirmReviewedMessage/);
assert.match(panelSource, /draftUnavailable/);

const deckCenterSource = readFileSync(
  fileURLToPath(new URL("../components/DeckCenterPanel.tsx", import.meta.url)),
  "utf8",
);
assert.match(deckCenterSource, /PipelineStepper|WorkflowStepIndicator/);
assert.doesNotMatch(deckCenterSource, /JourneyOutputStepper/);
assert.match(deckCenterSource, /Review follow-up email/);
assert.match(deckCenterSource, /shouldShowConcretisationEmailReviewLink/);
assert.match(deckCenterSource, /followupReviewHref\(\s*opportunityId,\s*"concretisation"/);
assert.match(deckCenterSource, /data-testid="concretisation-email-review"/);
assert.match(deckCenterSource, /isStageOutputDemoMode/);
assert.doesNotMatch(deckCenterSource, /email has been generated|generated email/i);

console.log("MS-35 stage email review tests passed");
