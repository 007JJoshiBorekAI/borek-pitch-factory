import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const topBarSource = readFileSync(
  fileURLToPath(new URL("./WorkspaceTopBar.tsx", import.meta.url)),
  "utf8",
);
const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");

assert.match(topBarSource, /aria-expanded=\{profileOpen\}/);
assert.match(topBarSource, /aria-expanded=\{notificationsOpen\}/);
assert.match(topBarSource, /event\.key === "Escape"/);
assert.match(topBarSource, /handlePointerDown/);
assert.match(topBarSource, /openPanel === "profile"/);
assert.match(topBarSource, /openPanel === "notifications"/);
assert.match(topBarSource, /Recent presentations/);
assert.match(topBarSource, /Activity log/);
assert.match(topBarSource, /href="\/archive"/);
assert.match(topBarSource, /SignOutButton/);
assert.match(topBarSource, /No notification feed is configured yet/);
assert.match(topBarSource, /View activity log/);
assert.match(topBarSource, /href="\/activity"/);
assert.match(topBarSource, /workspace-lang-option-active/);
assert.match(topBarSource, /workspace-lang-option-unavailable/);
assert.match(topBarSource, /German UI is not available yet/);
assert.doesNotMatch(topBarSource, /unread/i);
assert.doesNotMatch(topBarSource, /badge/i);
assert.doesNotMatch(topBarSource, /notification feed.*\[|notifications\.map|fakeNotification/i);

assert.match(css, /\.workspace-topbar\s*\{[\s\S]*overflow:\s*visible/);
assert.match(css, /\.workspace-profile-menu\s*\{[\s\S]*z-index:\s*50/);
assert.match(css, /\.workspace-notifications-popover\s*\{[\s\S]*z-index:\s*50/);
assert.match(css, /\.workspace-notifications-button:focus-visible/);

console.log("WorkspaceTopBar interaction tests passed");
