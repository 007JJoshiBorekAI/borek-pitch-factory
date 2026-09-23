import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DiscoveryQuestionsPanel } from "../components/DiscoveryQuestionsPanel.js";
import { FirstMeetingPresentationPanel } from "../components/FirstMeetingPresentationPanel.js";
import { MeetingAgendaPanel } from "../components/MeetingAgendaPanel.js";
import { Stage1ResearchReviewPanel } from "../components/Stage1ResearchReviewPanel.js";
import { UseCaseListPanel } from "../components/UseCaseListPanel.js";
import { stage1OutputsDemo, stage1ResearchDemo } from "./stageOutputDemoFixtures.js";
import {
  allDiscoveryQuestionsCopyText,
  discoveryQuestionCount,
  sortedAgendaItems,
} from "./stage1OutputsView.js";
import { matchesFirstMeetingSlideProfile } from "./firstMeetingPresentationReview.js";
import {
  companyFactRows,
  factDisplayValue,
  hypothesisDisplayValue,
  originLabel,
} from "./stage1ResearchView.js";

assert.equal(originLabel("SOURCE_FACT"), "Source-backed");
assert.equal(originLabel("AI_INFERENCE"), "AI hypothesis");
assert.equal(originLabel("UNKNOWN"), "Unknown");

const unknownFact = stage1ResearchDemo.company_facts.description;
assert.match(factDisplayValue(unknownFact), /Unknown/);
assert.equal(hypothesisDisplayValue(stage1ResearchDemo.hypothesis), null);

const factRows = companyFactRows(stage1ResearchDemo);
assert.equal(factRows.length, 5);
assert.equal(factRows.every((row) => row.isUnknown), true);

const researchHtml = renderToStaticMarkup(
  <Stage1ResearchReviewPanel research={stage1ResearchDemo} />,
);
assert.match(researchHtml, /Company research brief/);
assert.match(researchHtml, /Unknown/);
assert.match(researchHtml, /Source-backed/);
assert.match(researchHtml, /Tentative AI inference — not independently verified/);
assert.match(researchHtml, /Unknown — support hypothesis not generated/);
assert.match(researchHtml, /Invoice 3-way Match/);
assert.doesNotMatch(researchHtml, /fake-download|\.pptx|\.pdf/i);

const questionCount = discoveryQuestionCount(stage1OutputsDemo.discovery_questions);
assert.equal(questionCount, 10);
assert.equal(stage1OutputsDemo.discovery_questions.items.length, 10);

const discoveryHtml = renderToStaticMarkup(
  <DiscoveryQuestionsPanel
    collection={stage1OutputsDemo.discovery_questions}
    dependencies={stage1OutputsDemo.dependencies}
  />,
);
assert.match(discoveryHtml, /Copy all/);
assert.match(discoveryHtml, /Q1/);
assert.match(discoveryHtml, /Source-backed/);
assert.match(discoveryHtml, /AI hypothesis/);
assert.match(allDiscoveryQuestionsCopyText(stage1OutputsDemo.discovery_questions.items), /1\. Which ERP/);

const unknownDiscoveryHtml = renderToStaticMarkup(
  <DiscoveryQuestionsPanel collection={{ status: "unknown", items: [] }} dependencies={[]} />,
);
assert.match(unknownDiscoveryHtml, /Discovery questions unavailable/);

const useCaseHtml = renderToStaticMarkup(
  <UseCaseListPanel
    collection={stage1OutputsDemo.use_cases}
    dependencies={stage1OutputsDemo.dependencies}
  />,
);
assert.match(useCaseHtml, /Finance close automation/);
assert.match(useCaseHtml, /Matched/);
assert.match(useCaseHtml, /Manufacturing finance close/);

const agendaItems = sortedAgendaItems(stage1OutputsDemo.meeting_agenda);
assert.deepEqual(
  agendaItems.map((item) => item.order),
  [1, 2, 3, 4],
);

const agendaHtml = renderToStaticMarkup(
  <MeetingAgendaPanel
    agenda={stage1OutputsDemo.meeting_agenda}
    dependencies={stage1OutputsDemo.dependencies}
  />,
);
assert.match(agendaHtml, /Introductions and objectives/);
assert.match(agendaHtml, /10 min/);
assert.match(agendaHtml, /Agenda download is unavailable/);
assert.doesNotMatch(agendaHtml, /Download DOCX|Download PDF/i);

const presentationHtml = renderToStaticMarkup(
  <FirstMeetingPresentationPanel
    presentationRef={stage1OutputsDemo.presentation_ref}
    dependencies={stage1OutputsDemo.dependencies}
    opportunityId="opp-1"
    demoMode
  />,
);
assert.match(presentationHtml, /first_meeting_3_slide/);
assert.match(presentationHtml, /3 slides/);
assert.match(presentationHtml, /Demonstration fixture IDs are not linked/);
assert.doesNotMatch(presentationHtml, /Open presentation review/);

const verifiedPresentationHtml = renderToStaticMarkup(
  <FirstMeetingPresentationPanel
    presentationRef={stage1OutputsDemo.presentation_ref}
    dependencies={[]}
    opportunityId="opp-1"
    demoMode={false}
    verifiedPresentation={{
      presentationId: "11111111-1111-4111-8111-111111111111",
      slideCount: 3,
      profile: "first_meeting_3_slide",
    }}
  />,
);
assert.match(verifiedPresentationHtml, /Open presentation review/);
assert.match(verifiedPresentationHtml, /first_meeting_3_slide/);

assert.equal(matchesFirstMeetingSlideProfile(3), true);
assert.equal(matchesFirstMeetingSlideProfile(8), false);

const reviewPanelSource = readFileSync(
  fileURLToPath(new URL("../components/FirstContactReviewPanel.tsx", import.meta.url)),
  "utf8",
);
assert.match(reviewPanelSource, /handleGenerateResearch[\s\S]*generateStage1Research/);
assert.match(reviewPanelSource, /Generate company research/);
assert.match(reviewPanelSource, /Session-only research result/);
assert.match(reviewPanelSource, /DiscoveryQuestionsPanel/);
assert.match(
  reviewPanelSource,
  /Requires an explicit action\. No external research call runs when opening this page\./,
);

const sessionSource = readFileSync(
  fileURLToPath(new URL("./stage1ResearchSession.ts", import.meta.url)),
  "utf8",
);
assert.match(sessionSource, /sessionStorage/);
assert.match(sessionSource, /research\.opportunity_id === opportunityId/);

const materialsSource = readFileSync(
  fileURLToPath(new URL("../components/FirstContactMaterialsPanel.tsx", import.meta.url)),
  "utf8",
);
assert.match(materialsSource, /resolveVerifiedFirstMeetingPresentation/);
assert.doesNotMatch(materialsSource, /setLivePresentation/);

console.log("MS-35 stage1 output review tests passed");
