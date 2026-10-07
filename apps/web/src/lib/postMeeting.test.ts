import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { extractionIsCurrent, loadMeetingInputs, loadPostMeetingWorkflow, MeetingNotesConflict, parseMeetingExtraction, prepareMeetingEvidence, validateTranscript, workflowCompleted, type MeetingExtraction, type PersonalNotes } from "./postMeeting";

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

test("transcript validation accepts backend text formats and rejects empty or unsupported files", () => {
  for (const name of ["call.txt", "call.VTT", "call.srt", "call.docx"]) assert.equal(validateTranscript({ name, size: 1 }), null);
  assert.match(validateTranscript({ name: "call.pdf", size: 1 })!, /TXT/);
  assert.match(validateTranscript({ name: "call.txt", size: 0 })!, /empty/);
});

test("meeting reload reads only transcripts, notes and processing state, not use-case resources", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
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
    };
    return Response.json(data[resource]);
  };
  try {
    const data = await loadMeetingInputs("token", opportunityId);
    assert.equal(calls.length, 3);
    assert.equal(data.notes.text, "Owner observation");
    assert.ok(calls.every((url) => !url.includes("use-cases")));
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

test("meeting input failures are surfaced rather than converted into empty inputs", async () => {
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
  assert.match(meeting, /prepareMeetingEvidence\(token, opportunityId, transcriptId, notes, inputs.notes/);
  assert.match(boundary, /meeting\|review\|follow-up\|post-meeting-presentation/);
  assert.match(shell, /step.id === "ppt_2_generated" \? "post-meeting-presentation"/);
});

function mockPreparation(initialNotes: PersonalNotes, currentExtraction: MeetingExtraction | null = null, failExtraction = false, eligible = true) {
  const calls: string[] = [];
  let savedNotes = { ...initialNotes };
  const writes: unknown[] = [];
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    const method = init?.method ?? "GET";
    calls.push(`${method} ${path}`);
    assert.ok(path.startsWith(`/opportunities/${opportunityId}/`));
    if (path.endsWith("/workflow-status")) return Response.json({ opportunity_id: opportunityId, current_status: "transcript_added", steps: [{ key: "first_meeting_completed", state: eligible ? "completed" : "current" }], documents: { ppt1: null, ppt2: null, approved_discovery: { version_id: "approved-1", version_number: 1 } }, finalization: null });
    if (path.endsWith("/transcripts")) return Response.json([{ id: "transcript-1", file_name: "call.txt", created_at: "2026-10-06" }]);
    if (path.endsWith("/personal-notes")) {
      if (method === "PUT") {
        const body = JSON.parse(String(init?.body));
        writes.push(body);
        savedNotes = { text: body.text.trim() || null, updated_at: "saved-revision" };
      }
      return Response.json(savedNotes);
    }
    if (path.endsWith("/meeting-extraction")) return Response.json(currentExtraction ?? { status: "not_generated", extraction: null });
    if (path.endsWith("/meeting-extraction/generate")) {
      assert.equal(method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), { transcript_id: "transcript-1" });
      return Response.json(failExtraction ? { status: "not_generated", extraction: null } : { ...extraction, personal_notes_updated_at: savedNotes.text ? savedNotes.updated_at : null });
    }
    throw new Error(`Unexpected endpoint ${path}`);
  };
  return { calls, writes };
}

test("transcript-only generation preparation accepts blank or whitespace notes without a notes write", async () => {
  const original = globalThis.fetch;
  try {
    for (const text of ["", "   "]) {
      const baseline = { text: null, updated_at: null };
      const { calls, writes } = mockPreparation(baseline);
      const result = await prepareMeetingEvidence("token", opportunityId, "transcript-1", text, baseline);
      assert.equal(result.inputs.extraction?.transcript_id, "transcript-1");
      assert.equal(writes.length, 0);
      assert.ok(calls.some((call) => call.includes("POST ") && call.endsWith("meeting-extraction/generate")));
      assert.ok(calls.every((call) => !call.includes("use-cases")));
    }
  } finally { globalThis.fetch = original; }
});

