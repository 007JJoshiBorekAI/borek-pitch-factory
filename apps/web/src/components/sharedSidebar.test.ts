import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const header = readFileSync("src/components/SiteHeader.tsx", "utf8");
const clients = readFileSync("src/components/ClientDirectoryPanel.tsx", "utf8");
const shell = readFileSync("src/components/OpportunityWorkflowShell.tsx", "utf8");
const language = readFileSync("src/components/LanguageProvider.tsx", "utf8");
const css = readFileSync("src/app/pitch-shell.css", "utf8");

assert.match(header, /AI Pitch/);
assert.match(header, /\/opportunities\/new\/client-information/);
assert.match(header, /\/clients\?phase=post_meeting/);
assert.match(header, /id: "clients", href: "\/clients"/);
assert.doesNotMatch(header, /Overview|Approvals|Library/);
assert.match(language, /preMeeting: "Pre-meeting"/);
assert.match(language, /postMeeting: "Post-meeting"/);
assert.match(language, /preMeeting: "Vor dem Meeting"/);
assert.match(header, /pitch-language-switch/);

assert.match(clients, /searchParams\.get\("phase"\)/);
assert.match(clients, /activeSection=\{phase === "all" \? "clients" : phase\}/);
assert.match(shell, /"client_information", "discovery_prepared", "ppt_1_ready"/);
assert.match(css, /\.pitch-sidebar-product/);
assert.match(css, /@media \(max-width: 960px\)[\s\S]*?\.pitch-sidebar nav ul/);

console.log("Shared sidebar tests passed");
