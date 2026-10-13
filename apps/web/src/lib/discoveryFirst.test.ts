import assert from "node:assert/strict";

import {
  DISCOVERY_PAGE_CATALOG,
  DiscoveryFirstContractError,
  PRESENTATION_FAMILIES,
  WORKFLOW_STATUS_CATALOG,
  parseDiscoveryFirstWorkspaceFixture,
} from "./discoveryFirst.js";
import { discoveryFirstFixtureForOpportunity } from "./discoveryFirstFixtures.js";

const fixture = discoveryFirstFixtureForOpportunity("opp-ms40-sample");

assert.equal(fixture.opportunity_id, "opp-ms40-sample");
assert.equal(fixture.source, "fixture");
assert.deepEqual(
  fixture.discovery.pages.map(({ id }) => id),
  DISCOVERY_PAGE_CATALOG.map(({ id }) => id),
);
assert.deepEqual(
  fixture.presentations.map(({ family }) => family),
  PRESENTATION_FAMILIES,
);
assert.deepEqual(
  WORKFLOW_STATUS_CATALOG.map(({ label }) => label),
  [
    "Client Information",
    "Discovery Prepared",
    "PPT #1 Ready",
    "First Meeting Completed",
    "Transcript Added",
    "PPT #2 Generated",
    "Owner Review",
    "Finalized",
  ],
);
assert.equal(Object.keys(fixture.client_information).length, 5);
assert.equal(Object.keys(fixture.meeting_extraction).length, 8);
assert.throws(
  () => parseDiscoveryFirstWorkspaceFixture({ ...fixture, presentations: [] }),
  DiscoveryFirstContractError,
);
assert.throws(
  () =>
    parseDiscoveryFirstWorkspaceFixture({
      ...fixture,
      discovery: { ...fixture.discovery, pages: fixture.discovery.pages.slice(0, 6) },
    }),
  DiscoveryFirstContractError,
);
assert.throws(() => discoveryFirstFixtureForOpportunity(" "), /explicit opportunity ID/);

console.log("MS-40 discovery-first contract tests passed");
