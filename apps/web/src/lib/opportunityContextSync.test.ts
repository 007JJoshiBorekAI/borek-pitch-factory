import assert from "node:assert/strict";

import { emptyPitchDraft } from "./pitchDraft.js";
import { mergeClientInformation, mergeStage1Intake } from "./opportunityContextSync.js";

const opportunity = {
  client_name: "Acme GmbH",
  opportunity_name: "Invoice automation",
  stage1_intake: {
    client_web_page: null,
    poc_name: null,
    poc_position: null,
    sales_topic_description: "Original topic",
    about_company: "Original about",
  },
  additional_client_information: {
    location_requirements: [],
    constraints: [],
    contacts: [],
    priorities: ["Original priority"],
    notes: null,
  },
};

const draft = emptyPitchDraft({
  client: "Acme GmbH",
  pitchTitle: "Invoice automation",
  businessNeed: "Reduce manual matching",
  summary: "CFO wants faster close",
  painPoints: "Three-way match breaks weekly",
  primaryContact: "Jane Doe",
  proposedSolution: "Agent-assisted matching",
});

const intake = mergeStage1Intake(opportunity.stage1_intake, draft, opportunity);
assert.equal(intake.sales_topic_description, "Original topic");
assert.match(intake.about_company ?? "", /Original about/);
assert.match(intake.about_company ?? "", /CFO wants faster close/);
assert.equal(intake.poc_name, "Jane Doe");

const pack = mergeClientInformation(opportunity.additional_client_information, draft);
assert.ok(pack.priorities?.includes("Original priority"));
assert.ok(pack.priorities?.includes("Reduce manual matching"));
assert.ok(pack.constraints?.some((line) => line.includes("Three-way match")));
assert.equal(pack.contacts?.[0]?.name, "Jane Doe");
