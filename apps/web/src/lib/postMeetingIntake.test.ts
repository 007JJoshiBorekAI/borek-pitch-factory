import assert from "node:assert/strict";

import {
  buildReadinessState,
  createNotesTranscriptFile,
  defaultPostMeetingInputMode,
  formatClientContext,
  hasProcessedTranscript,
  hasProcessingTranscript,
  isJamieAvailable,
  jamieUnavailableMessage,
  notesTranscriptFileName,
} from "./postMeetingIntake.js";
import { createRestoredQueueItem } from "./uploadQueue.js";

assert.equal(isJamieAvailable(), false);
assert.match(jamieUnavailableMessage(), /Jamie\.ai/i);
assert.equal(defaultPostMeetingInputMode(), "upload");

const opportunity = {
  id: "opp-1",
  client_name: "Acme GmbH",
  opportunity_name: "First meeting",
  department: "Sales",
  language: "en",
  pii_redaction_enabled: true,
  status: "active" as const,
};

assert.match(formatClientContext(opportunity), /Acme GmbH/);
assert.match(
  formatClientContext({ ...opportunity, created_at: "2026-09-18T10:00:00Z" } as typeof opportunity & {
    created_at: string;
  }),
  /Sep.*2026/,
);

const successItem = createRestoredQueueItem("tx-1", "meeting.txt");
assert.equal(hasProcessedTranscript([successItem], []), true);
assert.equal(
  hasProcessingTranscript([successItem], [{ id: "tx-1", file_name: "meeting.txt", processing_status: "pending", created_at: "" }]),
  true,
);

const ready = buildReadinessState({
  mode: "upload",
  queueItems: [successItem],
  remoteTranscripts: [{ id: "tx-1", file_name: "meeting.txt", processing_status: "processed", created_at: "" }],
  feedbackText: "Client confirmed interest.",
  clientDocuments: [{
    id: "doc-1",
    opportunity_id: "opp-1",
    file_name: "volumes.xlsx",
    mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    document_key: "doc",
    processing_status: "processed",
    section_count: 1,
    created_at: "",
  }],
});
assert.equal(ready.meetingSourceReady, true);
assert.equal(ready.canContinue, true);
assert.equal(ready.ctaLabel, "Generate Email");
assert.equal(ready.feedbackAdded, true);
assert.equal(ready.documentAdded, true);

const jamieBlocked = buildReadinessState({
  mode: "jamie",
  queueItems: [],
  remoteTranscripts: [],
  feedbackText: null,
  clientDocuments: [],
});
assert.equal(jamieBlocked.canContinue, false);
assert.match(jamieBlocked.continueBlockedReason ?? "", /Jamie\.ai/i);

const notesFile = createNotesTranscriptFile("Acme GmbH", "Pilot confirmed.");
assert.equal(notesFile.type, "text/plain");
assert.match(notesTranscriptFileName("Acme GmbH"), /Acme-GmbH-meeting-notes\.txt/);

console.log("FIGMA-05 post-meeting intake tests passed");
