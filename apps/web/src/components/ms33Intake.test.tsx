import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Stage1IntakePanel } from "./Stage1IntakePanel.js";
import { Stage1NextStepsAside } from "./Stage1NextStepsAside.js";

const firstContactHtml = renderToStaticMarkup(
  <Stage1IntakePanel
    disabled={false}
    existingIntake={{
      client_web_page: "https://example.com",
      poc_name: "Ada Lovelace",
      poc_position: "Operations lead",
      sales_topic_description: "Explore invoice matching",
      about_company: "Regional equipment distributor.",
    }}
    accessToken="token"
    opportunityId="opp-1"
    showSaveAction
    onSave={async () => undefined}
  />,
);

assert.match(firstContactHtml, /Pre-meeting information/);
assert.match(firstContactHtml, /Prepare for the first meeting/);
assert.match(firstContactHtml, /meeting transcript is not required/i);
assert.match(firstContactHtml, /Client website/);
assert.match(firstContactHtml, /POC name/);
assert.match(firstContactHtml, /POC position/);
assert.match(firstContactHtml, /Sales topic description/);
assert.match(firstContactHtml, /About company/);
assert.match(firstContactHtml, /4,000 recommended/);
assert.match(firstContactHtml, /Save pre-meeting information/);
assert.match(firstContactHtml, /Upload recording/);
assert.doesNotMatch(firstContactHtml, /Coming soon/i);
assert.doesNotMatch(firstContactHtml, /Upload or drag files here/i);

const draftHtml = renderToStaticMarkup(
  <Stage1IntakePanel disabled={false} existingIntake={null} draftValues={{
    client_web_page: "",
    poc_name: "",
    poc_position: "",
    sales_topic_description: "",
    about_company: "",
  }} />,
);
assert.match(draftHtml, /Create the opportunity first to upload/i);

const asideHtml = renderToStaticMarkup(<Stage1NextStepsAside />);
assert.match(asideHtml, /What happens next/);
assert.match(asideHtml, /Company brief/);
assert.match(asideHtml, /Nothing is sent automatically/);

const uploadPanelSource = readFileSync(
  fileURLToPath(new URL("./TranscriptUploadPanel.tsx", import.meta.url)),
  "utf8",
);
assert.match(uploadPanelSource, /PreMeetingIntakeView/);
assert.match(uploadPanelSource, /isFirstContact/);
assert.match(uploadPanelSource, /first-contact\/review/);
assert.doesNotMatch(uploadPanelSource, /Next step not available yet/);

const firstContactBlock = uploadPanelSource.slice(
  uploadPanelSource.indexOf("if (isFirstContact)"),
  uploadPanelSource.indexOf("return (\n    <WorkspaceShell>\n      <div className=\"app-shell app-workspace-body\">"),
);
assert.match(firstContactBlock, /PreMeetingIntakeView/);
assert.doesNotMatch(firstContactBlock, /FileUploadQueue/);

const deepeningBlock = uploadPanelSource.slice(uploadPanelSource.indexOf("!isFirstContact ? ("));
assert.match(deepeningBlock, /MeetingFeedbackPanel/);
assert.match(deepeningBlock, /Transcript files/);
assert.match(deepeningBlock, /FileUploadQueue/);
assert.match(deepeningBlock, /Optional client documents/);

const apiSource = readFileSync(
  fileURLToPath(new URL("../lib/api.ts", import.meta.url)),
  "utf8",
);
assert.match(apiSource, /interface Stage1Intake/);
assert.match(apiSource, /uploadStage1Voice/);
assert.match(apiSource, /stage1_intake\?: Stage1Intake/);

console.log("MS-33 intake UI tests passed");
