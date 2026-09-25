import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FirstMeetingPresentationPanel } from "../components/FirstMeetingPresentationPanel.js";
import {
  FIRST_MEETING_PPT_UNFROZEN,
  RETRIEVAL_PROMPT_VERSION_UNAVAILABLE,
  STAGE1_OUTPUTS_NOT_GENERATED,
  adaptStage1OutputsEnvelope,
} from "./stageOutputsApiAdapter.js";
import type { Stage1OutputsEnvelope } from "./journeyOutputsContracts.js";
import {
  deriveStage1ArtifactAvailability,
  fetchAdaptedStage1Outputs,
  generateAndFetchAdaptedStage1Outputs,
  isRetrievalPromptVersionUnavailable,
  isStage1OutputsReady,
  stage1OutputsErrorMessage,
  stage1OutputsUnavailableDependencies,
} from "./stage1OutputsLive.js";
import { UseCaseListPanel } from "../components/UseCaseListPanel.js";
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

const readyEnvelope: Stage1OutputsEnvelope = {
  schema_version: "1.0",
  opportunity_id: OPPORTUNITY_ID,
  status: "ready",
  outputs: {
    hypothesis: { statement: "Support hypothesis text.", origin: "AI_HYPOTHESIS" },
    product_relevance: { statement: "Product relevance text.", origin: "AI_HYPOTHESIS" },
    discovery_questions: [{ id: "Q1", text: "What ERP modules are in scope?" }],
    use_cases: [{ title: "Invoice 3-way Match", rationale: "High volume", availability: "matched" }],
    agenda: { title: "First meeting", items: [{ order: 1, label: "Introductions" }] },
    presentation: {
      status: "ready",
      profile: "first_meeting_3",
      code: null,
      presentation_id: "11111111-1111-4111-8111-111111111111",
      download_url: null,
    },
    research: {
      schema_version: "1.0",
      opportunity_id: OPPORTUNITY_ID,
      client_name: "Acme",
      company_facts: {
        description: { status: "unknown", origin: "UNKNOWN", value: null, source_refs: [] },
        headquarters: { status: "unknown", origin: "UNKNOWN", value: null, source_refs: [] },
        employee_headcount: { status: "unknown", origin: "UNKNOWN", value: null, source_refs: [] },
        decision_makers: { status: "unknown", origin: "UNKNOWN", value: null, source_refs: [] },
        revenue: { status: "unknown", origin: "UNKNOWN", value: null, source_refs: [] },
      },
      user_statements: { origin: "USER_INPUT", fields: {} },
      borek_offering: { status: "unknown", origin: "UNKNOWN", value: null, source_refs: [] },
      hypothesis: { status: "unknown", origin: "AI_INFERENCE", text: null, basis: [] },
      product_relevance: { status: "unknown", origin: "AI_INFERENCE", text: null, basis: [] },
      dependencies: [],
    },
    generated_at: "2026-09-23T10:00:00Z",
  },
};

async function runLiveTests() {
  let getCalls = 0;
  let generateCalls = 0;

  mockFetch(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.includes("/stage1-outputs/generate") && method === "POST") {
      generateCalls += 1;
      if (generateCalls === 1) {
        return jsonResponse(400, {
          error: { code: "CLIENT_DOCUMENT_REQUIRED", message: "Upload a client document." },
        });
      }
      return jsonResponse(200, readyEnvelope);
    }

    if (url.endsWith("/stage1-outputs") && method === "GET") {
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

  const notGenerated = await fetchAdaptedStage1Outputs(TOKEN, OPPORTUNITY_ID);
  assert.equal(notGenerated.envelopeStatus, "not_generated");
  assert.equal(notGenerated.panelOutputs, null);
  assert.deepEqual(notGenerated.dependencies, [STAGE1_OUTPUTS_NOT_GENERATED]);
  assert.equal(isStage1OutputsReady(notGenerated), false);
  assert.deepEqual(stage1OutputsUnavailableDependencies(notGenerated), [STAGE1_OUTPUTS_NOT_GENERATED]);

  try {
    await generateAndFetchAdaptedStage1Outputs(TOKEN, OPPORTUNITY_ID);
    assert.fail("expected CLIENT_DOCUMENT_REQUIRED");
  } catch (error) {
    assert.match(stage1OutputsErrorMessage(error), /client document/i);
    assert.match(journeyOutputsErrorMessage(error), /client document/i);
  }

  const generated = await generateAndFetchAdaptedStage1Outputs(TOKEN, OPPORTUNITY_ID);
  assert.equal(isStage1OutputsReady(generated), true);
  assert.equal(generated.panelOutputs?.prompt_version, "");
  assert.equal(isRetrievalPromptVersionUnavailable(generated.panelOutputs?.prompt_version ?? ""), true);
  assert.ok(generated.dependencies.includes(RETRIEVAL_PROMPT_VERSION_UNAVAILABLE));
  assert.equal(generated.panelOutputs?.use_cases.items[0].use_case_id, "");
  assert.equal(generated.panelOutputs?.discovery_questions.items[0].origin, "UNKNOWN");
  const availability = deriveStage1ArtifactAvailability(generated);
  assert.equal(availability.discovery_questions, true);
  assert.equal(availability.company_research_brief, true);
  assert.equal(generated.embeddedResearch?.hypothesis.origin, "AI_INFERENCE");
  assert.equal(getCalls, 1);
  assert.equal(generateCalls, 2);

  globalThis.fetch = originalFetch;

  mockFetch(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.includes("/stage1-outputs/generate") && method === "POST") {
      return jsonResponse(400, {
        error: { code: "TRANSCRIPT_REQUIRED", message: "Transcript required." },
      });
    }
    return jsonResponse(200, readyEnvelope);
  });

  try {
    await generateAndFetchAdaptedStage1Outputs(TOKEN, OPPORTUNITY_ID);
    assert.fail("expected TRANSCRIPT_REQUIRED");
  } catch (error) {
    assert.match(stage1OutputsErrorMessage(error), /transcript/i);
  }

  globalThis.fetch = originalFetch;
}

