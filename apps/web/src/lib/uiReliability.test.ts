import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { ApiRequestError, canonicalOpportunityPath, previewAliasForBackendId, waitForJob } from "./api";
import { awaitRunningMasterV2, type MasterV2Status } from "./masterPresentationV2";
import { reviewHeadline, type PostMeetingReview } from "./postMeeting";
import { resumeFirstPitch } from "./ppt1Generation";

/** Reload, coming back to a page, shareable links and labels: the fixes after the browser E2E audit. */

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const presentation = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const version = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

type Call = { method: string; path: string };
async function withApi<T>(handler: (call: Call, calls: Call[]) => unknown, run: () => Promise<T>) {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = async (input, init) => {
    const call = { method: init?.method ?? "GET", path: new URL(String(input)).pathname + new URL(String(input)).search };
    calls.push(call);
    const value = handler(call, calls);
    if (value instanceof Response) return value;
    return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try { return { result: await run(), calls }; } finally { globalThis.fetch = original; }
}

const v2 = (state: MasterV2Status["state"], job: MasterV2Status["job"] = null): MasterV2Status => ({
  opportunity_id: id, product_version: "V2", presentation_id: presentation, state, can_generate: state !== "generating" && state !== "ready",
  ready_for_v2: true, blockers: [], finalized: false,
  latest_ready: state === "ready" ? { presentation_version_id: version, version_number: 2, generation_fingerprint: "f".repeat(64) } : null, job,
});
const job = (status: string, stage = status) => ({ job_id: "job-1", job_type: "presentation_generation", status, current_stage: stage, result: {}, error: status === "FAILED" ? { code: "RENDER_FAILED", message: "Rendering failed.", stage: "PPTX_RENDERING", retryable: true } : null });

test("V2: a generation running when the page opens is followed to ready without starting another one", async () => {
  let polls = 0;
  const stages: string[] = [];
  const { result, calls } = await withApi((call) => {
    if (call.path === "/jobs/job-1") { polls += 1; return polls < 3 ? job("RUNNING", "PPTX_RENDERING") : job("COMPLETED"); }
    if (call.path.endsWith("/master-presentation/v2")) return v2("ready");
    return assert.fail(`unexpected request ${call.method} ${call.path}`);
  }, () => awaitRunningMasterV2("token", id, v2("generating", { job_id: "job-1", status: "RUNNING", error_code: null }), (current) => stages.push(current.current_stage), undefined, 1));
  assert.equal(result.state, "ready");
  assert.equal(result.latest_ready?.version_number, 2);
  assert.deepEqual(stages, ["PPTX_RENDERING", "PPTX_RENDERING", "COMPLETED"], "the stages are shown while it runs");
  assert.equal(calls.every((call) => call.method === "GET"), true, "reads only: reopening the page never requests a generation");
  assert.equal(calls.some((call) => call.path.endsWith("/generate")), false);
});

test("V2: a generation that fails while being followed ends in the failed state, ready for a retry", async () => {
  const failed = v2("failed", { job_id: "job-1", status: "FAILED", error_code: "RENDER_FAILED", error_message: "Rendering failed." });
  const { result, calls } = await withApi((call) => call.path === "/jobs/job-1" ? job("FAILED") : failed,
    () => awaitRunningMasterV2("token", id, v2("generating", { job_id: "job-1", status: "RUNNING", error_code: null }), undefined, undefined, 1));
  assert.equal(result.state, "failed");
  assert.equal(result.can_generate, true, "the generate action is offered again");
  assert.equal(result.job?.error_message, "Rendering failed.");
  assert.equal(calls.every((call) => call.method === "GET"), true);
});

test("V2: without a job id the status is polled; a final state needs no request; leaving the page stops it", async () => {
  let reads = 0;
  const polled = await withApi(() => { reads += 1; return reads < 3 ? v2("generating") : v2("ready"); },
    () => awaitRunningMasterV2("token", id, v2("generating"), undefined, undefined, 1));
  assert.equal(polled.result.state, "ready");
  assert.equal(polled.calls.length, 3);

  for (const state of ["ready", "failed", "none", "outdated"] as const) {
    const settled = await withApi(() => assert.fail("a final state is not polled"), () => awaitRunningMasterV2("token", id, v2(state)));
    assert.equal(settled.result.state, state);
    assert.equal(settled.calls.length, 0);
  }

  const controller = new AbortController();
  let seen = 0;
  await assert.rejects(withApi(() => { seen += 1; if (seen === 2) controller.abort(); return job("RUNNING"); },
    () => awaitRunningMasterV2("token", id, v2("generating", { job_id: "job-1", status: "RUNNING", error_code: null }), undefined, controller.signal, 1)));
  const afterAbort = seen;
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(seen, afterAbort, "no request after the page is gone");
});

test("waitForJob stops when its signal is aborted", async () => {
  const controller = new AbortController();
  let polls = 0;
  await assert.rejects(withApi(() => { polls += 1; if (polls === 2) controller.abort(); return job("RUNNING"); },
    () => waitForJob("token", "job-1", { pollIntervalMs: 1, signal: controller.signal })));
  assert.equal(polls, 2);
  const done = await withApi(() => job("COMPLETED"), () => waitForJob("token", "job-1", { pollIntervalMs: 1 }));
  assert.equal(done.result.status, "COMPLETED", "without a signal it works as before");
});

const workflow = (status: string, ready: string | null) => ({ opportunity_id: id, steps: [], documents: { ppt1: { presentation_id: presentation, latest_ready_version_id: ready, journey_stage: "first_contact", status, product_version: "V1" }, ppt2: null, approved_discovery: null } });
const stage1 = (status: string, code: string | null = null) => ({ outputs: { presentation: { status, presentation_id: presentation, code } } });

test("V1: a generation running when the page opens is followed to ready without starting another one", async () => {
  let polls = 0;
  const { result, calls } = await withApi((call) => {
    if (call.path.includes("/jobs/active")) return polls === 0 ? { job_id: "job-1", status: "RUNNING" } : { job_id: "job-1", status: "COMPLETED" };
    if (call.path === "/jobs/job-1") { polls += 1; return polls < 2 ? job("RUNNING", "PPTX_RENDERING") : job("COMPLETED"); }
    if (call.path.endsWith("/stage1-outputs")) return stage1("ready");
    if (call.path.endsWith("/workflow-status")) return workflow("ready", version);
    return assert.fail(`unexpected request ${call.method} ${call.path}`);
  }, () => resumeFirstPitch("token", id, undefined, undefined, 1));
  assert.deepEqual(result, { presentationId: presentation, presentationVersionId: version, jobId: "job-1" });
  assert.equal(calls.every((call) => call.method === "GET"), true, "reads only");
  assert.equal(calls.some((call) => /generate|regenerate/.test(call.path)), false);
});

test("V1: nothing running resolves with null, a failed generation is reported, and a status without a job is polled", async () => {
  const idle = await withApi((call) => call.path.includes("/jobs/active") ? new Response("{}", { status: 404 }) : call.path.endsWith("/stage1-outputs") ? stage1("unfrozen") : workflow("missing", null),
    () => resumeFirstPitch("token", id, undefined, undefined, 1));
  assert.equal(idle.result, null);

  await assert.rejects(withApi((call) => call.path.includes("/jobs/active") ? new Response("{}", { status: 404 }) : call.path.endsWith("/stage1-outputs") ? stage1("failed", "PRESENTATION_GENERATION_FAILED") : workflow("failed", null),
    () => resumeFirstPitch("token", id, undefined, undefined, 1)), (error) => {
    assert.ok(error instanceof ApiRequestError);
    assert.match(error.message, /Master Presentation V1 generation failed: PRESENTATION_GENERATION_FAILED/);
    return true;
  });

  let reads = 0;
  const polled = await withApi((call) => {
    if (call.path.includes("/jobs/active")) return new Response("{}", { status: 404 });
    if (call.path.endsWith("/stage1-outputs")) return stage1(reads < 2 ? "generating" : "ready");
    reads += 1;
    return reads < 3 ? workflow("generating", null) : workflow("ready", version);
  }, () => resumeFirstPitch("token", id, undefined, undefined, 1));
  assert.equal(polled.result?.presentationVersionId, version);
});

test("the pages follow a running generation on mount, stop on unmount, and never post twice", () => {
  const meeting = read("../components/MeetingEvidencePanel.tsx");
  assert.ok(meeting.includes('if (!live || !accessToken || !v2 || v2.state !== "generating" || operation.current) return;'), "the generation started on this page is followed by generateV2 itself");
  assert.ok(meeting.includes("void awaitRunningMasterV2(accessToken, opportunityId, v2, (job) => setV2Stage(job.current_stage), controller.signal)"));
  assert.ok(meeting.includes("return () => controller.abort();"));
  assert.ok(meeting.includes("}, [accessToken, live, opportunityId, v2?.state, v2JobId]);"));
  assert.ok(meeting.includes('else if (final.state === "failed") setV2Error('), "a failure is shown, with the generate action offered again by the status");
  assert.ok(meeting.includes("const editingDisabled = Boolean(busy) || v2Running || finalized"), "the inputs are locked while the server generates");
  assert.equal(meeting.match(/generateAndAwaitMasterV2\(/g)?.length, 1, "one place starts a V2 generation: the button");

  const workspace = read("../components/PresentationWorkspace.tsx");
  assert.ok(workspace.includes('const running = !result.loadError && !result.deck && (result.status === "queued" || result.status === "generating");'));
  assert.ok(workspace.includes("void resumeFirstPitch(accessToken, opportunityId, undefined, controller.signal)"));
  assert.ok(workspace.includes('if (!accessToken || livePhase === "generating") return;'), "no second request while one is followed");
  assert.equal(workspace.match(/generateAndAwaitFirstPitch\(/g)?.length, 1);
});

test("an address with a local preview id is replaced by the backend id; unknown ids and UUIDs stay", () => {
  const alias = "opp-facebook-browser-e2e-08061404";
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalSession = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: () => JSON.stringify({ [alias]: id }), setItem: () => assert.fail("reading a link never writes the mapping") } } });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem: (key: string) => key === "borek.authUserId" ? "owner-1" : null } });
  try {
    assert.equal(canonicalOpportunityPath(`/opportunities/${alias}/follow-up`, alias), `/opportunities/${id}/follow-up`);
    assert.equal(canonicalOpportunityPath(`/opportunities/${alias}`, alias), `/opportunities/${id}`);
    assert.equal(canonicalOpportunityPath(`/opportunities/${alias}/post-meeting-presentation`, alias), `/opportunities/${id}/post-meeting-presentation`);
    assert.equal(canonicalOpportunityPath(`/opportunities/${id}/follow-up`, id), null, "already canonical");
    assert.equal(canonicalOpportunityPath("/opportunities/opp-not-on-the-server/discovery", "opp-not-on-the-server"), null, "nothing on the server yet: the local id stays");
    assert.equal(canonicalOpportunityPath(`/opportunities/${alias}-other/discovery`, alias), null, "another opportunity's path is not rewritten");
    assert.equal(canonicalOpportunityPath("/opportunities/new/client-information", "new"), null);
    assert.equal(previewAliasForBackendId(id), alias);
    assert.equal(previewAliasForBackendId(presentation), null);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
    if (originalSession) Object.defineProperty(globalThis, "sessionStorage", originalSession); else Reflect.deleteProperty(globalThis, "sessionStorage");
  }
  const boundary = read("../components/OpportunityBoundary.tsx");
  assert.ok(boundary.includes("canonicalRef.current = canonicalOpportunityPath(pathname, opportunityId);"));
  assert.ok(boundary.includes("router.replace(`${canonicalRef.current}${window.location.search}`);"));
  assert.ok(boundary.includes("}, [pathname, loading, hydrated, router]);"), "on opening or navigating to a page, never while staying on one");
  assert.ok(boundary.includes("void loadLiveOpportunity(accessToken, opportunityId, backendId, controller.signal)"), "the opportunity is still loaded with the signed-in user's token");
  assert.ok(boundary.includes('"This opportunity was not found or is not available to your account."'), "another account still cannot open it");
});

