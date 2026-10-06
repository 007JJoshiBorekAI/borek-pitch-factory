import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import { completeFirstMeetingAndGetRoute } from "./firstMeetingHandoff";
import type { PostMeetingWorkflow } from "./postMeeting";

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
    await assert.rejects(completeFirstMeetingAndGetRoute("token", id), /PPT #1 must be ready/);
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
  assert.match(shell, /live && accessGranted \? children/);
  assert.doesNotMatch(meeting, /markFirstMeetingCompleted|workflow\/first-meeting-completed/);
});
