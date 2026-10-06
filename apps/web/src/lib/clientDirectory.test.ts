import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CLIENT_DIRECTORY_FIXTURE,
  CLIENT_STATUS_LABELS,
  clientOpportunityHref,
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
assert.match(component, /Preview fixture/);
assert.doesNotMatch(component, /useRecentWork|RecentLifecycle|journey_stage/);

console.log("Refreshed client directory tests passed");
