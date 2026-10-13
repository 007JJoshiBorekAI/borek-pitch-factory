import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkflowArtifactTabs } from "./WorkflowArtifactTabs";

const tabs = readFileSync("src/components/WorkflowArtifactTabs.tsx", "utf8");
const discovery = tabs.indexOf('id: "discovery"');
const presentations = tabs.indexOf('id: "presentations"');

assert.ok(discovery >= 0 && presentations > discovery, "artifact tabs keep a stable order");
assert.doesNotMatch(tabs, /\.sort\(/);
assert.match(tabs, /ArrowRight/);
assert.match(tabs, /ArrowLeft/);
assert.match(tabs, /aria-controls/);
assert.match(tabs, /tabIndex=/);

for (const active of ["discovery", "presentations"] as const) {
  const html = renderToStaticMarkup(createElement(WorkflowArtifactTabs, { opportunityId: "opp-tabs", active }));
  assert.ok(html.indexOf('id="artifact-tab-discovery"') < html.indexOf('id="artifact-tab-presentations"'));
  assert.match(html, new RegExp(`id="artifact-tab-${active}"[^>]*aria-selected="true"`));
}

console.log("Artifact tab accessibility tests passed");
