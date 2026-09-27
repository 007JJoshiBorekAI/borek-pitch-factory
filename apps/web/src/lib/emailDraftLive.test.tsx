import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FollowUpEmailView } from "../components/FollowUpEmailView.js";
import type { JourneyStageName } from "./api.js";
import {
  confirmAdaptedEmailDraft,
  emailDraftErrorMessage,
  fetchAdaptedEmailDraft,
  generateAdaptedEmailDraft,
  hasLiveEmailDraft,
  panelDraftForAdaptedEmail,
} from "./emailDraftLive.js";
import { getStageEmailReviewContext } from "./stageEmailReview.js";
import { emptyFollowupChecklist, emptyFollowupProjectStatics } from "./followupReview.js";

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

function draftEnvelope(journeyStage: JourneyStageName, draft: Record<string, unknown> | null) {
  return {
    schema_version: "1.0",
    opportunity_id: OPPORTUNITY_ID,
    journey_stage: journeyStage,
    draft,
  };
}

const generatedDraft = {
  id: DRAFT_ID,
  status: "draft",
  send_status: "not_sent",
  selected_length: null,
  lengths: {
    short: { subject: "Short subject", body: "Short body.", word_count: 2 },
    medium: { subject: "Medium subject", body: "Medium body with more detail.", word_count: 6 },
    extensive: { subject: "Extensive subject", body: "Extensive body with even more detail.", word_count: 8 },
  },
  confirmed_at: null,
  created_at: "2026-09-23T10:00:00Z",
  updated_at: "2026-09-23T10:00:00Z",
};

async function runLiveEmailTests() {
  const stages: JourneyStageName[] = ["first_contact", "deepening", "concretisation"];

  for (const stage of stages) {
    mockFetch(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes(`/email-drafts?journey_stage=${stage}`) && method === "GET") {
        return jsonResponse(200, draftEnvelope(stage, null));
      }
      if (url.endsWith("/email-drafts/generate") && method === "POST") {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.journey_stage, stage);
        return jsonResponse(200, draftEnvelope(stage, generatedDraft));
      }
      return jsonResponse(404, { error: { code: "NOT_FOUND", message: "missing" } });
    });

    const empty = await fetchAdaptedEmailDraft(TOKEN, OPPORTUNITY_ID, stage);
    assert.equal(empty.panelDraft, null);
    assert.equal(hasLiveEmailDraft(empty), false);

    const generated = await generateAdaptedEmailDraft(TOKEN, OPPORTUNITY_ID, stage, "short");
    assert.equal(generated.journeyStage, stage);
    assert.equal(generated.panelDraft?.subject, "Short subject");
    assert.equal(generated.sendStatus, "not_sent");

    globalThis.fetch = originalFetch;
  }

  mockFetch(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.includes("/email-drafts?journey_stage=deepening") && method === "GET") {
      return jsonResponse(200, draftEnvelope("deepening", generatedDraft));
    }
    if (url.endsWith(`/email-drafts/${DRAFT_ID}/confirm`) && method === "POST") {
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body, { selected_length: "medium" });
      return jsonResponse(200, draftEnvelope("deepening", {
        ...generatedDraft,
        status: "confirmed",
        selected_length: "medium",
        confirmed_at: "2026-09-23T10:05:00Z",
      }));
    }
    if (url.endsWith("/email-drafts/generate") && method === "POST") {
      return jsonResponse(400, {
        error: { code: "TRANSCRIPT_REQUIRED", message: "Upload a transcript first." },
      });
    }
    return jsonResponse(404, { error: { code: "NOT_FOUND", message: "missing" } });
  });

  const loaded = await fetchAdaptedEmailDraft(TOKEN, OPPORTUNITY_ID, "deepening", "extensive");
  assert.equal(loaded.panelDraft?.subject, "Extensive subject");
  const mediumPanel = panelDraftForAdaptedEmail(loaded, "medium");
  assert.equal(mediumPanel?.subject, "Medium subject");

  const confirmed = await confirmAdaptedEmailDraft(TOKEN, OPPORTUNITY_ID, DRAFT_ID, "medium");
  assert.equal(confirmed.serverConfirmed, true);
  assert.equal(confirmed.sendStatus, "not_sent");
  assert.equal(confirmed.selectedLength, "medium");

  try {
    await generateAdaptedEmailDraft(TOKEN, OPPORTUNITY_ID, "deepening");
    assert.fail("expected TRANSCRIPT_REQUIRED");
  } catch (error) {
    assert.match(emailDraftErrorMessage(error), /transcript/i);
  }

  globalThis.fetch = originalFetch;

  mockFetch(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith(`/email-drafts/${DRAFT_ID}/confirm`) && method === "POST") {
      return jsonResponse(400, {
        error: { code: "INVALID_EMAIL_LENGTH", message: "Invalid length." },
      });
    }
    return jsonResponse(200, draftEnvelope("deepening", generatedDraft));
  });

  try {
    await confirmAdaptedEmailDraft(TOKEN, OPPORTUNITY_ID, DRAFT_ID, "medium");
    assert.fail("expected confirm failure");
  } catch (error) {
    assert.match(emailDraftErrorMessage(error), /short, medium, or extensive/i);
  }

  globalThis.fetch = originalFetch;
}

