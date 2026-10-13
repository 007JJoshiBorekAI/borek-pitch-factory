import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DiscoveryWorkflowStepper } from "./DiscoveryWorkflowStepper.js";
import { discoveryFirstFixtureForOpportunity } from "../lib/discoveryFirstFixtures.js";

const fixture = discoveryFirstFixtureForOpportunity("opp-ms40-sample");
const html = renderToStaticMarkup(
  <DiscoveryWorkflowStepper opportunityId={fixture.opportunity_id} workflow={fixture.workflow} />,
);

assert.match(html, /aria-label="Opportunity workflow"/);
assert.match(html, /aria-current="step"/);
assert.match(html, /Client Information/);
assert.match(html, /Discovery Prepared/);
assert.match(html, /PPT #1 Ready/);
assert.match(html, /First Meeting Completed/);
assert.match(html, /Transcript Added/);
assert.match(html, /PPT #2 Generated/);
assert.match(html, /Owner Review/);
assert.match(html, /Finalized/);
assert.match(html, />Current</);
assert.match(html, />Blocked</);
assert.match(html, /opportunities\/opp-ms40-sample\/client-information/);
assert.doesNotMatch(html, /href="[^"]*(discovery|presentations|meeting|review|follow-up)/);

console.log("MS-40 workflow stepper tests passed");
