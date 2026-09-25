import assert from "node:assert/strict";
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

console.log("FIGMA-03 pre-meeting view tests passed");
