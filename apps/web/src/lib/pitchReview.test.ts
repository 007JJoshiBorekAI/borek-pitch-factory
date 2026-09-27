import assert from "node:assert/strict";

import { emptyPitchDraft } from "./pitchDraft.js";
import { buildPitchReviewSlides, pitchReviewStatusLabel } from "./pitchReview.js";

const tiles = [
  {
    slideId: "a",
    slideIndex: 0,
    layoutId: "CONTEXT_01",
    previewUrl: "/preview/0.png",
  },
  {
    slideId: "b",
    slideIndex: 1,
    layoutId: "PROBLEM_SOLUTION_01",
    previewUrl: null,
  },
];

const planSlides = [
  {
    order: 1,
    purpose: "Set the client context",
    layoutId: "CONTEXT_01",
    frameworkReferences: ["Released capabilities deck"],
  },
  {
    order: 2,
    purpose: "Connect pressure to Borek capabilities",
    layoutId: "PROBLEM_SOLUTION_01",
    frameworkReferences: ["Case study 2025-04"],
  },
];

const draft = emptyPitchDraft({
  client: "Acme GmbH",
  requirements: "Consistency across German and Polish support is a priority.",
  meetingDate: "18 Sep",
});

const items = buildPitchReviewSlides(tiles, planSlides, draft);
assert.equal(items.length, 2);
assert.equal(items[0].shortLabel, "Context");
assert.match(items[0].clientQuote ?? "", /Consistency across German/);
assert.equal(items[1].needsAttention, true);
assert.equal(pitchReviewStatusLabel(items), "Draft · 1 item need review");

const fromPlanOnly = buildPitchReviewSlides([], planSlides, draft);
assert.equal(fromPlanOnly.length, 2);
assert.equal(fromPlanOnly[0].purpose, "Set the client context");
assert.equal(fromPlanOnly[1].needsAttention, true);

console.log("pitchReview tests passed");