test("the pre-meeting workspace speaks of Master Presentation V1; a deck from before it keeps its name", () => {
  const workspace = read("../components/PresentationWorkspace.tsx");
  assert.ok(workspace.includes('const product = liveDeck && !liveDeck.source ? "PPT #1" : "Master Presentation V1";'));
  for (const text of ["`Generate ${product}`", "`${product} ready for review`", "`Generating ${product}`", "`${product} generation failed`", "`Retry ${product} generation`", "Pre-meeting presentation · {product}"]) {
    assert.ok(workspace.includes(text), text);
  }
  assert.equal(workspace.match(/PPT #1/g)?.length, 1, "only the name of an earlier deck");
  assert.ok(workspace.includes("anchor.download = `${fileStem}-revision-${liveDeck.versionNumber}-${opportunityId}.${format}`;"));
  assert.ok(workspace.includes('const fileStem = liveDeck && !liveDeck.source ? "ppt-1" : "master-presentation-v1";'));
  assert.ok(read("../components/PostMeetingPresentationWorkspace.tsx").includes("`master-presentation-v2-revision-${deck.versionNumber}-${opportunityId}.${format}`"));
  assert.ok(read("../components/FirstMeetingHandoff.tsx").includes("Generate Master Presentation V1 before confirming the first meeting."));
  assert.doesNotMatch(read("./ppt1Generation.ts"), /"PPT #1|`PPT #1/);
});

test("the owner checkpoint names documents and versions; the ids stay for requests and traceability", () => {
  const checkpoint = read("../components/OwnerCheckpointPanel.tsx");
  assert.ok(checkpoint.includes('<p data-testid="checkpoint-presentation" title={version ? `Version id ${version}` : undefined}><strong>{product}</strong> · {deckLabel}</p>'));
  assert.ok(checkpoint.includes("{discovery ? `approved version ${discovery.version_number}` : \"not approved\"}"));
  assert.ok(checkpoint.includes("`revision ${revision.number}, ready`"));
  assert.doesNotMatch(checkpoint, /\{product\}: \{version|Discovery: \{workflow/, "no raw id as the visible text");
  assert.ok(checkpoint.includes("const identity = version ? `${ppt2?.presentation_id}:${version}:${workflow?.documents.approved_discovery?.version_id}` : null;"), "the review is still bound to the exact ids");
});

test("status wording follows what exists", () => {
  const review = { finalized: false, readiness: { ready_for_v2: true }, confirmation: { status: "current" }, extraction: { status: "current" }, transcripts: [{}] } as unknown as PostMeetingReview;
  assert.equal(reviewHeadline(review), "Ready for Master Presentation V2");
  assert.equal(reviewHeadline(review, "none"), "Ready for Master Presentation V2");
  assert.equal(reviewHeadline(review, "failed"), "Ready for Master Presentation V2");
  assert.equal(reviewHeadline(review, "generating"), "Generating Master Presentation V2");
  assert.equal(reviewHeadline(review, "ready"), "Master Presentation V2 is ready");
  assert.equal(reviewHeadline(review, "outdated"), "Master Presentation V2 needs a new revision");
  assert.equal(reviewHeadline({ ...review, finalized: true } as PostMeetingReview, "ready"), "Package finalized");
  assert.equal(reviewHeadline({ ...review, readiness: { ready_for_v2: false } } as unknown as PostMeetingReview, "ready"), "Review the findings");
  assert.ok(read("../components/MeetingEvidencePanel.tsx").includes("reviewHeadline(review, v2?.state)"));
  assert.ok(read("../components/MeetingEvidencePanel.tsx").includes('{review.confirmation.confirmed_count === 1 ? "finding" : "findings"} included'));
  assert.ok(read("../components/FollowUpDraftPanel.tsx").includes('excluded ${draft.source.excludedFindings === 1 ? "finding is" : "findings are"} not used'));
});
