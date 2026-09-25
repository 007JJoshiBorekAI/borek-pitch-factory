import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MeetingFeedbackPanel } from "../components/MeetingFeedbackPanel.js";
import { ApiRequestError, getMeetingFeedback, updateMeetingFeedback } from "./api.js";
import { meetingFeedbackErrorMessage } from "./apiErrors.js";

const TOKEN = "test-token";
const OPPORTUNITY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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

async function runFeedbackTests() {
  let storedText: string | null = null;
  let storedUpdatedAt: string | null = null;

  mockFetch(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.endsWith("/meeting-feedback") && method === "GET") {
      return jsonResponse(200, {
        schema_version: "1.0",
        opportunity_id: OPPORTUNITY_ID,
        text: storedText,
        updated_at: storedUpdatedAt,
      });
    }

    if (url.endsWith("/meeting-feedback") && method === "PUT") {
      const body = JSON.parse(String(init?.body)) as { text: string | null };
      if (body.text === "fail-save") {
        return jsonResponse(500, {
          error: { code: "INTERNAL_ERROR", message: "Save failed." },
        });
      }
      storedText = body.text;
      storedUpdatedAt = "2026-09-23T12:00:00Z";
      return jsonResponse(200, {
        schema_version: "1.0",
        opportunity_id: OPPORTUNITY_ID,
        text: storedText,
        updated_at: storedUpdatedAt,
      });
    }

    return jsonResponse(404, { error: { code: "NOT_FOUND", message: "missing" } });
  });

  const initial = await getMeetingFeedback(TOKEN, OPPORTUNITY_ID);
  assert.equal(initial.text, null);
  assert.equal(initial.schema_version, "1.0");

  const saved = await updateMeetingFeedback(TOKEN, OPPORTUNITY_ID, {
    text: "Client prefers phased rollout.",
  });
  assert.equal(saved.text, "Client prefers phased rollout.");
  assert.equal(saved.updated_at, "2026-09-23T12:00:00Z");

  const reloaded = await getMeetingFeedback(TOKEN, OPPORTUNITY_ID);
  assert.equal(reloaded.text, "Client prefers phased rollout.");

  try {
    await updateMeetingFeedback(TOKEN, OPPORTUNITY_ID, { text: "fail-save" });
    assert.fail("expected save failure");
  } catch (error) {
    assert.match(meetingFeedbackErrorMessage(error), /could not be saved/i);
  }

  globalThis.fetch = originalFetch;
}

const panelHtml = renderToStaticMarkup(
  <MeetingFeedbackPanel accessToken="token" opportunityId={OPPORTUNITY_ID} disabled={false} />,
);
assert.match(panelHtml, /Meeting feedback/);
assert.match(panelHtml, /never treated as transcript/i);
assert.match(panelHtml, /Save meeting feedback/);
assert.doesNotMatch(panelHtml, /Demonstration data/i);

const gatedHtml = renderToStaticMarkup(
  <MeetingFeedbackPanel accessToken={null} opportunityId={null} disabled={false} />,
);
assert.match(gatedHtml, /Create an opportunity above/i);

const panelSource = readFileSync(
  fileURLToPath(new URL("../components/MeetingFeedbackPanel.tsx", import.meta.url)),
  "utf8",
);
assert.match(panelSource, /getMeetingFeedback/);
assert.match(panelSource, /updateMeetingFeedback/);
assert.match(panelSource, /setSaveConfirmed\(true\)/);
assert.match(panelSource, /text: textToSave\.length > 0 \? textToSave : null/);
assert.doesNotMatch(panelSource, /sessionStorage|demo/i);

assert.match(
  meetingFeedbackErrorMessage(new ApiRequestError("Meeting feedback is not available on this server yet.", 503)),
  /not available on this server/i,
);

void runFeedbackTests().then(() => {
  console.log("MS-35 meeting feedback tests passed");
});
