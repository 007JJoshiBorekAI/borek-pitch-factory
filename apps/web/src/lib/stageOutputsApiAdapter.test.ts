import assert from "node:assert/strict";

import type {
  EmailDraftEnvelope,
  Stage1OutputsEnvelope,
  Stage2OutputsEnvelope,
} from "./journeyOutputsContracts.js";
import {
  FIRST_MEETING_PPT_UNFROZEN,
  RETRIEVAL_PROMPT_VERSION_UNAVAILABLE,
  STAGE1_OUTPUTS_NOT_GENERATED,
  STAGE2_OUTPUTS_NOT_GENERATED,
  adaptEmailDraftEnvelope,
  adaptStage1OutputsEnvelope,
  adaptStage2OutputsEnvelope,
  followupDraftFromEmailRecord,
  isFirstContactPresentationDownloadBlocked,
  resolveEmailDraftLength,
} from "./stageOutputsApiAdapter.js";

const OPPORTUNITY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const readyStage1: Stage1OutputsEnvelope = {
  schema_version: "1.0",
  opportunity_id: OPPORTUNITY_ID,
  status: "ready",
  outputs: {
    hypothesis: { statement: "Automation could reduce manual matching.", origin: "AI_HYPOTHESIS" },
    product_relevance: { statement: "Invoice 3-way match is relevant.", origin: "AI_HYPOTHESIS" },
    discovery_questions: Array.from({ length: 10 }, (_, index) => ({
      id: `Q${index + 1}`,
      text: `Question ${index + 1}?`,
    })),
    use_cases: [
      { title: "Invoice 3-way Match", rationale: "High volume", availability: "matched" },
      { title: "Unknown case", rationale: "", availability: "unknown" },
    ],
    agenda: {
      title: "First meeting",
      items: [
        { order: 1, label: "Introductions" },
        { order: 2, label: "Scope" },
      ],
    },
    presentation: {
      status: "unfrozen",
      profile: "first_meeting_3",
      code: FIRST_MEETING_PPT_UNFROZEN,
      presentation_id: null,
      download_url: null,
    },
    research: null,
    generated_at: "2026-09-23T10:00:00Z",
  },
};

assert.equal(adaptStage1OutputsEnvelope({
  schema_version: "1.0",
  opportunity_id: OPPORTUNITY_ID,
  status: "not_generated",
  outputs: null,
}).panelOutputs, null);

const notGenerated = adaptStage1OutputsEnvelope({
  schema_version: "1.0",
  opportunity_id: OPPORTUNITY_ID,
  status: "not_generated",
  outputs: null,
});
assert.deepEqual(notGenerated.dependencies, [STAGE1_OUTPUTS_NOT_GENERATED]);

const stage1 = adaptStage1OutputsEnvelope(readyStage1);
assert.ok(stage1.panelOutputs);
assert.equal(stage1.panelOutputs.discovery_questions.items.length, 10);
assert.equal(stage1.panelOutputs.discovery_questions.items[0].origin, "UNKNOWN");
assert.equal(stage1.panelOutputs.discovery_questions.items[0].source_refs, undefined);
assert.equal(stage1.panelOutputs.meeting_agenda.origin, "UNKNOWN");
assert.equal(stage1.panelOutputs.meeting_agenda.items[0].topic, "Introductions");
assert.equal(stage1.panelOutputs.meeting_agenda.items[0].duration_minutes, null);
assert.equal(stage1.panelOutputs.use_cases.items[0].use_case_id, "");
assert.equal(stage1.panelOutputs.use_cases.items[0].origin, "UNKNOWN");
assert.equal(stage1.panelOutputs.use_cases.items[1].status, "unknown");
assert.equal(stage1.panelOutputs.prompt_version, "");
assert.ok(stage1.dependencies.includes(RETRIEVAL_PROMPT_VERSION_UNAVAILABLE));
assert.equal(stage1.panelOutputs.presentation_ref.profile, "first_meeting_3_slide");
assert.equal(stage1.panelOutputs.presentation_ref.status, "pending");
assert.equal(stage1.presentationUnfrozen, true);
assert.ok(stage1.dependencies.includes(FIRST_MEETING_PPT_UNFROZEN));
assert.equal(isFirstContactPresentationDownloadBlocked(stage1), true);

