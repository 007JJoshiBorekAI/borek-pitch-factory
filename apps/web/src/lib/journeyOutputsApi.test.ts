import assert from "node:assert/strict";

import {
  ApiRequestError,
  confirmEmailDraft,
  generateEmailDraft,
  generateStage1Outputs,
  generateStage2Outputs,
  getEmailDraft,
  getMeetingFeedback,
  getStage1Outputs,
  getStage2Outputs,
  updateMeetingFeedback,
} from "./api.js";

const TOKEN = "test-token";
const OPPORTUNITY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DRAFT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const originalFetch = globalThis.fetch;

function mockFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = handler as typeof fetch;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function runApiTests() {
  mockFetch(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.endsWith("/stage1-outputs") && method === "GET") {
      return jsonResponse(200, {
        schema_version: "1.0",
        opportunity_id: OPPORTUNITY_ID,
        status: "not_generated",
        outputs: null,
      });
    }

    if (url.endsWith("/stage1-outputs/generate") && method === "POST") {
      return jsonResponse(400, {
        error: {
          code: "CLIENT_DOCUMENT_REQUIRED",
          message: "Upload at least one processed client document.",
        },
      });
    }

    if (url.endsWith("/stage2-outputs/generate") && method === "POST") {
      return jsonResponse(400, {
        error: {
          code: "TRANSCRIPT_REQUIRED",
          message: "Upload a meeting transcript first.",
        },
      });
    }

    if (url.endsWith("/meeting-feedback") && method === "GET") {
      return jsonResponse(200, {
        schema_version: "1.0",
        opportunity_id: OPPORTUNITY_ID,
        text: null,
        updated_at: null,
      });
    }

    if (url.endsWith("/meeting-feedback") && method === "PUT") {
      const body = JSON.parse(String(init?.body));
      return jsonResponse(200, {
        schema_version: "1.0",
        opportunity_id: OPPORTUNITY_ID,
        text: body.text,
        updated_at: "2026-09-23T10:00:00Z",
      });
    }

    if (url.includes("/email-drafts?journey_stage=deepening") && method === "GET") {
      return jsonResponse(200, {
        schema_version: "1.0",
        opportunity_id: OPPORTUNITY_ID,
        journey_stage: "deepening",
        draft: null,
      });
    }

    if (url.endsWith("/email-drafts/generate") && method === "POST") {
      return jsonResponse(200, {
        schema_version: "1.0",
        opportunity_id: OPPORTUNITY_ID,
        journey_stage: "deepening",
        draft: {
          id: DRAFT_ID,
          status: "draft",
          send_status: "not_sent",
          selected_length: null,
          lengths: {
            short: { subject: "S", body: "Short.", word_count: 1 },
            medium: { subject: "M", body: "Medium body.", word_count: 2 },
            extensive: { subject: "E", body: "Extensive body.", word_count: 2 },
          },
          confirmed_at: null,
          created_at: "2026-09-23T10:00:00Z",
          updated_at: "2026-09-23T10:00:00Z",
        },
      });
    }

    if (url.endsWith(`/email-drafts/${DRAFT_ID}/confirm`) && method === "POST") {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.selected_length, "medium");
      return jsonResponse(200, {
        schema_version: "1.0",
        opportunity_id: OPPORTUNITY_ID,
        journey_stage: "deepening",
        draft: {
          id: DRAFT_ID,
          status: "confirmed",
          send_status: "not_sent",
          selected_length: "medium",
          lengths: {
            short: { subject: "S", body: "Short.", word_count: 1 },
            medium: { subject: "M", body: "Medium body.", word_count: 2 },
            extensive: { subject: "E", body: "Extensive body.", word_count: 2 },
          },
          confirmed_at: "2026-09-23T10:05:00Z",
          created_at: "2026-09-23T10:00:00Z",
          updated_at: "2026-09-23T10:05:00Z",
        },
      });
    }

    return jsonResponse(404, { error: { code: "NOT_FOUND", message: "missing" } });
  });

  const stage1 = await getStage1Outputs(TOKEN, OPPORTUNITY_ID);
  assert.equal(stage1.status, "not_generated");
  assert.equal(stage1.outputs, null);

  await assert.rejects(
    () => generateStage1Outputs(TOKEN, OPPORTUNITY_ID),
    (error: unknown) => {
      assert.ok(error instanceof ApiRequestError);
      assert.equal(error.code, "CLIENT_DOCUMENT_REQUIRED");
      return true;
    },
  );

  await assert.rejects(
    () => generateStage2Outputs(TOKEN, OPPORTUNITY_ID),
    (error: unknown) => {
      assert.ok(error instanceof ApiRequestError);
      assert.equal(error.code, "TRANSCRIPT_REQUIRED");
      return true;
    },
  );

  const feedback = await getMeetingFeedback(TOKEN, OPPORTUNITY_ID);
  assert.equal(feedback.text, null);

  const savedFeedback = await updateMeetingFeedback(TOKEN, OPPORTUNITY_ID, {
    text: "Rep notes from the call.",
  });
  assert.equal(savedFeedback.text, "Rep notes from the call.");

  const emptyDraft = await getEmailDraft(TOKEN, OPPORTUNITY_ID, "deepening");
  assert.equal(emptyDraft.draft, null);

  const generated = await generateEmailDraft(TOKEN, OPPORTUNITY_ID, {
    journey_stage: "deepening",
  });
  assert.equal(generated.draft?.id, DRAFT_ID);

  const confirmed = await confirmEmailDraft(TOKEN, OPPORTUNITY_ID, DRAFT_ID, {
    selected_length: "medium",
  });
  assert.equal(confirmed.draft?.status, "confirmed");
  assert.equal(confirmed.draft?.send_status, "not_sent");

  globalThis.fetch = originalFetch;
}

void runApiTests().then(() => {
  console.log("MS-35 journeyOutputsApi tests passed");
});
