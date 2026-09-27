import assert from "node:assert/strict";
import { test } from "node:test";

import { discoveryQuestionsFromDraft, meetingPrepBannerSummary } from "./meetingPreparation.js";
import { emptyPitchDraft } from "./pitchDraft.js";

test("discoveryQuestionsFromDraft uses meeting notes when present", () => {
  const draft = emptyPitchDraft({
    questions: "1. First?\n2. Second?",
  });
  assert.deepEqual(discoveryQuestionsFromDraft(draft), ["First?", "Second?"]);
});

test("meetingPrepBannerSummary includes question count", () => {
  assert.match(meetingPrepBannerSummary(12), /12 discovery questions/);
});
