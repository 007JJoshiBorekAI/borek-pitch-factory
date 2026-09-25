import assert from "node:assert/strict";

import {
  CLIENT_DOCUMENT_MAX_BYTES,
  clientDocumentStatusLabel,
  validateClientDocumentFile,
} from "./clientDocuments.js";

assert.equal(validateClientDocumentFile({ name: "brief.txt", size: 12, type: "text/plain" }).ok, true);
assert.equal(validateClientDocumentFile({ name: "brief.pdf", size: 12, type: "application/pdf" }).ok, true);
assert.equal(
  validateClientDocumentFile({
    name: "profile.docx",
    size: 12,
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }).ok,
  true,
);

const unsupported = validateClientDocumentFile({ name: "notes.vtt", size: 12, type: "text/vtt" });
assert.equal(unsupported.ok, false);
assert.match(unsupported.reason ?? "", /PDF, DOCX, or TXT/i);

const tooLarge = validateClientDocumentFile({
  name: "big.pdf",
  size: CLIENT_DOCUMENT_MAX_BYTES + 1,
  type: "application/pdf",
});
assert.match(tooLarge.reason ?? "", /10 MB/i);

const empty = validateClientDocumentFile({ name: "empty.txt", size: 0, type: "text/plain" });
assert.match(empty.reason ?? "", /empty/i);

assert.equal(clientDocumentStatusLabel("processed"), "Processed");

console.log("MS-34 clientDocuments tests passed");
