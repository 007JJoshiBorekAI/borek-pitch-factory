import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import { completeFirstMeetingAndGetRoute } from "./firstMeetingHandoff";
import type { PostMeetingWorkflow } from "./postMeeting";
import { canCompletePreviewMeeting, completePreviewMeetingAndGetRoute, previewMeetingStorageKey, readPreviewMeetingCompletion } from "./previewMeeting";
import { createDiscoveryWorkspaceFixture } from "./discoveryWorkspace";
import { previewClientRecord, type PreviewOpportunity } from "./previewJourney";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
function workflow(completed = false, ppt1Ready = true): PostMeetingWorkflow {
  return {
    opportunity_id: id, current_status: completed ? "transcript_added" : "first_meeting_completed",
    steps: [{ key: "ppt1_ready", state: ppt1Ready ? "completed" : "current" }, { key: "first_meeting_completed", state: completed ? "completed" : "current" }],
    documents: { ppt1: ppt1Ready ? { presentation_id: "ppt1", latest_ready_version_id: "ppt1-v1", journey_stage: "first_contact", status: "ready" } : null, ppt2: null, approved_discovery: null },
    finalization: null,
  };
}

test("confirmed completion posts once and lands on meeting input, never follow-up or PPT2", async () => {
  const requests: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push(`${init?.method ?? "GET"} ${url.pathname}`);
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer token");
    return Response.json(workflow(init?.method === "POST"));
  };
  const target = await completeFirstMeetingAndGetRoute("token", id);
  assert.equal(target, `/opportunities/${id}/meeting`);
  assert.deepEqual(requests, [`GET /opportunities/${id}/workflow-status`, `POST /opportunities/${id}/workflow/first-meeting-completed`]);
});

test("an already completed checkpoint resumes meeting inputs without another write", async () => {
  let requests = 0;
  globalThis.fetch = async (_input, init) => {
    requests++;
    assert.equal(init?.method ?? "GET", "GET");
    return Response.json(workflow(true));
  };
  assert.equal(await completeFirstMeetingAndGetRoute("token", id), `/opportunities/${id}/meeting`);
  assert.equal(requests, 1);
});

test("a current-status label or client-side ready state cannot bypass server PPT1 readiness", async () => {
  for (const status of [workflow(false, false), { ...workflow(), documents: { ...workflow().documents, ppt1: null } }]) {
    globalThis.fetch = async (_input, init) => {
      assert.equal(init?.method ?? "GET", "GET", "no milestone write when the prerequisite is missing");
      return Response.json(status);
    };
    await assert.rejects(completeFirstMeetingAndGetRoute("token", id), /Master Presentation V1 must be ready/);
  }
});

test("incomplete or foreign completion responses cannot unlock post-meeting", async () => {
  for (const response of [workflow(false), { ...workflow(true), opportunity_id: "another-opportunity" }, { opportunity_id: id, current_status: "transcript_added" }]) {
    globalThis.fetch = async (_input, init) => Response.json(init?.method === "POST" ? response : workflow());
    await assert.rejects(completeFirstMeetingAndGetRoute("token", id), /not confirmed/);
  }
});

test("backend failures leave navigation blocked and support a later successful retry", async () => {
  let failure = true;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === "POST" && failure) return Response.json({ error: { code: "CONFLICT", message: "Meeting checkpoint could not be saved" } }, { status: 409 });
    return Response.json(workflow(init?.method === "POST"));
  };
  await assert.rejects(completeFirstMeetingAndGetRoute("token", id), /could not be saved/);
  failure = false;
  assert.equal(await completeFirstMeetingAndGetRoute("token", id), `/opportunities/${id}/meeting`);
});

test("cancellation after loading status prevents the completion mutation", async () => {
  const controller = new AbortController();
  let requests = 0;
  globalThis.fetch = async (_input, init) => {
    requests++;
    assert.equal(init?.signal, controller.signal);
    controller.abort();
    return Response.json(workflow());
  };
  await assert.rejects(completeFirstMeetingAndGetRoute("token", id, controller.signal), { name: "AbortError" });
  assert.equal(requests, 1);
});

test("pre-meeting handoff asks for confirmation and direct post-meeting pages are gated", () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  const presentation = source("../components/PresentationWorkspace.tsx");
  const handoff = source("../components/FirstMeetingHandoff.tsx");
  const shell = source("../components/PostMeetingShell.tsx");
  const meeting = source("../components/MeetingEvidencePanel.tsx");
  assert.match(presentation, /<FirstMeetingHandoff opportunityId=\{opportunityId\} ppt1Ready=\{liveReady\}/);
  assert.match(handoff, /Has the first client meeting taken place\?/);
  assert.match(handoff, /!ready \|\| !confirming/);
  assert.match(handoff, /operation.current = controller/);
  assert.match(handoff, /const route = await completeFirstMeetingAndGetRoute/);
  assert.match(handoff, /!controller.signal.aborted\) router.push\(route\)/);
  assert.match(shell, /setAccessGranted\(workflowCompleted\(value, "first_meeting_completed"\)\)/);
  assert.match(shell, /const canView = previewMode \? preview.enabled && preview.completed : live && accessGranted/);
  assert.match(shell, /canView \? children/);
  assert.doesNotMatch(meeting, /markFirstMeetingCompleted|workflow\/first-meeting-completed/);
});