const deepeningContext = getStageEmailReviewContext("deepening", false);
const statics = emptyFollowupProjectStatics();
statics.project_name = "Acme";
statics.client_short = "Acme";
statics.standard_recipients[0].email = "markus@example.com";
statics.standard_recipients[0].first_name = "Markus";
statics.sender_profile = { name: "Lena", role: "Lead", email: "lena@example.com" };

const notGeneratedHtml = renderToStaticMarkup(
  <FollowUpEmailView
    opportunityId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    clientName="Acme"
    stageContext={deepeningContext}
    demoMode={false}
    statics={statics}
    staticsSaved
    draft={null}
    draftNotGenerated
    draftUnavailable={false}
    checklist={emptyFollowupChecklist()}
    acknowledgedFlags={new Set()}
    busy={false}
    error={null}
    info={null}
    onStaticsChange={() => undefined}
    onSaveStatics={() => undefined}
    onDraftChange={() => undefined}
    onGenerateDraft={() => undefined}
    onChecklistChange={() => undefined}
    onFlagChange={() => undefined}
    onConfirm={() => undefined}
  />,
);
assert.match(notGeneratedHtml, /Generate email draft/);
assert.match(notGeneratedHtml, /No email draft has been generated for Deepening yet/);

const liveDraftHtml = renderToStaticMarkup(
  <FollowUpEmailView
    opportunityId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    clientName="Acme"
    stageContext={deepeningContext}
    demoMode={false}
    statics={statics}
    staticsSaved
    draft={{
      subject: "Medium subject",
      body: "Medium body with more detail.",
      review_flags: [],
      attachment_name: null,
      status: "draft",
    }}
    draftNotGenerated={false}
    draftUnavailable={false}
    selectedLength="medium"
    liveDraftReadOnly
    checklist={emptyFollowupChecklist()}
    acknowledgedFlags={new Set()}
    busy={false}
    error={null}
    info={null}
    onStaticsChange={() => undefined}
    onSaveStatics={() => undefined}
    onDraftChange={() => undefined}
    onLengthChange={() => undefined}
    onChecklistChange={() => undefined}
    onFlagChange={() => undefined}
    onConfirm={() => undefined}
  />,
);
assert.match(liveDraftHtml, /Short/);
assert.match(liveDraftHtml, /Medium/);
assert.match(liveDraftHtml, /Extensive/);
assert.match(liveDraftHtml, /readonly/i);
assert.doesNotMatch(liveDraftHtml, />Send</);

const panelSource = readFileSync(
  fileURLToPath(new URL("../components/FollowupReviewPanel.tsx", import.meta.url)),
  "utf8",
);
const apiSource = readFileSync(
  fileURLToPath(new URL("./api.ts", import.meta.url)),
  "utf8",
);
assert.match(panelSource, /fetchAdaptedEmailDraft/);
assert.match(panelSource, /generateAdaptedEmailDraft/);
assert.match(panelSource, /confirmAdaptedEmailDraft/);
assert.match(panelSource, /demoEmailDraftForStage/);
assert.match(panelSource, /confirmReviewedMessageLive/);
assert.doesNotMatch(panelSource, /email-drafts\/.*\/send|sendEmail|sendFollowup/);
assert.doesNotMatch(apiSource, /email-drafts\/\$\{.*\}\/send|\/send`/);

void runLiveEmailTests().then(() => {
  console.log("MS-35 emailDraftLive tests passed");
});