const readyStage2: Stage2OutputsEnvelope = {
  schema_version: "1.0",
  opportunity_id: OPPORTUNITY_ID,
  status: "ready",
  outputs: {
    call_summary: "Agreed to proceed with discovery.",
    mom: {
      title: "Minutes — Acme",
      participants: ["Anna Keller", "Jonas Meier"],
      decisions: ["Proceed with discovery"],
      action_items: ["Share workbook"],
      open_questions: ["Which SAP modules?"],
      meeting_feedback: "Client prefers phased rollout.",
    },
    presentation: {
      status: "unfrozen",
      code: "DEEPENING_PPT_PENDING",
      presentation_id: null,
      download_url: null,
    },
    transcript_summary: {
      schema_version: "1.0",
      transcript_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      conversation_id: "C1",
    },
    generated_at: "2026-09-23T11:00:00Z",
  },
};

const stage2NotGenerated = adaptStage2OutputsEnvelope({
  schema_version: "1.0",
  opportunity_id: OPPORTUNITY_ID,
  status: "not_generated",
  outputs: null,
});
assert.deepEqual(stage2NotGenerated.dependencies, [STAGE2_OUTPUTS_NOT_GENERATED]);

const stage2 = adaptStage2OutputsEnvelope(readyStage2);
assert.ok(stage2.panelOutputs);
assert.equal(stage2.panelOutputs.call_summary.text, "Agreed to proceed with discovery.");
assert.equal(stage2.panelOutputs.call_summary.origin, "UNKNOWN");
assert.equal(stage2.panelOutputs.call_summary.source_refs.length, 0);
assert.equal(stage2.panelOutputs.prompt_version, "");
assert.ok(stage2.dependencies.includes(RETRIEVAL_PROMPT_VERSION_UNAVAILABLE));
assert.equal(stage2.panelOutputs.minutes_of_meeting.sections.length, 5);
assert.equal(stage2.panelOutputs.decisions[0].origin, "UNKNOWN");
assert.equal(stage2.panelOutputs.decisions[0].source_refs.length, 0);
assert.equal(stage2.panelOutputs.transcript_summary_ref.conversation_id, "C1");
assert.equal(stage2.panelOutputs.presentation_ref.status, "pending");
assert.equal(stage2.presentationUnfrozen, true);

const emailEnvelope: EmailDraftEnvelope = {
  schema_version: "1.0",
  opportunity_id: OPPORTUNITY_ID,
  journey_stage: "deepening",
  draft: {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    status: "draft",
    send_status: "not_sent",
    selected_length: null,
    lengths: {
      short: { subject: "Short subject", body: "Short body.", word_count: 2 },
      medium: { subject: "Medium subject", body: "Medium body with more detail.", word_count: 6 },
      extensive: { subject: "Extensive subject", body: "Extensive body with even more detail.", word_count: 8 },
    },
    confirmed_at: null,
    created_at: "2026-09-23T12:00:00Z",
    updated_at: "2026-09-23T12:00:00Z",
  },
};

assert.equal(resolveEmailDraftLength(emailEnvelope.draft!, "short"), "short");
const adaptedEmail = adaptEmailDraftEnvelope(emailEnvelope, "short");
assert.equal(adaptedEmail.panelDraft?.subject, "Short subject");
assert.equal(adaptedEmail.serverConfirmed, false);
assert.equal(adaptedEmail.sendStatus, "not_sent");

const confirmedEnvelope: EmailDraftEnvelope = {
  ...emailEnvelope,
  draft: {
    ...emailEnvelope.draft!,
    status: "confirmed",
    selected_length: "medium",
    confirmed_at: "2026-09-23T12:05:00Z",
  },
};
const confirmedAdapted = adaptEmailDraftEnvelope(confirmedEnvelope);
assert.equal(confirmedAdapted.serverConfirmed, true);
assert.equal(confirmedAdapted.panelDraft?.status, "reviewed");
assert.equal(followupDraftFromEmailRecord(confirmedEnvelope.draft!).body, "Medium body with more detail.");

const emptyEmail = adaptEmailDraftEnvelope({
  schema_version: "1.0",
  opportunity_id: OPPORTUNITY_ID,
  journey_stage: "first_contact",
  draft: null,
});
assert.equal(emptyEmail.panelDraft, null);
assert.equal(emptyEmail.serverConfirmed, false);

console.log("MS-35 stageOutputsApiAdapter tests passed");
