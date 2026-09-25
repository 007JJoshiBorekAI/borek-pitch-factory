import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PostMeetingIntakeView } from "./PostMeetingIntakeView.js";

const html = renderToStaticMarkup(
  <PostMeetingIntakeView
    disabled={false}
    accessToken="token"
    opportunity={{
      id: "opp-1",
      client_name: "Acme GmbH",
      opportunity_name: "First meeting",
      department: "Sales",
      language: "en",
      pii_redaction_enabled: true,
      status: "active",
    }}
    opportunityId="opp-1"
    queueItems={[]}
    uploadSummary={null}
    canUpload
    onQueueItemsChange={() => undefined}
    onUploadBatch={async () => undefined}
    onNavigateToReview={() => undefined}
  />,
);

assert.match(html, /POST-MEETING/);
assert.match(html, /Add the meeting/);
assert.match(html, /Meeting input/);
assert.match(html, /Generate \+ review/);
assert.match(html, /Jamie\.ai/);
assert.match(html, /Upload transcript/);
assert.match(html, /Type notes/);
assert.match(html, /MEETING FEEDBACK/);
assert.match(html, /ADDITIONAL INFORMATION/);
assert.match(html, /Other meeting information/);
assert.match(html, /Generate Email/);
assert.match(html, /is-disabled/);
assert.match(html, /Review Stage 2 outputs before sending email/);

const uploadPanelSource = readFileSync(
  fileURLToPath(new URL("./TranscriptUploadPanel.tsx", import.meta.url)),
  "utf8",
);
assert.match(uploadPanelSource, /PostMeetingIntakeView/);
assert.match(uploadPanelSource, /isDeepening/);
assert.match(uploadPanelSource, /deepening\/review/);
assert.match(uploadPanelSource, /initialJourneyStage/);

const uploadPageSource = readFileSync(
  fileURLToPath(new URL("../app/upload/page.tsx", import.meta.url)),
  "utf8",
);
assert.match(uploadPageSource, /parseJourneyStageQuery/);
assert.match(uploadPageSource, /initialJourneyStage/);

const normalizedUploadPanel = uploadPanelSource.replace(/\r\n/g, "\n");
const deepeningReturnStart = normalizedUploadPanel.indexOf("if (isDeepening) {");
assert.notEqual(deepeningReturnStart, -1);
const legacyReturnStart = normalizedUploadPanel.indexOf(
  'return (\n    <WorkspaceShell>\n      <div className="app-shell app-workspace-body">',
  deepeningReturnStart + 1,
);
assert.notEqual(legacyReturnStart, -1);
const deepeningBlock = normalizedUploadPanel.slice(deepeningReturnStart, legacyReturnStart);
assert.match(deepeningBlock, /PostMeetingIntakeView/);
assert.match(deepeningBlock, /post-meeting-workspace/);
assert.match(deepeningBlock, /activeSection="post-meeting"/);
assert.doesNotMatch(deepeningBlock, /WorkflowActionBar/);

console.log("FIGMA-05 post-meeting view tests passed");
