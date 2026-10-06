import assert from "node:assert/strict";

import { createDiscoveryWorkspaceFixture, createFixtureDiscoveryWorkspaceAdapter } from "./discoveryWorkspace.js";
import { presentationPreview } from "./presentationPreview.js";
import {
  EMPTY_PREVIEW_JOURNEY,
  parsePreviewJourney,
  previewClientRecord,
  previewDirectoryItem,
  previewOpportunityId,
  withPresentationAdvanced,
  withApprovedDiscovery,
  withPresentationCompleted,
  withPresentationFailed,
  withPresentationStarted,
  withUpdatedDiscovery,
  type PreviewOpportunity,
} from "./previewJourney.js";

const opportunityId = previewOpportunityId("Borek Test GmbH");
assert.match(opportunityId, /^opp-borek-test-gmbh-/);

const client = previewClientRecord(opportunityId, {
  company_name: "Borek Test GmbH",
  contact_person: "Mira Koch",
  website_url: "https://example.com",
  meeting_purpose: "Prepare first meeting",
  additional_information: "Preview only",
});
let opportunity: PreviewOpportunity = {
  opportunity_id: opportunityId,
  created_at: "2026-10-05T00:00:00.000Z",
  updated_at: "2026-10-05T00:00:00.000Z",
  client,
  discovery: createDiscoveryWorkspaceFixture(opportunityId),
  presentation: { state: "waiting", version_id: null, source_discovery_version_id: null, slide_count: 0 },
  workflow: {
    revision: 1,
    current_status: "client_information",
    completed_statuses: [],
    blocked_reason: null,
    available_actions: [],
  },
};
const directory = previewDirectoryItem(opportunity);
assert.deepEqual(presentationPreview(null), []);
assert.deepEqual(presentationPreview(opportunity), [], "unapproved drafts cannot supply slide previews");
assert.equal(directory.company_name, "Borek Test GmbH");
assert.equal(directory.workflow_status, "client_information");
assert.equal(parsePreviewJourney(null), EMPTY_PREVIEW_JOURNEY);
assert.equal(parsePreviewJourney({ schema_version: "1.0", opportunities: { [opportunityId]: opportunity } }).opportunities[opportunityId].opportunity_id, opportunityId);

