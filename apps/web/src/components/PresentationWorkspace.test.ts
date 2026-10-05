import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/components/PresentationWorkspace.tsx", "utf8");

assert.match(source, /PPT #1/);
assert.match(source, /Pre-meeting presentation/);
assert.match(source, /workflow-presentation-grid is-single/);
assert.doesNotMatch(source, /PPT #2|Second meeting|Post-meeting/);

console.log("Pre-meeting presentation surface tests passed");