function previewOpportunity(): PreviewOpportunity {
  const discovery = { ...createDiscoveryWorkspaceFixture("opp-preview", Array(7).fill("ready")), document_state: "approved" as const };
  return {
    opportunity_id: "opp-preview", created_at: "2026-10-06", updated_at: "2026-10-06",
    client: previewClientRecord("opp-preview", { company_name: "Preview client", contact_person: "", website_url: "", meeting_purpose: "Preview", additional_information: "" }),
    discovery, approved_discovery: discovery,
    presentation: { state: "ready", version_id: "ppt-1-v1", source_discovery_version_id: discovery.version_id, slide_count: 7 },
    workflow: { revision: 1, current_status: "ppt_1_ready", completed_statuses: ["ppt_1_ready"], blocked_reason: null, available_actions: [] },
  };
}

function localStore() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

test("ready preview pitch can confirm locally, reload, and land on meeting inputs without API calls", () => {
  globalThis.fetch = async () => { throw new Error("Preview must not call the API"); };
  const storage = localStore();
  const opportunity = previewOpportunity();
  const original = structuredClone(opportunity);
  assert.equal(canCompletePreviewMeeting(opportunity), true);
  assert.equal(readPreviewMeetingCompletion(storage, "owner-a", "opp-preview", true), false);
  assert.equal(completePreviewMeetingAndGetRoute(storage, "owner-a", opportunity, true), "/opportunities/opp-preview/meeting");
  assert.equal(readPreviewMeetingCompletion(storage, "owner-a", "opp-preview", true), true);
  assert.deepEqual(opportunity, original, "do not alter the Clients directory, PPT1, or authoritative workflow");
  assert.equal(completePreviewMeetingAndGetRoute(storage, "owner-a", opportunity, true), "/opportunities/opp-preview/meeting");
});

test("local completion is isolated by owner, opportunity and preview mode", () => {
  const storage = localStore();
  completePreviewMeetingAndGetRoute(storage, "owner-a", previewOpportunity(), true);
  assert.equal(readPreviewMeetingCompletion(storage, "owner-b", "opp-preview", true), false);
  assert.equal(readPreviewMeetingCompletion(storage, "owner-a", "opp-other", true), false);
  assert.equal(readPreviewMeetingCompletion(storage, "owner-a", "opp-preview", false), false);
  assert.equal(readPreviewMeetingCompletion(storage, null, "opp-preview", true), false);
  assert.notEqual(previewMeetingStorageKey("a:b", "c"), previewMeetingStorageKey("a", "b:c"));
});

test("preview confirmation remains gated on all seven ready slides and an approved source", () => {
  const opportunity = previewOpportunity();
  for (const state of ["waiting", "generating", "failed"] as const) {
    const incomplete = { ...opportunity, presentation: { ...opportunity.presentation, state } };
    assert.equal(canCompletePreviewMeeting(incomplete), false);
    assert.throws(() => completePreviewMeetingAndGetRoute(localStore(), "owner-a", incomplete, true), /Finish all seven/);
  }
  assert.equal(canCompletePreviewMeeting({ ...opportunity, presentation: { ...opportunity.presentation, slide_count: 6 } }), false);
  assert.equal(canCompletePreviewMeeting({ ...opportunity, approved_discovery: null }), false);
  assert.equal(canCompletePreviewMeeting(null), false);
});

test("live or signed-out contexts cannot write preview completion", () => {
  const storage = localStore();
  const opportunity = previewOpportunity();
  assert.throws(() => completePreviewMeetingAndGetRoute(storage, "owner-a", opportunity, false), /only for a preview pitch/);
  assert.throws(() => completePreviewMeetingAndGetRoute(storage, null, opportunity, true), /only for a preview pitch/);
  assert.throws(() => completePreviewMeetingAndGetRoute(storage, "owner-a", null, true), /only for a preview pitch/);
  assert.equal(readPreviewMeetingCompletion(storage, "owner-a", "opp-preview", true), false);
});

test("storage failures do not produce a successful preview handoff", () => {
  assert.throws(() => completePreviewMeetingAndGetRoute({ getItem: () => null, setItem: () => { throw new Error("Storage blocked"); } }, "owner-a", previewOpportunity(), true), /Storage blocked/);
  assert.throws(() => completePreviewMeetingAndGetRoute({ getItem: () => null, setItem: () => {} }, "owner-a", previewOpportunity(), true), /could not be saved/);
});

test("preview button uses fixture readiness rather than the live-only PPT1 flag", () => {
  const handoff = readFileSync(new URL("../components/FirstMeetingHandoff.tsx", import.meta.url), "utf8");
  const hook = readFileSync(new URL("../components/usePreviewMeeting.ts", import.meta.url), "utf8");
  assert.match(handoff, /const ready = previewMode \? preview.ready : ppt1Ready/);
  assert.match(handoff, /const available = previewMode \? preview.enabled : live/);
  assert.match(handoff, /router.push\(preview.complete\(\)\)/);
  assert.match(handoff, /Confirm preview and continue/);
  assert.match(hook, /isLocalUiPreviewAvailable\(\)/);
  assert.doesNotMatch(hook, /apiFetch|registerLiveOpportunity|updateClient/);
});