async function transitions() {
  const ready = createDiscoveryWorkspaceFixture(opportunityId, Array(7).fill("ready"));
  opportunity = withUpdatedDiscovery(opportunity, ready);
  assert.equal(opportunity.workflow.current_status, "discovery_prepared");
  assert.deepEqual(opportunity.workflow.completed_statuses, ["client_information"]);

  const adapter = createFixtureDiscoveryWorkspaceAdapter(ready);
  const approved = await adapter.approve({
    opportunity_id: opportunityId,
    version_id: ready.version_id,
    expected_revision: ready.revision,
  });
  opportunity = withApprovedDiscovery(opportunity, approved);
  assert.equal(opportunity.workflow.current_status, "discovery_prepared", "approval is not PPT readiness");
  assert.equal(opportunity.approved_discovery?.version_id, "discovery-v1");

  const successor = await adapter.createSuccessor({
    opportunity_id: opportunityId,
    approved_version_id: approved.version_id,
  });
  opportunity = withUpdatedDiscovery(opportunity, successor);
  opportunity.discovery.pages[0].body = "Unapproved successor content";
  assert.equal(opportunity.discovery.version_id, "discovery-v2");
  assert.equal(opportunity.approved_discovery?.version_id, "discovery-v1");

  opportunity = withPresentationStarted(opportunity);
  assert.equal(opportunity.presentation.state, "generating");
  assert.equal(opportunity.presentation.source_discovery_version_id, "discovery-v1", "generation binds to the exact approved source");
  for (let slide = 1; slide <= 7; slide += 1) {
    opportunity = withPresentationAdvanced(opportunity);
    assert.equal(opportunity.presentation.slide_count, slide);
    const preview = presentationPreview(opportunity);
    assert.equal(preview.length, 7);
    assert.equal(preview.filter((page) => page.state === "ready").length, slide);
    assert.equal(preview[0].body, approved.pages[0].body, "preview must not use successor edits");
    if (slide < 7) assert.equal(preview[slide].state, "generating");
  }
  assert.equal(opportunity.presentation.state, "ready");

  const v1 = structuredClone(opportunity);
  assert.equal(v1.presentation.version_id, "ppt-1-v1");
  const approvedV2 = structuredClone(approved);
  approvedV2.version_id = "discovery-v2";
  approvedV2.pages[0].title = "Approved v2 cover";
  approvedV2.pages[0].body = "New approved v2 content";
  let reapproved = withApprovedDiscovery(v1, approvedV2);
  assert.deepEqual(reapproved.presentation, v1.presentation, "approval must not relabel an already generated deck");
  assert.deepEqual(reapproved.workflow, v1.workflow, "approval must not erase PPT readiness");
  assert.deepEqual(presentationPreview(reapproved), presentationPreview(v1), "v1 still displays v1 after v2 approval");
  reapproved = parsePreviewJourney(JSON.parse(JSON.stringify({ schema_version: "1.0", opportunities: { [opportunityId]: reapproved } }))).opportunities[opportunityId];
  assert.equal(presentationPreview(reapproved)[0].body, approved.pages[0].body, "pinned content survives storage reload");
  const regenerated = withPresentationStarted(reapproved);
  assert.equal(regenerated.presentation.version_id, "ppt-1-v2");
  assert.equal(regenerated.presentation.source_discovery_version_id, "discovery-v2");
  assert.equal(regenerated.presentation.slide_count, 0, "only explicit generation replaces the deck");
  assert.equal(withPresentationStarted(regenerated), regenerated, "inflight generation cannot be restarted");
  const v2 = withPresentationCompleted(regenerated);
  assert.equal(v2.presentation.state, "ready");
  assert.equal(v2.presentation.version_id, "ppt-1-v2");
  assert.equal(presentationPreview(v2)[0].body, "New approved v2 content");
  assert.equal(presentationPreview(v1)[0].body, approved.pages[0].body, "new generations must not mutate old snapshots");

  const inflightV1 = withPresentationStarted({ ...v1, presentation: { state: "waiting", version_id: null, source_discovery_version_id: null, slide_count: 0 } });
  const approvedDuringGeneration = withApprovedDiscovery(inflightV1, approvedV2);
  assert.deepEqual(approvedDuringGeneration.presentation, inflightV1.presentation);
  const completedV1 = withPresentationCompleted(approvedDuringGeneration);
  assert.equal(completedV1.presentation.state, "ready", "a newer approval must not strand an inflight generation");
  assert.equal(completedV1.presentation.source_discovery_version_id, "discovery-v1");
  assert.equal(presentationPreview(completedV1)[0].body, approved.pages[0].body);

  const legacyV1 = structuredClone(v1);
  delete legacyV1.presentation.source_discovery;
  delete legacyV1.presentation.version_number;
  const migratedV1 = withApprovedDiscovery(legacyV1, approvedV2);
  assert.equal(presentationPreview(migratedV1)[0].body, approved.pages[0].body, "legacy matching source is captured before approval changes");
  assert.equal(withPresentationStarted(migratedV1).presentation.version_id, "ppt-1-v2");
  const lostLegacySource = { ...legacyV1, approved_discovery: approvedV2 };
  assert.deepEqual(presentationPreview(lostLegacySource), [], "never fabricate historical content when the persisted source is already lost");

  opportunity = withPresentationStarted({ ...opportunity, presentation: { ...opportunity.presentation, state: "waiting" } });
  const failed = withPresentationFailed(opportunity);
  assert.equal(failed.presentation.state, "failed");
  assert.equal(presentationPreview(failed)[0].state, "failed");
  assert.deepEqual(presentationPreview({ ...opportunity, presentation: { ...opportunity.presentation, source_discovery_version_id: "different-version" } }), []);
  opportunity = withPresentationStarted(failed);
  opportunity = withPresentationCompleted(opportunity);
  assert.equal(opportunity.presentation.state, "ready");
  assert.equal(opportunity.presentation.source_discovery_version_id, "discovery-v1");
  assert.equal(opportunity.workflow.current_status, "ppt_1_ready");
  assert.deepEqual(opportunity.workflow.completed_statuses, ["client_information", "discovery_prepared", "ppt_1_ready"]);

  const legacy = structuredClone(opportunity);
  delete legacy.approved_discovery;
  legacy.discovery = approved;
  delete legacy.discovery.pdf_source_revision;
  const migrated = parsePreviewJourney({ schema_version: "1.0", opportunities: { [opportunityId]: legacy } });
  assert.equal(migrated.opportunities[opportunityId].approved_discovery?.version_id, approved.version_id);
}

void transitions().then(() => console.log("Connected pre-meeting preview store tests passed")).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
