import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const navSource = readFileSync(
  fileURLToPath(new URL("../lib/workspaceShellNav.ts", import.meta.url)),
  "utf8",
);
const sidebarSource = readFileSync(
  fileURLToPath(new URL("./WorkspaceSidebar.tsx", import.meta.url)),
  "utf8",
);
const topBarSource = readFileSync(
  fileURLToPath(new URL("./WorkspaceTopBar.tsx", import.meta.url)),
  "utf8",
);
const shellSource = readFileSync(
  fileURLToPath(new URL("./WorkspaceShell.tsx", import.meta.url)),
  "utf8",
);
const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");

assert.match(sidebarSource, /borek-logo\.svg/);
assert.match(sidebarSource, /AI PITCH/);
assert.match(navSource, /Pre-meeting/);
assert.match(navSource, /Post-meeting/);
assert.match(navSource, /Clients/);
assert.match(sidebarSource, /workspace-sidebar-active-rail/);

assert.match(topBarSource, /workspace-topbar-splash/);
assert.match(topBarSource, /\bDE\b/);
assert.match(topBarSource, /\bEN\b/);
assert.match(topBarSource, /workspace-notifications\.svg/);
assert.match(topBarSource, /workspace-chevron-down\.svg/);
assert.match(topBarSource, /Notifications \(not available yet\)/);
assert.match(topBarSource, /href="\/archive"/);

assert.match(shellSource, /WorkspaceSidebar/);
assert.match(shellSource, /WorkspaceTopBar/);

assert.match(css, /--shell-sidebar-width:\s*216px/);
assert.match(css, /--shell-topbar-height:\s*70px/);
assert.match(css, /--shell-content-gutter:\s*48px/);
assert.match(css, /--shell-action-active:\s*#124f94/);
assert.match(css, /--font-body:\s*var\(--font-inter\)/);

console.log("FIGMA-02 workspace shell component tests passed");
