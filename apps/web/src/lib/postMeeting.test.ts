import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  blockerText, confirmMeetingReview, excludedFromConfirmation, extractionIsCurrent, FINDING_SOURCE_LABEL, findingsState, isStaleReviewError,
  loadMeetingInputs, loadPostMeetingReview, loadPostMeetingWorkflow, MeetingNotesConflict, parseMeetingExtraction,
  parsePostMeetingReview, prepareMeetingEvidence, reviewHeadline, savePersonalNotesChecked, staleReasonText,
  validateTranscript, workflowCompleted, type MeetingExtraction, type PersonalNotes, type PostMeetingReview,
} from "./postMeeting";

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
  assert.match(meeting, /prepareMeetingEvidence\(token, opportunityId, transcriptId, notes, baseline/);
  assert.match(meeting, /if \(initial\) setNotes\(value.personal_notes.text \?\? ""\)/, "a refresh never overwrites typed notes");
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

test("meeting screen shows the sources separately, the findings with their source, and an explicit confirmation", () => {
  const source = readFileSync(new URL("../components/MeetingEvidencePanel.tsx", import.meta.url), "utf8");
  // Three labelled sources and one analysis card; notes are optional and never required.
  assert.match(source, /Source 1 · Transcript/);
  assert.match(source, /Source 2 · Personal notes/);
  assert.match(source, /Source 3 · Borek use cases/);
  assert.match(source, /Analysis · Interpretation of the sources/);
  assert.match(source, /never treated as something the client said/);
  assert.doesNotMatch(source, /<textarea[^>]*\brequired\b/);
  // Transcript choice, notes save state, seven categories with per-finding source and include box.
  assert.match(source, /type="radio" name="transcript"/);
  assert.match(source, /notesDirty \? "Unsaved changes"/);
  assert.match(source, /addEventListener\("beforeunload"/);
  assert.match(source, /EXTRACTION_FIELDS.map/);
  assert.match(source, /FINDING_SOURCE_LABEL\[item.source\]/);
  assert.match(source, /Nothing captured/);
  // Loading, failure and retry, stale and ready states are all visible.
  assert.match(source, /Loading meeting inputs/);
  assert.match(source, /Retry loading/);
  assert.match(source, /role="alert"/);
  assert.match(source, /data-testid="findings-status"/);
  assert.match(source, /review.extraction.stale_reasons.map\(staleReasonText\)/);
  assert.match(source, /data-testid="v2-ready"/);
  assert.match(source, /data-testid="v2-blockers"/);
  // Analysing and confirming need saved notes and a current analysis; nothing is confirmed implicitly.
  assert.match(source, /disabled=\{editingDisabled \|\| !transcript \|\| notesDirty\} onClick=\{\(\) => void analyse\(\)\}/);
  assert.match(source, /disabled=\{editingDisabled \|\| state !== "current" \|\| confirmedCurrent\} onClick=\{\(\) => void confirm\(\)\}/);
  // The test extractor is named as such, and preview mode never shows findings.
  assert.match(source, /review\?.execution_mode === "fixture"/);
  assert.match(source, /No AI model is called/);
  assert.match(source, /\{live && review \? <article className=\{styles.card\} aria-labelledby="findings-title"/);
  assert.match(source, /if \(previewMode\) \{ setPreviewFile\(file\)/);
  // Confirming findings and the owner review of the presentation are two different, separately shown steps.
  assert.match(source, /data-testid="findings-confirmation"><span>Meeting findings confirmed<\/span>/);
  assert.match(source, /data-testid="presentation-owner-review"><span>Presentation owner review<\/span><strong>\{workflowCompleted\(workflow, "owner_review"\) \? "Completed" : v2\?.state === "ready" \? "Pending · review V2" : "Pending · after V2"\}/);
  assert.match(source, /is not the owner review of the presentation/);
  assert.doesNotMatch(source, /markOwnerReviewed|workflow\/owner-reviewed|workflow\/finalize/);
  // The old PPT #2 generator is reachable only from the labelled previous flow.
  assert.equal(source.match(/generateAndAwaitPostMeetingPresentation\(/g)?.length, 1);
  assert.equal(source.match(/generateDocuments\(\)/g)?.length, 2, "one definition, one button");
  assert.ok(source.indexOf("Previous document flow</small></summary>") < source.indexOf("onClick={() => void generateDocuments()}"));
  const END_OF_FUNCTION = String.fromCharCode(10) + "  }" + String.fromCharCode(10);
  for (const action of ["onTranscript", "saveNotes", "analyse", "confirm", "saveUseCases"]) {
    const body = source.slice(source.indexOf(`async function ${action}(`), source.indexOf(END_OF_FUNCTION, source.indexOf(`async function ${action}(`)));
    assert.ok(body.length > 0 && !/generateAndAwaitPostMeetingPresentation|prepareMeetingEvidence|ppt2/i.test(body), action);
  }
  // V2 has its own action; the earlier PPT #2 flow is kept apart from it.
  assert.match(source, /Generate Master Presentation V2/);
  assert.match(source, /Previous document flow/);
});

const review = (overrides: Partial<PostMeetingReview> = {}): PostMeetingReview => ({
  opportunity_id: opportunityId, review_fingerprint: "a".repeat(64), execution_mode: "fixture", first_meeting_completed: true, finalized: false,
  transcripts: [{ id: "transcript-1", file_name: "call.txt", processing_status: "pending", created_at: "2026-10-08T09:00:00Z", turn_count: 4, analysed: true }],
  personal_notes: { status: "available", text: "Owner observation", updated_at: "2026-10-08T09:05:00Z" },
  extraction: {
    status: "current", stale_reasons: [], transcript_id: "transcript-1", transcript_file_name: "call.txt",
    generated_at: "2026-10-08T09:10:00Z", execution_mode: "fixture", item_count: 2,
    categories: {
      requirements: [{ text: "Quotes within one day", source: "transcript" }], challenges: [], priorities: [],
      opportunities: [], discussed_solutions: [], decisions: [{ text: "Run a pilot", source: "personal_notes" }], follow_ups: [],
    },
  },
  selected_use_cases: { status: "empty", use_case_ids: [], use_cases: [] },
  approved_discovery: { status: "available", version_id: "discovery-1", version_number: 1 },
  master_presentation: { status: "ready", presentation_id: "deck-1", version_id: "version-1", product_version: "V1" },
  confirmation: { status: "none", stale_reasons: [], confirmed_at: null, items: null, confirmed_count: 0, excluded_count: 0 },
  readiness: { ready_for_v2: false, blockers: ["MEETING_REVIEW_NOT_CONFIRMED"] },
  v2_sources: null,
  ...overrides,
});

test("review responses are validated and never accepted for another opportunity", () => {
  assert.equal(parsePostMeetingReview(review(), opportunityId).extraction.item_count, 2);
  assert.throws(() => parsePostMeetingReview({ ...review(), opportunity_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }, opportunityId), /another opportunity/);
  assert.throws(() => parsePostMeetingReview({ ...review(), readiness: undefined }, opportunityId), /incomplete/);
  assert.throws(() => parsePostMeetingReview({ ...review(), review_fingerprint: undefined }, opportunityId), /incomplete/, "a review without a fingerprint cannot be confirmed safely");
  assert.throws(() => parsePostMeetingReview({ ...review(), review_fingerprint: "abc" }, opportunityId), /incomplete/);
  const broken = review();
  (broken.extraction.categories as Record<string, unknown>).decisions = [{ text: 5, source: "transcript" }];
  assert.throws(() => parsePostMeetingReview(broken, opportunityId), /incomplete/);
  assert.throws(() => parsePostMeetingReview(null, opportunityId), /incomplete/);
});

test("findings are only called current for the selected transcript and saved notes", () => {
  assert.equal(findingsState(review(), "transcript-1", false), "current");
  assert.equal(findingsState(review(), "transcript-1", true), "notes-unsaved");
  assert.equal(findingsState(review(), "transcript-2", false), "other-transcript");
  assert.equal(findingsState(review(), "", false), "no-transcript");
  assert.equal(findingsState(review({ transcripts: [] }), "transcript-1", false), "no-transcript");
  const stale = review();
  stale.extraction = { ...stale.extraction, status: "stale", stale_reasons: ["NOTES_CHANGED"] };
  assert.equal(findingsState(stale, "transcript-1", false), "stale");
  const missing = review();
  missing.extraction = { ...missing.extraction, status: "missing", transcript_id: null };
  assert.equal(findingsState(missing, "transcript-1", false), "not-analysed");
  assert.match(staleReasonText("NOTES_CHANGED"), /notes changed/);
  assert.match(staleReasonText("TRANSCRIPT_REMOVED"), /removed/);
  assert.equal(staleReasonText("SOMETHING_NEW"), "A source changed.");
  assert.match(blockerText("MEETING_EXTRACTION_STALE"), /again/);
  assert.equal(blockerText("SOMETHING_NEW"), "A required input is missing.");
});

test("headline and exclusions follow the stored confirmation, not the extraction alone", () => {
  assert.equal(reviewHeadline(review()), "Review the findings");
  assert.equal(reviewHeadline(review({ transcripts: [], extraction: { ...review().extraction, status: "missing" } })), "Add your transcript");
  assert.equal(reviewHeadline(review({ extraction: { ...review().extraction, status: "stale" } })), "Analysis is out of date");
  assert.deepEqual(excludedFromConfirmation(review()), {});
  const confirmed = review({
    confirmation: {
      status: "current", stale_reasons: [], confirmed_at: "2026-10-08T09:20:00Z", confirmed_count: 1, excluded_count: 1,
      items: {
        requirements: [{ text: "Quotes within one day", source: "transcript", status: "confirmed" }], challenges: [], priorities: [],
        opportunities: [], discussed_solutions: [], decisions: [{ text: "Run a pilot", source: "personal_notes", status: "excluded" }], follow_ups: [],
      },
    },
    readiness: { ready_for_v2: true, blockers: [] },
  });
  assert.deepEqual(excludedFromConfirmation(confirmed).decisions, ["Run a pilot"]);
  assert.deepEqual(excludedFromConfirmation(confirmed).requirements, []);
  assert.equal(reviewHeadline(confirmed), "Ready for Master Presentation V2");
  // An out-of-date confirmation still offers its exclusions, but only for findings that still exist.
  const outdated = { ...confirmed, confirmation: { ...confirmed.confirmation, status: "stale" as const, stale_reasons: ["USE_CASES_CHANGED"] } };
  assert.deepEqual(excludedFromConfirmation(outdated).decisions, ["Run a pilot"]);
  const reanalysed = { ...outdated, extraction: { ...outdated.extraction, categories: { ...outdated.extraction.categories, decisions: [] } } };
  assert.deepEqual(excludedFromConfirmation(reanalysed).decisions, []);
  assert.equal(reviewHeadline({ ...confirmed, confirmation: { ...confirmed.confirmation, status: "stale" }, readiness: { ready_for_v2: false, blockers: ["MEETING_REVIEW_STALE"] } }), "Confirmation is out of date");
  assert.equal(FINDING_SOURCE_LABEL.personal_notes, "Personal notes");
});

test("confirmation sends the reviewed analysis identity and refuses a stale one before any request", async () => {
  const original = globalThis.fetch;
  const requests: { url: string; method: string; body: unknown }[] = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
    return Response.json(review({ readiness: { ready_for_v2: true, blockers: [] } }));
  };
  try {
    const stale = review();
    stale.extraction = { ...stale.extraction, status: "stale", stale_reasons: ["NOTES_CHANGED"] };
    await assert.rejects(confirmMeetingReview("token", opportunityId, stale, {}), /Analyse the meeting again/);
    assert.equal(requests.length, 0);
    const result = await confirmMeetingReview("token", opportunityId, review(), { decisions: ["Run a pilot"], requirements: [] });
    assert.equal(result.readiness.ready_for_v2, true);
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, new RegExp(`/opportunities/${opportunityId}/post-meeting-review/confirm$`));
    assert.equal(requests[0].method, "POST");
    assert.deepEqual(requests[0].body, {
      transcript_id: "transcript-1", extraction_generated_at: "2026-10-08T09:10:00Z",
      review_fingerprint: "a".repeat(64), excluded: { decisions: ["Run a pilot"] },
    });
    // A source changed between loading and confirming: the API answers 409 and nothing is treated as confirmed.
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: "MEETING_REVIEW_STALE", message: "A source of this review changed after it was opened." } }), { status: 409 });
    const refused = await confirmMeetingReview("token", opportunityId, review(), {}).then(() => null, (error: unknown) => error);
    assert.equal(isStaleReviewError(refused), true);
    assert.match(String((refused as Error).message), /changed after it was opened/);
    assert.equal(isStaleReviewError(new Error("network")), false);
    const panel = readFileSync(new URL("../components/MeetingEvidencePanel.tsx", import.meta.url), "utf8");
    assert.match(panel, /if \(!isStaleReviewError\(cause\)\) throw cause;\s+\/\/ Nothing was confirmed[^\n]*\s+await refresh\(token, signal\);/, "a refused confirmation reloads the review");
    assert.match(panel, /nothing was confirmed/);
  } finally { globalThis.fetch = original; }
});

