import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PitchGenerationView } from "./PitchGenerationView.js";
import {
  buildPitchGenerationProgress,
  buildPitchSlideRows,
} from "../lib/pitchGeneration.js";

const plannedSlides = [
  { order: 1, purpose: "Cover", layoutId: "COVER_01" },
  { order: 2, purpose: "Client context", layoutId: "CONTEXT_01" },
  { order: 3, purpose: "Opportunity", layoutId: "SCOPE_01" },
  { order: 4, purpose: "Borek approach", layoutId: "PROCESS_FLOW_01" },
];

const inProgressSlides = buildPitchSlideRows({
  plannedSlides,
  deckTiles: [
    {
      slideId: "slide-1",
      slideIndex: 0,
      layoutId: "COVER_01",
      previewUrl: "/preview/0.png",
    },
    {
      slideId: "slide-2",
      slideIndex: 1,
      layoutId: "CONTEXT_01",
      previewUrl: "/preview/1.png",
    },
    {
      slideId: "slide-3",
      slideIndex: 2,
      layoutId: "SCOPE_01",
      previewUrl: "/preview/2.png",
    },
  ],
});

const progress = buildPitchGenerationProgress({
  slides: inProgressSlides,
  pptxAvailable: false,
  jobSnapshot: {
    jobId: "job-1",
    jobType: "presentation_generation",
    status: "RUNNING",
    currentStage: "SLIDE_GENERATING",
    startedAt: "2026-09-25T12:00:00.000Z",
    createdAt: "2026-09-25T12:00:00.000Z",
    completedAt: null,
    error: null,
  },
  nowMs: Date.parse("2026-09-25T12:03:04.000Z"),
});

const html = renderToStaticMarkup(
  <PitchGenerationView
    eyebrow="PRE-MEETING · ACME GMBH"
    title="Creating your pitch"
    progress={progress}
    slides={inProgressSlides}
    selectedSlideKey="slide-3"
    onSelectSlide={() => undefined}
    accessToken="token"
    busy={false}
    downloadEnabled={false}
    onDownload={() => undefined}
    onRegenerate={() => undefined}
    onChangeLayout={() => undefined}
  />,
);

assert.match(html, /pitch-generation-workspace/);
assert.match(html, /PRE-MEETING · ACME GMBH/);
assert.match(html, /Creating your pitch/);
assert.match(html, /3 of 4 slides ready/);
assert.match(html, /pitch-slide-list/);
assert.match(html, /pitch-slide-preview/);
assert.match(html, /SLIDE 03 · OPPORTUNITY/);
assert.match(html, /Waiting/);
assert.match(html, /Download PPTX/);
assert.match(html, /is-disabled/);
assert.match(html, /Download will be available when all 4 slides are ready/);
assert.match(html, /Generating slides/);
assert.doesNotMatch(html, /About 3 minutes remaining/);

const completedSlides = buildPitchSlideRows({
  plannedSlides,
  deckTiles: [
    {
      slideId: "slide-1",
      slideIndex: 0,
      layoutId: "COVER_01",
      previewUrl: "/preview/0.png",
    },
    {
      slideId: "slide-2",
      slideIndex: 1,
      layoutId: "CONTEXT_01",
      previewUrl: "/preview/1.png",
    },
    {
      slideId: "slide-3",
      slideIndex: 2,
      layoutId: "SCOPE_01",
      previewUrl: "/preview/2.png",
    },
    {
      slideId: "slide-4",
      slideIndex: 3,
      layoutId: "PROCESS_FLOW_01",
      previewUrl: "/preview/3.png",
    },
  ],
});

const completedHtml = renderToStaticMarkup(
  <PitchGenerationView
    eyebrow="PRE-MEETING · ACME GMBH"
    title="Your presentation is ready"
    progress={buildPitchGenerationProgress({
      slides: completedSlides,
      pptxAvailable: true,
    })}
    slides={completedSlides}
    selectedSlideKey="slide-1"
    onSelectSlide={() => undefined}
    accessToken="token"
    busy={false}
    downloadEnabled
    onDownload={() => undefined}
  />,
);

assert.match(completedHtml, /Your presentation is ready/);
assert.match(completedHtml, /4 of 4 slides ready/);
assert.doesNotMatch(completedHtml, /pitch-generation-download-btn is-disabled/);

const deckCenterSource = readFileSync(
  fileURLToPath(new URL("./DeckCenterPanel.tsx", import.meta.url)),
  "utf8",
);
assert.match(deckCenterSource, /PitchGenerationView/);
assert.match(deckCenterSource, /buildPitchSlideRows/);
assert.match(deckCenterSource, /getLatestPresentationPlan/);
assert.match(deckCenterSource, /regeneratePresentationSlide/);
assert.match(deckCenterSource, /changePresentationSlideLayout/);
assert.match(
  readFileSync(fileURLToPath(new URL("./PitchGenerationView.tsx", import.meta.url)), "utf8"),
  /concretisation-email-review/,
);
assert.match(deckCenterSource, /followupReviewHref/);
assert.doesNotMatch(deckCenterSource, /WorkflowActionBar/);
assert.doesNotMatch(deckCenterSource, /WorkflowStepIndicator/);
assert.doesNotMatch(deckCenterSource, /deck-slide-grid/);

console.log("FIGMA-06 pitch generation view tests passed");
