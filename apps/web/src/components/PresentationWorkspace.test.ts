import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/components/PresentationWorkspace.tsx", "utf8");

assert.match(source, /PPT #1/);
assert.match(source, /Pre-meeting presentation/);
assert.match(source, /generateAndAwaitFirstPitch/);
assert.match(source, /artifact-preview-workspace presentation-document-workspace/);
assert.match(source, /aria-label="Presentation slides"/);
assert.match(source, /presentation-slide-canvas/);
assert.match(source, /setSelection\(\{ opportunityId, index \}\)/);
assert.match(source, /<progress[^>]*max=\{totalSlides\}[^>]*value=\{readyCount\}/);
assert.match(source, /disabled=\{!downloadable\}/);
assert.match(source, /not a rendered presentation artifact/);
assert.match(source, /PPT #1 generation failed/);
assert.match(source, /Retry PPT #1 generation/);
assert.match(source, /aria-live="polite"/);
assert.match(source, /preview manifest/);
assert.doesNotMatch(source, /PPT #2|Second meeting|Post-meeting/);
assert.doesNotMatch(source, /presentation\/generate/);
assert.doesNotMatch(source, /ppt2\/generate/);

console.log("Pre-meeting presentation surface tests passed");
