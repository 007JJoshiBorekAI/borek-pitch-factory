import assert from "node:assert/strict";
import test from "node:test";

import type { Stage2OutputsEnvelope } from "./api.js";
import { emptyPitchDraft } from "./pitchDraft.js";
import {
  applyStage2OutputsToDraft,
  meetingDateFromSummary,
  meetingSectionEmpty,
  stage2NeedsRefresh,
} from "./firstMeetingFromTranscript.js";

const summary = {
  schema_version: "1.0",
  opportunity_id: "00000000-0000-4000-8000-000000000001",
  transcript_id: "00000000-0000-4000-8000-000000000002",
  participants: ["Sandra Krüger (Meridian)", "Thomas Berg (Meridian)"],
  decisions: ["From IT: data stays in the EU, no long-term storage of raw PDFs."],
  action_items: [
    {
      text: "Lena Hoffmann (BOREK): I will send the questionnaire by Friday 26 September.",
      owner: "Lena Hoffmann (BOREK)",
      due: null,
    },
  ],
  open_questions: ["Open point: works council timing before we demo anything that touches live posting?"],
  client_terms: [],
  narrative:
    "Month-end pressure to hit a five-day close. AP is the loudest problem. "
    + "Shall we book a half-day requirements workshop for 15 October, Hannover or remote?",
  summary_truncated: false,
};

const envelope: Stage2OutputsEnvelope = {
  schema_version: "1.0",
  opportunity_id: summary.opportunity_id,
  status: "ready",
  outputs: {
    call_summary: "Discovery on AP exceptions and pilot scope.",
    mom: {
      title: "Minutes",
      participants: summary.participants,
      decisions: summary.decisions,
      action_items: ["Send security questionnaire by 26 September."],
      open_questions: summary.open_questions,
      meeting_feedback: null,
    },
    presentation: {
      status: "unfrozen",
      code: "ADJUSTED_PPT_PENDING_EXISTING_DECK_PATH",
      presentation_id: null,
      download_url: null,
    },
    transcript_summary: summary,
    generated_at: "2026-09-24T12:00:00Z",
  },
};

test("meetingDateFromSummary prefers explicit calendar dates in narrative", () => {
  assert.equal(meetingDateFromSummary(summary), "15 October");
});

test("applyStage2OutputsToDraft fills empty meeting fields", () => {
  const draft = emptyPitchDraft();
  const merged = applyStage2OutputsToDraft(draft, envelope);
  assert.equal(merged.participants, "Sandra Krüger (Meridian), Thomas Berg (Meridian)");
  assert.match(merged.summary, /Discovery on AP/);
  assert.match(merged.painPoints, /five-day close/);
  assert.match(merged.requirements, /data stays in the EU/);
  assert.match(merged.questions, /works council/);
  assert.match(merged.nextMeeting, /15 October/);
  assert.ok(merged.actionItems.includes("questionnaire"));
});

test("applyStage2OutputsToDraft preserves user edits unless overwriteMeeting", () => {
  const draft = emptyPitchDraft({ summary: "My notes" });
  const merged = applyStage2OutputsToDraft(draft, envelope);
  assert.equal(merged.summary, "My notes");
  const overwritten = applyStage2OutputsToDraft(draft, envelope, { overwriteMeeting: true });
  assert.match(overwritten.summary, /Discovery on AP/);
});

test("stage2NeedsRefresh when transcript id differs", () => {
  assert.equal(stage2NeedsRefresh("00000000-0000-4000-8000-000000000099", envelope), true);
  assert.equal(stage2NeedsRefresh(summary.transcript_id, envelope), false);
  assert.equal(meetingSectionEmpty(emptyPitchDraft()), true);
});
