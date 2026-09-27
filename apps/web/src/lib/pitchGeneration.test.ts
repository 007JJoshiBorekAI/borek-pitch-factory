import assert from "node:assert/strict";

import {
  buildPitchGenerationProgress,
  buildPitchSlideRows,
  countReadySlides,
  findPitchSlideByKey,
  formatPitchEyebrow,
  isPitchDownloadReady,
  mapSlideUiState,
  pitchGenerationTitle,
  planOrderToSlideIndex,
  resolveInitialSelectedSlideKey,
  resolveStableSelectedSlideKey,
} from "./pitchGeneration.js";
import type { JobProgressSnapshot } from "./jobProgress.js";

const plannedSlides = [
  { order: 1, purpose: "cover", layoutId: "COVER_01" },
  { order: 2, purpose: "context", layoutId: "CONTEXT_01" },
  { order: 3, purpose: "scope", layoutId: "SCOPE_01" },
];

const deckTiles = [
  {
    slideId: "slide-a",
    slideIndex: 0,
    layoutId: "COVER_01",
    previewUrl: "/preview/0.png",
  },
  {
    slideId: "slide-b",
    slideIndex: 1,
    layoutId: "CONTEXT_01",
    previewUrl: "/preview/1.png",
  },
];

assert.equal(planOrderToSlideIndex(1), 0);
assert.equal(formatPitchEyebrow("Acme GmbH"), "PRE-MEETING · ACME GMBH");
assert.equal(pitchGenerationTitle(false), "Creating your pitch");
assert.equal(pitchGenerationTitle(true), "Your presentation is ready");

assert.equal(mapSlideUiState({ hasPreview: true, regeneratingSlideId: null, slideId: "x" }), "ready");
assert.equal(
  mapSlideUiState({ hasPreview: true, regeneratingSlideId: "x", slideId: "x" }),
  "generating",
);
assert.equal(mapSlideUiState({ hasPreview: false, regeneratingSlideId: null, slideId: null }), "waiting");

const inProgressRows = buildPitchSlideRows({
  plannedSlides,
  deckTiles: [],
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
});
assert.equal(inProgressRows.length, 3);
assert.ok(inProgressRows.every((row) => row.uiState === "waiting"));
assert.equal(countReadySlides(inProgressRows), 0);
assert.equal(resolveInitialSelectedSlideKey(inProgressRows), null);

const partialReadyRows = buildPitchSlideRows({
  plannedSlides,
  deckTiles,
});
assert.equal(partialReadyRows.length, 3);
assert.equal(partialReadyRows[0]?.uiState, "ready");
assert.equal(partialReadyRows[1]?.uiState, "ready");
assert.equal(partialReadyRows[2]?.uiState, "waiting");
assert.equal(countReadySlides(partialReadyRows), 2);
assert.equal(resolveInitialSelectedSlideKey(partialReadyRows), "slide-a");
assert.equal(
  resolveStableSelectedSlideKey(partialReadyRows, "slide-b"),
  "slide-b",
);

const regeneratingRows = buildPitchSlideRows({
  plannedSlides: plannedSlides.slice(0, 2),
  deckTiles: deckTiles.slice(0, 2),
  regeneratingSlideId: "slide-b",
  jobSnapshot: {
    jobId: "job-2",
    jobType: "slide_regenerate",
    status: "RUNNING",
    currentStage: "SLIDE_GENERATING",
    startedAt: "2026-09-25T12:00:00.000Z",
    createdAt: "2026-09-25T12:00:00.000Z",
    completedAt: null,
    error: null,
  },
});
assert.equal(regeneratingRows[0]?.uiState, "ready");
assert.equal(regeneratingRows[1]?.uiState, "generating");

const progressInFlight = buildPitchGenerationProgress({
  slides: inProgressRows,
  jobSnapshot: null,
  pptxAvailable: false,
  nowMs: Date.parse("2026-09-25T12:03:04.000Z"),
});
assert.equal(progressInFlight.readyCount, 0);
assert.equal(progressInFlight.totalCount, 3);
assert.equal(progressInFlight.progressRatio, 0);
assert.equal(progressInFlight.isComplete, false);

const jobSnapshot: JobProgressSnapshot = {
  jobId: "job-1",
  jobType: "presentation_generation",
  status: "RUNNING",
  currentStage: "SLIDE_GENERATING",
  startedAt: "2026-09-25T12:00:00.000Z",
  createdAt: "2026-09-25T12:00:00.000Z",
  completedAt: null,
  error: null,
};
const progressWithJob = buildPitchGenerationProgress({
  slides: inProgressRows,
  jobSnapshot,
  pptxAvailable: false,
  nowMs: Date.parse("2026-09-25T12:03:04.000Z"),
});
assert.match(progressWithJob.generatingSlideLabel ?? "", /Generating slides/);
assert.equal(progressWithJob.elapsedLabel, "3m 4s elapsed");
assert.match(progressWithJob.downloadHint, /all 3 slides are ready/);

const completedRows = buildPitchSlideRows({
  plannedSlides,
  deckTiles: [
    ...deckTiles,
    {
      slideId: "slide-c",
      slideIndex: 2,
      layoutId: "SCOPE_01",
      previewUrl: "/preview/2.png",
    },
  ],
});
const progressComplete = buildPitchGenerationProgress({
  slides: completedRows,
  pptxAvailable: true,
  jobSnapshot: null,
});
assert.equal(progressComplete.isComplete, true);
assert.equal(progressComplete.progressRatio, 1);
assert.equal(
  isPitchDownloadReady({ slides: completedRows, pptxAvailable: true, busy: false }),
  true,
);
assert.equal(
  isPitchDownloadReady({ slides: partialReadyRows, pptxAvailable: true, busy: false }),
  false,
);
assert.equal(findPitchSlideByKey(completedRows, "slide-c")?.title, "Scope");

console.log("FIGMA-06 pitch generation tests passed");
