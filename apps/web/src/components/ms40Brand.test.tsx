import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { WorkflowArtifactTabs } from "./WorkflowArtifactTabs.js";

const tabs = renderToStaticMarkup(
  <WorkflowArtifactTabs opportunityId="opp-ms40-sample" active="discovery" />,
);
assert.match(tabs, /role="tablist"/);
assert.match(tabs, /role="tab"/);
assert.match(tabs, /aria-selected="true"/);
assert.match(tabs, /Discovery Document/);
assert.match(tabs, /Presentation/);
assert.match(tabs, /opportunities\/opp-ms40-sample\/discovery/);

const appRoot = fileURLToPath(new URL("../app/", import.meta.url));
const css = readFileSync(`${appRoot}pitch-shell.css`, "utf8");
const globals = readFileSync(`${appRoot}globals.css`, "utf8");
const authShell = readFileSync(fileURLToPath(new URL("./AuthShell.tsx", import.meta.url)), "utf8");
const authLanguage = readFileSync(fileURLToPath(new URL("./LanguageProvider.tsx", import.meta.url)), "utf8");
const authCard = readFileSync(fileURLToPath(new URL("./AuthCard.tsx", import.meta.url)), "utf8");
const homePage = readFileSync(`${appRoot}page.tsx`, "utf8");
const clients = readFileSync(fileURLToPath(new URL("./ClientDirectoryPanel.tsx", import.meta.url)), "utf8");

assert.match(authLanguage, /Prepare the right conversation\./);
assert.match(authLanguage, /Bereiten Sie das richtige Gespräch vor\./);
assert.match(authLanguage, /From client research to an approved follow-up/);
assert.match(authCard, /aria-pressed=\{language === "en"\}/);
assert.match(authCard, /setLanguage\("de"\)/);
assert.match(authLanguage, /document\.documentElement\.lang = next/);
assert.match(authLanguage, /localStorage\.setItem\("borek-language"/);
assert.match(css, /\.auth-artwork/);
assert.match(css, /\.workflow-artifact-tabs \[role="tab"\]:focus-visible/);
assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.workflow-standard-page/);
assert.match(globals, /--font-body:\s*Inter/);
assert.match(homePage, /redirect\("\/clients"\)/);
assert.match(clients, /clientOpportunityHref\(item\)/);

for (const route of ["discovery", "presentations", "meeting", "review", "follow-up"]) {
  const source = readFileSync(`${appRoot}opportunities/[opportunityId]/${route}/page.tsx`, "utf8");
  assert.doesNotMatch(source, /Gamma|concretisation|Send email/i, route);
}

for (const route of [
  "upload",
  "first-contact",
  "first-meeting",
  "opportunity",
  "create-pitch",
  "meeting-preparation",
  "pitch-review",
  "framework-review",
  "plan-preview",
  "deck-center",
  "followup-review",
  "activity",
  "approvals",
  "archive",
  "register",
]) {
  assert.equal(existsSync(`${appRoot}${route}/page.tsx`), false, `${route} must not remain routable`);
}

console.log("MS-40 brand and workflow surface tests passed");
