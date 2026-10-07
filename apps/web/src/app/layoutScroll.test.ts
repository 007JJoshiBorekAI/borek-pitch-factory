import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const css = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8").replace(/\r\n/g, "\n");
const globals = css("./globals.css");
const shell = css("./pitch-shell.css");

function rule(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `missing rule: ${selector}`);
  return source.slice(start, source.indexOf("}", start) + 1);
}

// One scroll model: the document scrolls vertically; nothing locks the root or the workspace height.
for (const selector of ["html:has(.app-workspace),\nbody:has(.app-workspace)", ".app-workspace:has(.pitch-sidebar)"]) {
  const body = rule(shell, selector);
  assert.doesNotMatch(body, /overflow(-y)?:\s*(hidden|clip)/, `${selector} must not clip vertically`);
  assert.doesNotMatch(body, /[^-]height:\s*100d?vh/, `${selector} must not be locked to the viewport height`);
}
assert.match(rule(shell, ".app-workspace:has(.pitch-sidebar)"), /min-height:\s*100vh/);
assert.doesNotMatch(`${globals}\n${shell}`, /(^|\n)\s*(html|body)\s*\{[^}]*overflow(-y)?:\s*hidden/, "html/body must stay scrollable");

// The sidebar is the only pinned region and scrolls on its own when it is taller than the viewport.
const sidebar = rule(shell, ".pitch-sidebar");
assert.match(sidebar, /position:\s*sticky/);
assert.match(sidebar, /height:\s*100vh/);
assert.match(sidebar, /overflow-y:\s*auto/);

// A visually hidden form control must not inherit the 100% width of form inputs (it widened the page).
const hidden = rule(globals, ".app-workspace :is(input, select, textarea).sr-only");
assert.match(hidden, /width:\s*1px/);
assert.ok(globals.indexOf(".app-workspace :is(input, select, textarea).sr-only") > globals.indexOf(".sr-only {"));
assert.match(readFileSync(fileURLToPath(new URL("../components/ClientInformationEditor.tsx", import.meta.url)), "utf8"),
  /className="sr-only" type="file"/, "the file inputs this guards are still visually hidden");

// The Discovery/Presentation columns use fractions that add up to at least 1, so no width is left unused.
const grid = rule(shell, ".artifact-preview-workspace .workflow-artifact-grid");
const fractions = [...grid.matchAll(/(\d*\.?\d+)fr/g)].map((match) => Number(match[1]));
assert.equal(fractions.length, 2);
assert.ok(fractions.reduce((sum, value) => sum + value, 0) >= 1, "column fractions below 1 leave a gap beside the preview");
assert.match(grid, /minmax\(0, \d+fr\)/, "the preview column may shrink below its content");

// Text placed directly in the unpadded preview panel keeps the panel inset.
assert.match(shell, /\.discovery-document-workspace \.workflow-preview-panel > \.discovery-gate-copy \{ padding: 10px 20px 0; \}/);
assert.match(shell, /\.discovery-page-label \.workflow-page-number \{ flex: none; \}/);

// The wizard connector is in flow, so it shortens instead of running through a step label.
const connector = rule(shell, ".premeeting-create-steps li:not(:last-child)::after");
assert.doesNotMatch(connector, /position:\s*absolute/);
assert.match(connector, /flex:\s*0 1 calc\(46% - 20px\)/);
assert.match(connector, /min-width:\s*0/);
assert.match(rule(shell, ".premeeting-create-steps li > strong"), /flex:\s*none/);

// Login is one full-screen frame on the two-column layout: the artwork fills the height the message
// block leaves, so the page height never depends on the artwork's width.
const loginStart = shell.indexOf("@media (min-width: 961px) {\n  .auth-layout {");
assert.notEqual(loginStart, -1, "missing two-column login viewport rules");
const login = shell.slice(loginStart, shell.indexOf("\n}\n", loginStart));
const inLogin = (selector: string) => {
  const start = login.indexOf(`  ${selector} {`);
  assert.notEqual(start, -1, `missing login rule: ${selector}`);
  return login.slice(start, login.indexOf("}", start) + 1);
};
assert.match(inLogin(".auth-layout"), /min-height:\s*100dvh/);
assert.match(inLogin(".auth-brand"), /display:\s*flex/);
assert.match(inLogin(".auth-brand"), /flex-direction:\s*column/);
const visual = inLogin(".auth-brand-visual");
assert.match(visual, /flex:\s*1 1 0/);
assert.match(visual, /min-height:\s*0/);
assert.match(visual, /aspect-ratio:\s*auto/, "a width-derived artwork height is what pushed the page past the viewport");
const artwork = inLogin(".auth-artwork");
assert.match(artwork, /position:\s*absolute/);
assert.match(artwork, /object-fit:\s*cover/, "the artwork is cropped, never stretched");
const message = inLogin(".auth-brand-message");
assert.match(message, /flex:\s*none/);
assert.match(message, /min-height:\s*49\.3dvh/, "the message block keeps its 505/1024 share of the design frame");
assert.doesNotMatch(login, /overflow(-y)?:\s*(hidden|auto|scroll)/, "the login fix must not clip or add inner scrolling");
assert.doesNotMatch(login, /display:\s*none|visibility:\s*hidden|font-size/, "nothing is hidden or shrunk to make it fit");
assert.ok(loginStart > shell.indexOf(".auth-brand-message {"), "the viewport rules come after the base login rules");
// Below the two-column breakpoint the stacked login layout keeps its own sizing.
assert.match(shell, /@media \(max-width: 960px\) \{[\s\S]*?\.auth-layout \{\s*display: block;/);

// The development preview badge floats above the page and never takes part in layout or blocks clicks.
const badge = rule(shell, ".dev-preview-badge");
assert.match(badge, /position:\s*fixed/);
assert.match(badge, /pointer-events:\s*none/);

console.log("Layout and scroll regression tests passed");
