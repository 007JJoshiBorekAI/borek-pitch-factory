import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ClientDocumentUploadPanel } from "./ClientDocumentUploadPanel.js";
import {
  removePreMeetingDocument,
  sortPreMeetingDocuments,
  upsertPreMeetingDocument,
} from "./PreMeetingPitchFiles.js";
import { Stage1IntakePanel } from "./Stage1IntakePanel.js";
import type { ClientDocument } from "../lib/api.js";

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
assert.match(uploadPanelSource, /PreMeetingIntakeView/);

const normalizedUploadPanel = uploadPanelSource.replace(/\r\n/g, "\n");
const firstContactReturnStart = normalizedUploadPanel.indexOf("if (isFirstContact) {\n    return (");
assert.notEqual(firstContactReturnStart, -1);
const deepeningReturnStart = normalizedUploadPanel.indexOf(
  'return (\n    <WorkspaceShell>\n      <div className="app-shell app-workspace-body">',
  firstContactReturnStart + 1,
);
assert.notEqual(deepeningReturnStart, -1);
const firstContactBlock = normalizedUploadPanel.slice(firstContactReturnStart, deepeningReturnStart);
assert.match(firstContactBlock, /PreMeetingIntakeView/);
assert.match(firstContactBlock, /first-contact\/review/);
assert.doesNotMatch(firstContactBlock, /FileUploadQueue/);

const deepeningBlock = normalizedUploadPanel.slice(deepeningReturnStart);
assert.match(deepeningBlock, /MeetingFeedbackPanel/);
assert.match(deepeningBlock, /Transcript files/);
assert.match(deepeningBlock, /FileUploadQueue/);
assert.match(deepeningBlock, /ClientDocumentUploadPanel/);
assert.match(deepeningBlock, /Optional client documents/);
assert.match(deepeningBlock, /not meeting transcripts/i);
assert.match(deepeningBlock, /does not separate uploads by journey stage/i);
assert.doesNotMatch(deepeningBlock, /PreMeetingIntakeView/);

const apiSource = readFileSync(
  fileURLToPath(new URL("../lib/api.ts", import.meta.url)),
  "utf8",
);
assert.match(apiSource, /uploadClientDocument/);
assert.match(apiSource, /listClientDocuments/);
assert.match(apiSource, /deleteClientDocument/);
assert.match(apiSource, /formData\.append\("file"/);
assert.doesNotMatch(apiSource, /storage_path/);

const preMeetingFilesSource = readFileSync(
  fileURLToPath(new URL("./PreMeetingPitchFiles.tsx", import.meta.url)),
  "utf8",
);
assert.match(
  preMeetingFilesSource,
  /useEffect\(\(\) => \{\s*onDocumentsChange\?\.\(documents\);\s*\}, \[documents, onDocumentsChange\]\)/,
);
assert.equal((preMeetingFilesSource.match(/onDocumentsChange\?\.\(/g) ?? []).length, 1);
assert.doesNotMatch(
  preMeetingFilesSource,
  /setDocuments\(\(current\) => \{[\s\S]*?onDocumentsChange/,
);
assert.match(
  preMeetingFilesSource,
  /setDocuments\(\(current\) => \(current\.length === 0 \? current : \[\]\)\)/,
);

function documentFixture(id: string, documentKey: string, fileName = `${id}.pdf`): ClientDocument {
  return {
    id,
    opportunity_id: "opp-1",
    file_name: fileName,
    mime_type: "application/pdf",
    document_key: documentKey,
    processing_status: "processed",
    section_count: 1,
    created_at: "2026-09-28T00:00:00Z",
  };
}

const documentB = documentFixture("doc-b", "b/document.pdf");
const documentA = documentFixture("doc-a", "a/document.pdf");
assert.deepEqual(
  sortPreMeetingDocuments([documentB, documentA]).map((document) => document.id),
  ["doc-a", "doc-b"],
);

const replacement = documentFixture("doc-a", "c/replacement.pdf", "replacement.pdf");
const replaced = upsertPreMeetingDocument([documentA, documentB], replacement);
assert.equal(replaced.filter((document) => document.id === "doc-a").length, 1);
assert.equal(replaced.find((document) => document.id === "doc-a")?.file_name, "replacement.pdf");
assert.deepEqual(replaced.map((document) => document.id), ["doc-b", "doc-a"]);
assert.deepEqual(
  removePreMeetingDocument(replaced, "doc-b").map((document) => document.id),
  ["doc-a"],
);
assert.deepEqual(removePreMeetingDocument(replaced, "missing-id"), replaced);

console.log("MS-34 document upload UI tests passed");
