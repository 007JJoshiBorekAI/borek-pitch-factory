import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { generateAndAwaitFirstPitch } from "./ppt1Generation.js";

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

test("PPT #1 generation uses approved-discovery stage1 outputs and resolves the ready version", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url}`);
    if (url.includes("/stage1-outputs/generate") && method === "POST") {
      return jsonResponse(200, {
        outputs: { presentation: { status: "ready", presentation_id: PRESENTATION_ID } },
      });
    }
    if (url.includes("/workflow-status")) {
      return jsonResponse(200, {
        documents: {
          ppt1: {
            presentation_id: PRESENTATION_ID,
            latest_ready_version_id: VERSION_ID,
            journey_stage: "first_contact",
            status: "ready",
          },
          ppt2: null,
        },
      });
    }
    return jsonResponse(404, { error: { code: "NOT_FOUND", message: url } });
  }) as typeof fetch;

  try {
    const result = await generateAndAwaitFirstPitch(TOKEN, OPPORTUNITY_ID);
    assert.equal(result.presentationId, PRESENTATION_ID);
    assert.equal(result.presentationVersionId, VERSION_ID);
    assert.equal(result.jobId, null);
    assert.equal(calls.some((call) => call.includes("/presentation/generate")), false);
    assert.equal(calls.filter((call) => call.includes("/stage1-outputs/generate")).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("PPT #1 polls the presentation job when stage1 is not ready yet", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url}`);
    if (url.includes("/stage1-outputs/generate")) {
      return jsonResponse(200, {
        outputs: { presentation: { status: "queued", presentation_id: PRESENTATION_ID } },
      });
    }
    if (url.includes("/jobs/active")) {
      return jsonResponse(200, {
        job_id: JOB_ID,
        job_type: "presentation_generation",
        status: "RUNNING",
        current_stage: "PREVIEW_RENDERING",
        started_at: "2026-06-01T00:00:01Z",
        error: null,
      });
    }
    if (url.includes(`/jobs/${JOB_ID}`)) {
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
    if (url.includes("/stage1-outputs") && method === "GET") {
      return jsonResponse(200, {
        outputs: { presentation: { status: "ready", presentation_id: PRESENTATION_ID } },
      });
    }
    if (url.includes("/workflow-status")) {
      return jsonResponse(200, {
        documents: {
          ppt1: {
            presentation_id: PRESENTATION_ID,
            latest_ready_version_id: VERSION_ID,
            journey_stage: "first_contact",
            status: "ready",
          },
          ppt2: null,
        },
      });
    }
    return jsonResponse(404, { error: { code: "NOT_FOUND", message: url } });
  }) as typeof fetch;

  try {
    const seen: string[] = [];
    const result = await generateAndAwaitFirstPitch(TOKEN, OPPORTUNITY_ID, (job) => {
      seen.push(job.status);
    });
    assert.equal(result.jobId, JOB_ID);
    assert.equal(result.presentationVersionId, VERSION_ID);
    assert.deepEqual(seen, ["COMPLETED"]);
    assert.ok(calls.some((call) => call.includes(`/jobs/${JOB_ID}`)));
    assert.equal(calls.some((call) => call.includes("/presentation/generate")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the new pre-meeting UI calls the approved-discovery PPT #1 helper", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../components/PresentationWorkspace.tsx", import.meta.url)),
    "utf8",
  );
  const helper = readFileSync(fileURLToPath(new URL("./ppt1Generation.ts", import.meta.url)), "utf8");
  assert.match(source, /generateAndAwaitFirstPitch/);
  assert.match(helper, /generateStage1Outputs/);
  assert.match(helper, /waitForJob/);
  assert.doesNotMatch(helper, /presentation\/generate/);
  assert.doesNotMatch(source, /GAMMA|PRESENTATION_ENGINE/);
});

test("a previous ready workflow version cannot turn unfinished generation into success", async () => {
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/stage1-outputs")) return jsonResponse(200, {
      outputs: { presentation: { status: "queued", presentation_id: PRESENTATION_ID } },
    });
    if (url.includes("/jobs/active")) return jsonResponse(200, { job_id: JOB_ID, status: "COMPLETED" });
    if (url.includes(`/jobs/${JOB_ID}`)) return jsonResponse(200, {
      job_id: JOB_ID, status: "COMPLETED", result: {}, error: null,
    });
    if (url.includes("/workflow-status")) return jsonResponse(200, {
      documents: { ppt1: { presentation_id: PRESENTATION_ID, latest_ready_version_id: VERSION_ID } },
    });
    throw new Error(url);
  };
  try {
    await assert.rejects(generateAndAwaitFirstPitch(TOKEN, OPPORTUNITY_ID), { code: "PPT1_NOT_READY" });
  } finally { globalThis.fetch = originalFetch; }
});

test("completed generation must match the workflow presentation and version identities", async () => {
  let jobVersion = "different-version";
  let workflowPresentation = PRESENTATION_ID;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/stage1-outputs")) return jsonResponse(200, {
      outputs: { presentation: { status: init?.method === "POST" ? "queued" : "ready", presentation_id: PRESENTATION_ID } },
    });
    if (url.includes("/jobs/active")) return jsonResponse(200, { job_id: JOB_ID, status: "COMPLETED" });
    if (url.includes(`/jobs/${JOB_ID}`)) return jsonResponse(200, {
      job_id: JOB_ID, status: "COMPLETED", result: { presentation_id: PRESENTATION_ID, presentation_version_id: jobVersion }, error: null,
    });
    if (url.includes("/workflow-status")) return jsonResponse(200, {
      documents: { ppt1: { presentation_id: workflowPresentation, latest_ready_version_id: VERSION_ID } },
    });
    throw new Error(url);
  };
  try {
    await assert.rejects(generateAndAwaitFirstPitch(TOKEN, OPPORTUNITY_ID), { code: "PPT1_IDENTITY_MISMATCH" });
    jobVersion = VERSION_ID;
    workflowPresentation = "different-presentation";
    await assert.rejects(generateAndAwaitFirstPitch(TOKEN, OPPORTUNITY_ID), { code: "PPT1_IDENTITY_MISMATCH" });
  } finally { globalThis.fetch = originalFetch; }
});
