import assert from "node:assert/strict";

import { createDiscoveryWorkspaceFixture } from "./discoveryWorkspace.js";
import {
  EMPTY_PREVIEW_JOURNEY,
  parsePreviewJourney,
  previewClientRecord,
  previewDirectoryItem,
  previewOpportunityId,
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
const opportunity: PreviewOpportunity = {
  opportunity_id: opportunityId,
  created_at: "2026-10-05T00:00:00.000Z",
  updated_at: "2026-10-05T00:00:00.000Z",
  client,
  discovery: createDiscoveryWorkspaceFixture(opportunityId),
  presentation: { state: "waiting", version_id: null, source_discovery_version_id: null, slide_count: 0 },
  workflow: {
    revision: 1,
    current_status: "discovery_prepared",
    completed_statuses: ["client_information"],
    blocked_reason: null,
    available_actions: [],
  },
};
const directory = previewDirectoryItem(opportunity);
assert.equal(directory.company_name, "Borek Test GmbH");
assert.equal(directory.workflow_status, "discovery_prepared");
assert.equal(parsePreviewJourney(null), EMPTY_PREVIEW_JOURNEY);
assert.equal(parsePreviewJourney({ schema_version: "1.0", opportunities: { [opportunityId]: opportunity } }).opportunities[opportunityId].opportunity_id, opportunityId);

console.log("Connected pre-meeting preview store tests passed");
