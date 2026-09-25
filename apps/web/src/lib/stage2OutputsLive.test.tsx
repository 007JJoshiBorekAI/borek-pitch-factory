import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AdjustedPresentationPanel } from "../components/AdjustedPresentationPanel.js";
import {
  DEEPENING_PPT_UNFROZEN,
  RETRIEVAL_PROMPT_VERSION_UNAVAILABLE,
  STAGE2_OUTPUTS_NOT_GENERATED,
  adaptStage2OutputsEnvelope,
} from "./stageOutputsApiAdapter.js";
import type { Stage2OutputsEnvelope } from "./journeyOutputsContracts.js";
import {
  deriveStage2ArtifactAvailability,
  fetchAdaptedStage2Outputs,
  generateAndFetchAdaptedStage2Outputs,
  isStage2OutputsReady,
  stage2OutputsErrorMessage,
  stage2OutputsUnavailableDependencies,
} from "./stage2OutputsLive.js";
import { journeyOutputsErrorMessage } from "./apiErrors.js";

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

const readyEnvelope: Stage2OutputsEnvelope = {
  schema_version: "1.0",
  opportunity_id: OPPORTUNITY_ID,
  status: "ready",
  outputs: {
    call_summary: "Agreed to proceed with a six-week discovery phase.",
    mom: {
      title: "Minutes — Acme",
      participants: ["Anna Keller"],
      decisions: ["Proceed with discovery"],
      action_items: ["Share workbook"],
      open_questions: ["Which SAP modules?"],
      meeting_feedback: null,
    },
    presentation: {
      status: "ready",
      code: null,
      presentation_id: "22222222-2222-4222-8222-222222222222",
      download_url: null,
    },
    transcript_summary: {
      schema_version: "1.0",
      transcript_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      conversation_id: "C1",
    },
    generated_at: "2026-09-23T11:00:00Z",
  },
};

async function runLiveTests() {
  let getCalls = 0;
  let generateCalls = 0;

  mockFetch(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.includes("/stage2-outputs/generate") && method === "POST") {
      generateCalls += 1;
      if (generateCalls === 1) {
        return jsonResponse(400, {
          error: { code: "TRANSCRIPT_REQUIRED", message: "Upload a transcript first." },
        });
      }
      return jsonResponse(200, readyEnvelope);
    }

    if (url.endsWith("/stage2-outputs") && method === "GET") {
      getCalls += 1;
      if (getCalls === 1) {
        return jsonResponse(200, {
          schema_version: "1.0",
          opportunity_id: OPPORTUNITY_ID,
          status: "not_generated",
          outputs: null,
        });
      }
      return jsonResponse(200, readyEnvelope);
    }

    return jsonResponse(404, { error: { code: "NOT_FOUND", message: "missing" } });
  });

  const notGenerated = await fetchAdaptedStage2Outputs(TOKEN, OPPORTUNITY_ID);
  assert.equal(notGenerated.envelopeStatus, "not_generated");
  assert.equal(notGenerated.panelOutputs, null);
  assert.deepEqual(notGenerated.dependencies, [STAGE2_OUTPUTS_NOT_GENERATED]);
  assert.equal(isStage2OutputsReady(notGenerated), false);
  assert.deepEqual(stage2OutputsUnavailableDependencies(notGenerated), [STAGE2_OUTPUTS_NOT_GENERATED]);

  try {
    await generateAndFetchAdaptedStage2Outputs(TOKEN, OPPORTUNITY_ID);
    assert.fail("expected TRANSCRIPT_REQUIRED");
  } catch (error) {
    assert.match(stage2OutputsErrorMessage(error), /transcript/i);
    assert.match(journeyOutputsErrorMessage(error), /transcript/i);
  }

  const generated = await generateAndFetchAdaptedStage2Outputs(TOKEN, OPPORTUNITY_ID);
  assert.equal(isStage2OutputsReady(generated), true);
  assert.equal(generated.panelOutputs?.prompt_version, "");
  assert.ok(generated.dependencies.includes(RETRIEVAL_PROMPT_VERSION_UNAVAILABLE));
  assert.equal(generated.panelOutputs?.call_summary.origin, "UNKNOWN");
  assert.equal(generated.panelOutputs?.decisions[0].origin, "UNKNOWN");
  assert.equal(generated.panelOutputs?.decisions[0].source_refs.length, 0);
  const availability = deriveStage2ArtifactAvailability(generated);
  assert.equal(availability.call_summary, true);
  assert.equal(availability.minutes_of_meeting, true);
  assert.equal(availability.adjusted_deck, true);
  assert.equal(getCalls, 1);
  assert.equal(generateCalls, 2);

  globalThis.fetch = originalFetch;

  mockFetch(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.includes("/stage2-outputs/generate") && method === "POST") {
      return jsonResponse(400, {
        error: { code: "CLIENT_DOCUMENT_REQUIRED", message: "Client document required." },
      });
    }
    return jsonResponse(200, readyEnvelope);
  });

  try {
    await generateAndFetchAdaptedStage2Outputs(TOKEN, OPPORTUNITY_ID);
    assert.fail("expected CLIENT_DOCUMENT_REQUIRED");
  } catch (error) {
    assert.match(stage2OutputsErrorMessage(error), /client document/i);
  }

  globalThis.fetch = originalFetch;
}

const unfrozenAdapted = adaptStage2OutputsEnvelope({
  ...readyEnvelope,
  outputs: readyEnvelope.outputs
    ? {
        ...readyEnvelope.outputs,
        presentation: {
          status: "unfrozen",
          code: DEEPENING_PPT_UNFROZEN,
          presentation_id: null,
          download_url: null,
        },
      }
    : null,
});

const unfrozenHtml = renderToStaticMarkup(
  <AdjustedPresentationPanel
    presentationRef={unfrozenAdapted.panelOutputs!.presentation_ref}
    dependencies={unfrozenAdapted.dependencies}
    opportunityId={OPPORTUNITY_ID}
    demoMode={false}
    verifiedPresentation={null}
  />,
);
assert.match(unfrozenHtml, /Adjusted presentation unavailable/);
assert.match(unfrozenHtml, /not ready yet/i);
assert.doesNotMatch(unfrozenHtml, /Open adjusted presentation/);

const deepeningSource = readFileSync(
  fileURLToPath(new URL("../components/DeepeningReviewPanel.tsx", import.meta.url)),
  "utf8",
);
assert.match(deepeningSource, /fetchAdaptedStage2Outputs/);
assert.match(deepeningSource, /generateAndFetchAdaptedStage2Outputs/);
assert.match(deepeningSource, /stage2OutputsDemo/);
assert.match(deepeningSource, /isDeepeningPresentationDownloadBlocked/);
assert.doesNotMatch(deepeningSource, /STAGE_OUTPUT_BACKEND_NOTE/);
assert.match(deepeningSource, /demoMode \? stage2OutputsDemo/);

void runLiveTests().then(() => {
  console.log("MS-35 stage2OutputsLive tests passed");
});