const unfrozenAdapted = adaptStage1OutputsEnvelope({
  ...readyEnvelope,
  outputs: readyEnvelope.outputs
    ? {
        ...readyEnvelope.outputs,
        presentation: {
          status: "unfrozen",
          profile: "first_meeting_3",
          code: FIRST_MEETING_PPT_UNFROZEN,
          presentation_id: null,
          download_url: null,
        },
      }
    : null,
});

const unfrozenHtml = renderToStaticMarkup(
  <FirstMeetingPresentationPanel
    presentationRef={unfrozenAdapted.panelOutputs!.presentation_ref}
    dependencies={unfrozenAdapted.dependencies}
    opportunityId={OPPORTUNITY_ID}
    demoMode={false}
    verifiedPresentation={null}
  />,
);
assert.match(unfrozenHtml, /Presentation unavailable/);
assert.match(unfrozenHtml, /not frozen yet/i);
assert.doesNotMatch(unfrozenHtml, /Open presentation review/);

const reviewPanelSource = readFileSync(
  fileURLToPath(new URL("../components/FirstContactReviewPanel.tsx", import.meta.url)),
  "utf8",
);
const materialsPanelSource = readFileSync(
  fileURLToPath(new URL("../components/FirstContactMaterialsPanel.tsx", import.meta.url)),
  "utf8",
);

assert.match(reviewPanelSource, /fetchAdaptedStage1Outputs/);
assert.match(reviewPanelSource, /generateAndFetchAdaptedStage1Outputs/);
assert.match(reviewPanelSource, /stage1OutputsDemo/);
assert.doesNotMatch(reviewPanelSource, /generateStage1Research/);
assert.doesNotMatch(reviewPanelSource, /readSessionStage1Research/);
assert.match(reviewPanelSource, /demoMode \? stage1ResearchDemo/);

assert.match(materialsPanelSource, /fetchAdaptedStage1Outputs/);
assert.match(materialsPanelSource, /isFirstContactPresentationDownloadBlocked/);
assert.match(materialsPanelSource, /demoMode \? stage1OutputsDemo/);
assert.doesNotMatch(materialsPanelSource, /getLatestPresentation/);
assert.match(reviewPanelSource, /deriveStage1ArtifactAvailability/);
assert.doesNotMatch(reviewPanelSource, /hasStage1Outputs/);

const liveUseCaseHtml = renderToStaticMarkup(
  <UseCaseListPanel
    collection={{
      status: "generated",
      items: [
        {
          use_case_id: "",
          title: "Invoice 3-way Match",
          relevance_summary: "High volume",
          origin: "UNKNOWN",
          status: "matched",
        },
      ],
    }}
    dependencies={[]}
  />,
);
assert.match(liveUseCaseHtml, /Invoice 3-way Match/);
assert.doesNotMatch(liveUseCaseHtml, /stage-item-id/);

void runLiveTests().then(() => {
  console.log("MS-35 stage1OutputsLive tests passed");
});
