import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ClientDocumentUploadPanel } from "./ClientDocumentUploadPanel.js";
import { Stage1IntakePanel } from "./Stage1IntakePanel.js";

const panelHtml = renderToStaticMarkup(
  <ClientDocumentUploadPanel accessToken="token" opportunityId="opp-1" disabled={false} />,
);

assert.match(panelHtml, /Client documents/);
assert.match(panelHtml, /Meeting transcripts are added after the first call/i);
assert.match(panelHtml, /PDF, DOCX, or TXT/i);
assert.match(panelHtml, /10 MB/i);
assert.match(panelHtml, /Choose files/);
assert.doesNotMatch(panelHtml, /storage_path/i);
assert.doesNotMatch(panelHtml, /\d+%/);

const panelSource = readFileSync(
  fileURLToPath(new URL("./ClientDocumentUploadPanel.tsx", import.meta.url)),
  "utf8",
);
assert.match(panelSource, /Remove document/);
assert.match(panelSource, /role="dialog"/);
assert.doesNotMatch(panelSource, /\d+%/);
assert.match(panelSource, /document\.processing_status/);

const gatedHtml = renderToStaticMarkup(
  <ClientDocumentUploadPanel accessToken={null} opportunityId={null} disabled={false} />,
);
assert.match(gatedHtml, /Create an opportunity above/i);

const intakeHtml = renderToStaticMarkup(
  <Stage1IntakePanel
    disabled={false}
    existingIntake={null}
    accessToken="token"
    opportunityId="opp-1"
    draftValues={{
      client_web_page: "",
      poc_name: "",
      poc_position: "",
      sales_topic_description: "",
      about_company: "",
    }}
  />,
);
assert.doesNotMatch(intakeHtml, /Coming soon/i);
assert.doesNotMatch(intakeHtml, /MS-34/i);

const uploadPanelSource = readFileSync(
  fileURLToPath(new URL("./TranscriptUploadPanel.tsx", import.meta.url)),
  "utf8",
);
assert.match(uploadPanelSource, /ClientDocumentUploadPanel/);
assert.match(uploadPanelSource, /processedDocumentCount/);

const firstContactBlock = uploadPanelSource.slice(
  uploadPanelSource.indexOf("isFirstContact ? ("),
  uploadPanelSource.indexOf("!isFirstContact ? ("),
);
assert.match(firstContactBlock, /ClientDocumentUploadPanel/);
assert.doesNotMatch(firstContactBlock, /FileUploadQueue/);

const deepeningBlock = uploadPanelSource.slice(uploadPanelSource.indexOf("!isFirstContact ? ("));
assert.match(deepeningBlock, /MeetingFeedbackPanel/);
assert.match(deepeningBlock, /Transcript files/);
assert.match(deepeningBlock, /FileUploadQueue/);
assert.match(deepeningBlock, /ClientDocumentUploadPanel/);
assert.match(deepeningBlock, /Optional client documents/);
assert.match(deepeningBlock, /not meeting transcripts/i);
assert.match(deepeningBlock, /does not separate uploads by journey stage/i);

const apiSource = readFileSync(
  fileURLToPath(new URL("../lib/api.ts", import.meta.url)),
  "utf8",
);
assert.match(apiSource, /uploadClientDocument/);
assert.match(apiSource, /listClientDocuments/);
assert.match(apiSource, /deleteClientDocument/);
assert.match(apiSource, /formData\.append\("file"/);
assert.doesNotMatch(apiSource, /storage_path/);

console.log("MS-34 document upload UI tests passed");
