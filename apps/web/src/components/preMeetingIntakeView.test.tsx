import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PreMeetingIntakeView } from "./PreMeetingIntakeView.js";

const html = renderToStaticMarkup(
  <PreMeetingIntakeView
    disabled={false}
    accessToken="token"
    opportunity={null}
    opportunityId={null}
    onCreateOpportunity={async () => "opp-1"}
    onSaveStage1Intake={async () => undefined}
    onNavigateToReview={() => undefined}
  />,
);

assert.match(html, /PRE-MEETING/);
assert.match(html, /One submission creates both/);
assert.match(html, /Client information/);
assert.match(html, /Pitch information/);
assert.match(html, /Sales opportunity/);
assert.match(html, /Add pitch files/);
assert.match(html, /Additional opportunity information/);
assert.match(html, /Create client &amp; pitch|Create client & pitch/);
assert.match(html, /Pitch generation usually takes about 6 minutes/);
assert.doesNotMatch(html, /Next step not available yet/);
assert.doesNotMatch(html, /Start a new pitch/);

const viewSource = readFileSync(
  fileURLToPath(new URL("./PreMeetingIntakeView.tsx", import.meta.url)),
  "utf8",
);
const css = readFileSync(
  fileURLToPath(new URL("../app/globals.css", import.meta.url)),
  "utf8",
);

assert.match(viewSource, /const departmentInputRef = useRef<HTMLInputElement>\(null\)/);
assert.match(viewSource, /setAdditionalOpen\(true\)/);
assert.match(viewSource, /setDepartmentFocusRequested\(true\)/);
assert.match(viewSource, /input\.focus\(\{ preventScroll: true \}\)/);
assert.match(viewSource, /ref=\{departmentInputRef\}/);
assert.match(viewSource, /aria-invalid=\{departmentNeedsAttention\}/);
assert.match(viewSource, /open=\{additionalExpanded\}/);
assert.match(viewSource, /const additionalExpanded = additionalOpen \|\| departmentNeedsAttention/);
assert.doesNotMatch(viewSource, /setError\(validationError\)/);
assert.match(viewSource, /sourceDocumentCount = processedDocumentCount \+ stagedFiles\.length/);

assert.match(css, /\.pre-meeting-form\s*\{[\s\S]*?height:\s*718px;/);
assert.match(css, /\.pre-meeting-form-expanded\s*\{[\s\S]*?height:\s*auto;[\s\S]*?min-height:\s*718px;/);
assert.match(css, /\.pre-meeting-field input\[aria-invalid="true"\]/);
assert.match(css, /\.pre-meeting-workflow-state\.workflow-state-embedded\s*\{[\s\S]*?min-height:\s*156px;/);

console.log("FIGMA-03 pre-meeting view tests passed");
