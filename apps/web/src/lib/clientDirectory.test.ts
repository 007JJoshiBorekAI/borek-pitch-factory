import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CLIENT_DIRECTORY_FIXTURE,
  CLIENT_STATUS_LABELS,
  clientOpportunityHref,
  loadLiveClientDirectory,
} from "./clientDirectory.js";

assert.equal(CLIENT_DIRECTORY_FIXTURE.length, 6);
assert.equal(CLIENT_STATUS_LABELS.client_information, "Client Information");
assert.equal(CLIENT_STATUS_LABELS.owner_review, "Owner Review");

for (const item of CLIENT_DIRECTORY_FIXTURE) {
  assert.equal(item.preview_fixture, true);
  const href = clientOpportunityHref(item);
  assert.match(href, new RegExp(`^/opportunities/${item.opportunity_id}/`));
  assert.doesNotMatch(href, /first-contact|framework-review|plan-preview|deck-center|upload/);
}

const component = readFileSync("src/components/ClientDirectoryPanel.tsx", "utf8");
assert.match(component, /copy\.clients\.all/);
assert.match(component, /copy\.clients\.preMeeting/);
assert.match(component, /copy\.clients\.postMeeting/);
assert.match(component, /copy\.clients\.add/);
assert.match(component, /useDeferredValue/);
assert.doesNotMatch(component, /Preview fixture|CLIENT_DIRECTORY_FIXTURE|item\.preview_fixture/);
assert.doesNotMatch(component, /useRecentWork|RecentLifecycle|journey_stage/);
assert.match(component, /localPreview = previewMode && isLocalUiPreviewAvailable\(\)/);
assert.match(component, /const items = localPreview \? directoryItems/);
assert.match(component, /result\?\.scope === scope \? result\.items : \[\]/);
assert.match(component, /controller\.signal\.aborted/);
assert.match(component, /return \(\) => controller\.abort\(\)/);
assert.match(component, /href=\{clientOpportunityHref\(item\)\}/);

async function run() {
  const originalFetch = globalThis.fetch;
  const id = "12345678-1234-4234-8234-123456789abc";
  const row = {
    id, client_name: "Saved client", opportunity_name: "Saved opportunity", status: "active",
    stage1_intake: { poc_name: "Saved contact", poc_position: "CTO", sales_topic_description: "Saved topic" },
    updated_at: "2026-10-07T12:00:00Z",
  };
  let workflow = {
    opportunity_id: id, current_status: "ppt2_generated",
    steps: [{ key: "first_meeting_completed", state: "completed" }],
  };
  try {
    const requests: string[] = [];
    const controller = new AbortController();
    globalThis.fetch = async (url, init) => {
      requests.push(String(url));
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer token");
      assert.equal(init?.signal, controller.signal);
      assert.equal(init?.cache, "no-store");
      return Response.json(String(url).endsWith("/workflow-status") ? workflow : [row]);
    };
    const [item] = await loadLiveClientDirectory("token", "en", controller.signal);
    assert.equal(requests.length, 2);
    assert.ok(requests[0].endsWith("/opportunities"));
    assert.ok(requests[1].endsWith(`/opportunities/${id}/workflow-status`));
    assert.equal(item.company_name, "Saved client");
    assert.equal(item.contact_person, "Saved contact");
    assert.equal(item.contact_role, "CTO");
    assert.equal(item.engagement_name, "Saved topic");
    assert.equal(item.workflow_status, "ppt_2_generated");
    assert.equal(item.phase, "post_meeting");
    assert.equal(item.preview_fixture, undefined);
    assert.match(item.last_activity, /2026/);
    assert.equal(clientOpportunityHref(item), `/opportunities/${id}/post-meeting-presentation`);

    workflow = { ...workflow, current_status: "first_meeting_completed", steps: [{ key: "first_meeting_completed", state: "current" }] };
    const [beforeMeeting] = await loadLiveClientDirectory("token", "en", controller.signal);
    assert.equal(beforeMeeting.phase, "pre_meeting");
    assert.equal(clientOpportunityHref(beforeMeeting), `/opportunities/${id}/presentations`);
    workflow = { ...workflow, current_status: "transcript_added", steps: [{ key: "first_meeting_completed", state: "completed" }] };
    const [afterMeeting] = await loadLiveClientDirectory("token", "en", controller.signal);
    assert.equal(afterMeeting.phase, "post_meeting");
    assert.equal(clientOpportunityHref(afterMeeting), `/opportunities/${id}/meeting`);
    workflow = { ...workflow, current_status: "ppt1_ready", steps: [] };
    const [firstPitch] = await loadLiveClientDirectory("token", "en", controller.signal);
    assert.equal(firstPitch.workflow_status, "ppt_1_ready");
    assert.equal(clientOpportunityHref(firstPitch), `/opportunities/${id}/presentations`);

    workflow = { ...workflow, opportunity_id: "another-opportunity" };
    await assert.rejects(() => loadLiveClientDirectory("token", "en", controller.signal), /mismatched/);
    workflow = { ...workflow, opportunity_id: id, current_status: "unknown" };
    await assert.rejects(() => loadLiveClientDirectory("token", "en", controller.signal), /incomplete/);

    globalThis.fetch = async () => Response.json([]);
    assert.deepEqual(await loadLiveClientDirectory("token", "en"), []);
    globalThis.fetch = async () => Response.json({ items: [] });
    await assert.rejects(() => loadLiveClientDirectory("token", "en"), /incomplete/);
    globalThis.fetch = async () => Response.json([{ ...row, id: "opp-fixture" }]);
    await assert.rejects(() => loadLiveClientDirectory("token", "en"), /invalid opportunity/);
    for (const status of [401, 403, 500]) {
      globalThis.fetch = async () => new Response("", { status });
      await assert.rejects(() => loadLiveClientDirectory("token", "en"), new RegExp(String(status)));
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log("Client directory live loading, routing, preview isolation and error tests passed");
}
void run().catch((error) => { console.error(error); process.exitCode = 1; });