test("additional notes save separately before automatic transcript processing", async () => {
  const original = globalThis.fetch;
  try {
    const baseline = { text: null, updated_at: null };
    const { calls, writes } = mockPreparation(baseline);
    const progress: string[] = [];
    const result = await prepareMeetingEvidence("token", opportunityId, "transcript-1", "  Optional observation  ", baseline, { onProgress: (value) => progress.push(value) });
    assert.deepEqual(writes, [{ text: "  Optional observation  " }]);
    assert.ok(calls.findIndex((call) => call.startsWith("PUT ")) < calls.findIndex((call) => call.startsWith("POST ")));
    assert.deepEqual(progress, ["Saving additional notes", "Processing transcript"]);
    assert.equal(result.inputs.notes.text, "Optional observation");
    assert.equal(extractionIsCurrent(result.inputs.extraction, "transcript-1", result.inputs.notes), true);
  } finally { globalThis.fetch = original; }
});

test("clearing old optional notes persists the clear and refreshes extraction", async () => {
  const original = globalThis.fetch;
  try {
    const baseline = { text: "Old notes", updated_at: "old-revision" };
    const { writes } = mockPreparation(baseline, { ...extraction, personal_notes_updated_at: "old-revision" });
    const result = await prepareMeetingEvidence("token", opportunityId, "transcript-1", "", baseline);
    assert.deepEqual(writes, [{ text: "" }]);
    assert.equal(result.inputs.notes.text, null);
    assert.equal(result.inputs.extraction?.personal_notes_updated_at, null);
    assert.equal(extractionIsCurrent(result.inputs.extraction, "transcript-1", result.inputs.notes), true);
  } finally { globalThis.fetch = original; }
});

test("already-current processing is reused and failed processing retains the saved notes baseline", async () => {
  const original = globalThis.fetch;
  try {
    const baseline = { text: null, updated_at: null };
    const first = mockPreparation(baseline, extraction);
    await prepareMeetingEvidence("token", opportunityId, "transcript-1", "", baseline);
    assert.ok(first.calls.every((call) => call.startsWith("GET ")));
    mockPreparation(baseline, null, true);
    const persisted: PersonalNotes[] = [];
    await assert.rejects(prepareMeetingEvidence("token", opportunityId, "transcript-1", "New notes", baseline, { onInputs: (value) => persisted.push(value.notes) }), /not finished processing/);
    assert.deepEqual(persisted, [{ text: "New notes", updated_at: "saved-revision" }]);
  } finally { globalThis.fetch = original; }
});

test("missing transcript, ineligible workflow and conflicting notes stop preparation before writes", async () => {
  const original = globalThis.fetch;
  try {
    const baseline = { text: null, updated_at: null };
    let mocked = mockPreparation(baseline);
    await assert.rejects(prepareMeetingEvidence("token", opportunityId, "missing", "", baseline), /Upload a transcript/);
    assert.ok(mocked.calls.every((call) => call.startsWith("GET ")));
    mocked = mockPreparation(baseline, null, false, false);
    await assert.rejects(prepareMeetingEvidence("token", opportunityId, "transcript-1", "", baseline), /not eligible/);
    assert.ok(mocked.calls.every((call) => call.startsWith("GET ")));
    mocked = mockPreparation({ text: "Someone else's edit", updated_at: "newer" });
    await assert.rejects(prepareMeetingEvidence("token", opportunityId, "transcript-1", "My notes", baseline), MeetingNotesConflict);
    assert.ok(mocked.calls.every((call) => call.startsWith("GET ")));
  } finally { globalThis.fetch = original; }
});

test("meeting input matches the two-card reference without extraction, use-case or confirmation fields", () => {
  const source = readFileSync(new URL("../components/MeetingEvidencePanel.tsx", import.meta.url), "utf8");
  assert.match(source, /Upload transcript/);
  assert.match(source, /Type notes/);
  assert.match(source, /Additional notes <span>\(optional\)<\/span>/);
  assert.match(source, /Leave blank if the transcript covers everything/);
  assert.match(source, /Generate documents/);
  assert.match(source, /styles.meetingCard/);
  assert.match(source, /styles.meetingSummary/);
  assert.doesNotMatch(source, /<select|type="checkbox"|EXTRACTION_FIELDS|saveSelectedUseCases|Save personal notes|Review the extraction|Selected use case|Promised attachments/);
  assert.doesNotMatch(source, /<textarea[^>]*\brequired\b/);
  assert.match(source, /if \(previewMode\) \{ setPreviewFile\(file\)/);
});
