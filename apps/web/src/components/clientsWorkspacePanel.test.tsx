import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const panelSource = readFileSync(
  fileURLToPath(new URL("./ClientsWorkspacePanel.tsx", import.meta.url)),
  "utf8",
);
const pageSource = readFileSync(
  fileURLToPath(new URL("../app/clients/page.tsx", import.meta.url)),
  "utf8",
);
const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");

assert.match(panelSource, /clients-page/);
assert.match(panelSource, /Add new client/);
assert.match(panelSource, /Search clients/);
assert.match(panelSource, /clients-search-icon/);
assert.match(css, /\.clients-search-icon/);
assert.match(panelSource, /All clients/);
assert.match(panelSource, /Pre-meeting/);
assert.match(panelSource, /Post-meeting/);
assert.match(panelSource, /listOpportunities/);
assert.match(panelSource, /listRecentWork/);
assert.match(panelSource, /buildClientDirectory/);
assert.match(panelSource, /filterClientDirectoryRows/);
assert.match(panelSource, /summarizeClientDirectory/);
assert.match(panelSource, /Loading clients/);
assert.match(panelSource, /newClientWorkflowState/);
assert.match(panelSource, /clients-new-client-state/);
assert.match(panelSource, /WorkflowStateCard/);
assert.match(panelSource, /No matching clients/);
assert.match(panelSource, /Retry/);
assert.match(panelSource, /href="\/upload\?new=1"/);
assert.match(pageSource, /ClientsWorkspacePanel/);
assert.match(pageSource, /activeSection="clients"/);
assert.doesNotMatch(pageSource, /FIGMA-04 placeholder/);
assert.match(css, /\.clients-table/);
assert.match(css, /\.clients-filter-button-active/);

console.log("FIGMA-04 clients workspace panel tests passed");
