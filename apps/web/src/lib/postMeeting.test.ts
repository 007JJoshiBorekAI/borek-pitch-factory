import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { extractionIsCurrent, loadMeetingInputs, loadPostMeetingWorkflow, meetingEvidenceKey, parseMeetingExtraction, validateTranscript, workflowCompleted, type MeetingExtraction, type MeetingInputs } from "./postMeeting";

const opportunityId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const extraction: MeetingExtraction = {
  transcript_id: "transcript-1", generated_at: "2026-10-06T10:00:00Z", personal_notes_updated_at: null,
  requirements: ["Keep approved content"], challenges: [], priorities: [], opportunities: [], discussed_solutions: [], decisions: [], follow_ups: [],
};

test("extraction accepts the implemented flat response and explicit missing state only", () => {
  assert.deepEqual(parseMeetingExtraction(extraction), extraction);
  assert.equal(parseMeetingExtraction({ status: "not_generated", extraction: null }), null);
  assert.throws(() => parseMeetingExtraction({ requirements: [] }), /incomplete/);
  assert.throws(() => parseMeetingExtraction({ ...extraction, decisions: [123] }), /incomplete/);
});

test("extraction is stale after transcript or saved notes change", () => {
  assert.equal(extractionIsCurrent(extraction, "transcript-1", { text: null, updated_at: null }), true);
  assert.equal(extractionIsCurrent(extraction, "transcript-2", { text: null, updated_at: null }), false);
  assert.equal(extractionIsCurrent(extraction, "transcript-1", { text: "changed", updated_at: "later" }), false);
  assert.equal(extractionIsCurrent(null, "transcript-1", { text: null, updated_at: null }), false);
  assert.equal(extractionIsCurrent(extraction, "transcript-1", { text: null, updated_at: "cleared-at" }), true);
  assert.equal(extractionIsCurrent(extraction, "transcript-1", { text: "  ", updated_at: "cleared-at" }), true);
});

test("review snapshot detects changed extraction, saved notes and ordered use-case selection", () => {
  const inputs: MeetingInputs = { transcripts: [], notes: { text: null, updated_at: null }, extraction, available: [], selected: { use_case_ids: ["a", "b"], use_cases: [] } };
  const key = meetingEvidenceKey(inputs);
  assert.notEqual(meetingEvidenceKey({ ...inputs, extraction: { ...extraction, generated_at: "new-revision" } }), key);
  assert.notEqual(meetingEvidenceKey({ ...inputs, notes: { text: "new notes", updated_at: "changed" } }), key);
  assert.notEqual(meetingEvidenceKey({ ...inputs, selected: { ...inputs.selected, use_case_ids: ["b", "a"] } }), key);
  assert.equal(meetingEvidenceKey(structuredClone(inputs)), key);
});

test("transcript validation accepts backend text formats and rejects empty or unsupported files", () => {
  for (const name of ["call.txt", "call.VTT", "call.srt", "call.docx"]) assert.equal(validateTranscript({ name, size: 1 }), null);
  assert.match(validateTranscript({ name: "call.pdf", size: 1 })!, /TXT/);
  assert.match(validateTranscript({ name: "call.txt", size: 0 })!, /empty/);
});

test("meeting reload reads separate scoped resources without altering saved use-case content", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  const selected = { use_case_ids: ["case-b", "case-a"], use_cases: [{ fact_id: "case-b", status: "resolved", payload: { body: "Original\nbody" } }, { fact_id: "case-a", status: "unresolved", payload: null }] };
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    assert.equal(init?.method ?? "GET", "GET");
    assert.match(url, new RegExp(`/opportunities/${opportunityId}/`));
    const resource = url.split("/").pop()!;
    const data: Record<string, unknown> = {
      transcripts: [{ id: "transcript-1", file_name: "call.txt", processing_status: "pending" }],
      "personal-notes": { text: "Owner observation", updated_at: null },
      "meeting-extraction": extraction,
      "available-use-cases": { use_cases: [] }, "selected-use-cases": selected,
    };
    return Response.json(data[resource]);
  };
  try {
    const data = await loadMeetingInputs("token", opportunityId);
    assert.equal(calls.length, 5);
    assert.equal(data.notes.text, "Owner observation");
    assert.deepEqual(data.selected, selected);
    assert.equal(data.extraction?.requirements[0], "Keep approved content");
  } finally { globalThis.fetch = original; }
});

test("workflow rejects another opportunity and never infers completed checkpoints from current status", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ opportunity_id: "another-client", steps: [], documents: {} });
  try { await assert.rejects(loadPostMeetingWorkflow("token", opportunityId), /another opportunity/); }
  finally { globalThis.fetch = original; }
  assert.equal(workflowCompleted(null, "first_meeting_completed"), false);
});

test("meeting input failures are surfaced rather than converted into an empty corpus", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: { code: "FORBIDDEN", message: "Not authorized" } }, { status: 403 });
  try { await assert.rejects(loadMeetingInputs("token", opportunityId), /Not authorized/); }
  finally { globalThis.fetch = original; }
});

test("post-meeting scope retains staged edits during token rotation and leaves the pre-meeting route separate", () => {
  const shell = readFileSync(new URL("../components/PostMeetingShell.tsx", import.meta.url), "utf8");
  const meeting = readFileSync(new URL("../components/MeetingEvidencePanel.tsx", import.meta.url), "utf8");
  const boundary = readFileSync(new URL("../components/OpportunityWorkflowShell.tsx", import.meta.url), "utf8");
  assert.match(shell, /key=\{`\$\{opportunityId\}:\$\{previewMode\}:\$\{ownerId\}`\}/);
  assert.match(meeting, /!accessToken \|\| loaded.current/);
  assert.match(meeting, /meetingEvidenceKey\(latest\) !== meetingEvidenceKey\(inputs\)/);
  assert.match(boundary, /meeting\|review\|follow-up\|post-meeting-presentation/);
  assert.match(shell, /step.id === "ppt_2_generated" \? "post-meeting-presentation"/);
});