test("notes are saved only when nobody else changed them, and a failed load is an error, not an empty review", async () => {
  const original = globalThis.fetch;
  let stored: PersonalNotes = { text: "Owner observation", updated_at: "2026-10-08T09:05:00Z" };
  const writes: string[] = [];
  globalThis.fetch = async (input, init) => {
    if ((init?.method ?? "GET") === "PUT") {
      const text = (JSON.parse(String(init!.body)) as { text: string }).text.trim();
      writes.push(text);
      stored = { text: text || null, updated_at: "2026-10-08T09:30:00Z" };
    }
    return Response.json(stored);
  };
  try {
    const baseline = { ...stored };
    const saved = await savePersonalNotesChecked("token", opportunityId, "  Updated observation  ", baseline);
    assert.deepEqual(saved, { text: "Updated observation", updated_at: "2026-10-08T09:30:00Z" });
    assert.deepEqual(writes, ["Updated observation"]);
    // The baseline is now out of date: another session (here: the save above) changed the notes.
    await assert.rejects(savePersonalNotesChecked("token", opportunityId, "My other text", baseline), MeetingNotesConflict);
    assert.deepEqual(writes, ["Updated observation"], "a conflicting save writes nothing");
    await assert.rejects(savePersonalNotesChecked("token", opportunityId, "x".repeat(20001), saved), /20,000/);
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: "INTERNAL", message: "Database unavailable" } }), { status: 500 });
    await assert.rejects(loadPostMeetingReview("token", opportunityId), /Database unavailable|failed|500/i);
  } finally { globalThis.fetch = original; }
});
