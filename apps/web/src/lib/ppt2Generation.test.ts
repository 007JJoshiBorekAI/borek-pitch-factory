import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { regeneratePpt2 } from "./api.js";
import { generateAndAwaitPostMeetingPresentation } from "./ppt2Generation.js";

const TOKEN = "test-token";
const OPPORTUNITY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRESENTATION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const VERSION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const JOB_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const originalFetch = globalThis.fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("post-meeting generation calls ppt2/generate and polls the job until the workflow version is ready", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url}`);
    if (url.includes(`/opportunities/${OPPORTUNITY_ID}/workflow-status`) && calls.filter((call) => call.includes("workflow-status")).length === 1) {
      return jsonResponse(200, { documents: { ppt1: null, ppt2: null } });
    }
    if (url.includes(`/opportunities/${OPPORTUNITY_ID}/ppt2/generate`) && method === "POST") {
      return jsonResponse(200, {
        job_id: JOB_ID,
        status: "QUEUED",
        presentation_id: PRESENTATION_ID,
        presentation_version_id: null,
        journey_stage: "post_meeting",
        is_existing_job: false,
      });
    }
    if (url.includes(`/jobs/${JOB_ID}`) && method === "GET") {
      return jsonResponse(200, {
        job_id: JOB_ID,
        job_type: "presentation_generation",
        status: "COMPLETED",
        current_stage: "PREVIEW_RENDERING",
        created_at: "2026-06-01T00:00:00Z",
        started_at: "2026-06-01T00:00:01Z",
        completed_at: "2026-06-01T00:00:02Z",
        result: { presentation_id: PRESENTATION_ID, presentation_version_id: VERSION_ID },
        error: null,
      });
    }
    if (url.includes(`/opportunities/${OPPORTUNITY_ID}/workflow-status`)) {
      return jsonResponse(200, {
        documents: {
          ppt1: null,
          ppt2: {
            presentation_id: PRESENTATION_ID,
            latest_ready_version_id: VERSION_ID,
            journey_stage: "post_meeting",
            status: "ready",
          },
        },
      });
    }
    return jsonResponse(404, { error: { code: "NOT_FOUND", message: url } });
  }) as typeof fetch;

  try {
    const seen: string[] = [];
    const result = await generateAndAwaitPostMeetingPresentation(TOKEN, OPPORTUNITY_ID, (job) => {
      seen.push(job.status);
    });
    assert.equal(result.presentationId, PRESENTATION_ID);
    assert.equal(result.presentationVersionId, VERSION_ID);
    assert.equal(result.jobId, JOB_ID);
    assert.deepEqual(seen, ["COMPLETED"]);
    assert.equal(calls.filter((call) => call.includes("/ppt2/generate")).length, 1);
    assert.ok(calls.some((call) => call.includes(`/jobs/${JOB_ID}`)));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a ready workflow PPT #2 is reused without another generate", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/workflow-status")) {
      return jsonResponse(200, {
        documents: {
          ppt2: {
            presentation_id: PRESENTATION_ID,
            latest_ready_version_id: VERSION_ID,
            journey_stage: "post_meeting",
            status: "ready",
          },
        },
      });
    }
    return jsonResponse(500, { error: { code: "UNEXPECTED", message: url } });
  }) as typeof fetch;

  try {
    const result = await generateAndAwaitPostMeetingPresentation(TOKEN, OPPORTUNITY_ID);
    assert.equal(result.presentationId, PRESENTATION_ID);
    assert.equal(result.presentationVersionId, VERSION_ID);
    assert.equal(result.jobId, null);
    assert.equal(calls.some((call) => call.includes("/ppt2/generate")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("regenerate posts to the same presentation id", async () => {
  let posted = "";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    posted = `${init?.method ?? "GET"} ${String(input)}`;
    return jsonResponse(200, {
      job_id: JOB_ID,
      status: "COMPLETED",
      presentation_id: PRESENTATION_ID,
      presentation_version_id: VERSION_ID,
      journey_stage: "post_meeting",
    });
  }) as typeof fetch;

  try {
    const response = await regeneratePpt2(TOKEN, OPPORTUNITY_ID, PRESENTATION_ID);
    assert.equal(response.presentation_id, PRESENTATION_ID);
    assert.match(posted, new RegExp(`POST .*/opportunities/${OPPORTUNITY_ID}/ppt2/${PRESENTATION_ID}/regenerate$`));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("owner post-meeting generation is wired to the dedicated endpoint and the stage selector stays unchanged", () => {
  const meeting = readFileSync(
    fileURLToPath(new URL("../components/MeetingEvidencePanel.tsx", import.meta.url)),
    "utf8",
  );
  const presentations = readFileSync(
    fileURLToPath(new URL("../components/PresentationWorkspace.tsx", import.meta.url)),
    "utf8",
  );
  const catalog = readFileSync(
    fileURLToPath(new URL("./discoveryFirst.ts", import.meta.url)),
    "utf8",
  );
  assert.match(meeting, /generateAndAwaitPostMeetingPresentation/);
  assert.match(meeting, /regeneratePresentationId/);
  assert.doesNotMatch(meeting, /runStage2SlidePrepare/);
  assert.doesNotMatch(presentations, /ppt2\/generate/);
  assert.doesNotMatch(catalog, /post_meeting/);
  assert.doesNotMatch(catalog, /concretisation/);
});

test("regeneration waits for a new server-confirmed PPT2 version and preserves PPT1 identity", async () => {
  const original = globalThis.fetch;
  const previousVersion = "previous-ppt2-version";
  const ppt1 = { presentation_id: "ppt1", latest_ready_version_id: "ppt1-version", journey_stage: "first_contact", status: "ready" };
  const calls: string[] = [];
  let workflowReads = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.endsWith("/workflow-status")) return jsonResponse(200, { documents: { ppt1, ppt2: { presentation_id: PRESENTATION_ID, latest_ready_version_id: ++workflowReads === 1 ? previousVersion : VERSION_ID, journey_stage: "post_meeting", status: "ready" } } });
    if (url.endsWith(`/ppt2/${PRESENTATION_ID}/regenerate`)) return jsonResponse(200, { presentation_id: PRESENTATION_ID, presentation_version_id: VERSION_ID, job_id: JOB_ID, status: "COMPLETED", journey_stage: "post_meeting" });
    if (url.endsWith(`/jobs/${JOB_ID}`)) return jsonResponse(200, { status: "COMPLETED", result: { presentation_version_id: VERSION_ID } });
    throw new Error(`Unexpected request ${url}`);
  };
  try {
    const result = await generateAndAwaitPostMeetingPresentation(TOKEN, OPPORTUNITY_ID, undefined, { regeneratePresentationId: PRESENTATION_ID });
    assert.equal(result.presentationVersionId, VERSION_ID);
    assert.equal(workflowReads, 2);
    assert.equal(calls.filter((call) => call.startsWith("POST ")).length, 1);
    assert.ok(calls.some((call) => call.endsWith(`/ppt2/${PRESENTATION_ID}/regenerate`)));
  } finally { globalThis.fetch = original; }
});

test("generation cannot report an old, unconfirmed or cross-family version as ready", async () => {
  const original = globalThis.fetch;
  try {
    for (const failure of ["old-version", "missing-confirmation", "ppt1-changed", "unfinished-job"]) {
      let reads = 0;
      const ppt1 = { presentation_id: "ppt1", latest_ready_version_id: "ppt1-v1" };
      globalThis.fetch = async (input) => {
        const url = String(input);
        if (url.endsWith("/workflow-status")) {
          const first = ++reads === 1;
          return jsonResponse(200, { documents: { ppt1: failure === "ppt1-changed" && !first ? { ...ppt1, latest_ready_version_id: "ppt1-v2" } : ppt1, ppt2: !first && failure === "missing-confirmation" ? null : { presentation_id: PRESENTATION_ID, latest_ready_version_id: first || failure === "old-version" ? "old-version" : VERSION_ID } } });
        }
        if (url.includes("/regenerate")) return jsonResponse(200, { presentation_id: PRESENTATION_ID, presentation_version_id: VERSION_ID, job_id: JOB_ID, status: "COMPLETED", journey_stage: "post_meeting" });
        if (url.includes("/jobs/")) return jsonResponse(200, { status: failure === "unfinished-job" ? "RUNNING" : "COMPLETED", result: { presentation_version_id: VERSION_ID } });
        throw new Error(`Unexpected request ${url}`);
      };
      await assert.rejects(generateAndAwaitPostMeetingPresentation(TOKEN, OPPORTUNITY_ID, undefined, { regeneratePresentationId: PRESENTATION_ID }), /PPT/);
    }
  } finally { globalThis.fetch = original; }
});
