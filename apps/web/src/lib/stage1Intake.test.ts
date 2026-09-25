import assert from "node:assert/strict";

import {
  buildStage1IntakePayload,
  EMPTY_STAGE1_FORM,
  hasStage1IntakeContent,
  stage1IntakeToFormValues,
  validateClientWebPage,
  validateStage1IntakeForm,
} from "./stage1Intake.js";

assert.equal(validateClientWebPage(""), undefined);
assert.match(validateClientWebPage("example.com") ?? "", /absolute HTTP/i);
assert.match(validateClientWebPage("javascript:alert(1)") ?? "", /absolute HTTP/i);
assert.match(validateClientWebPage("https://user:pass@example.com") ?? "", /without credentials/i);
assert.equal(validateClientWebPage("https://example.com"), undefined);

assert.equal(
  validateStage1IntakeForm({
    ...EMPTY_STAGE1_FORM,
    poc_name: "x".repeat(201),
  }),
  "POC name must be 200 characters or fewer.",
);

const payload = buildStage1IntakePayload({
  client_web_page: " https://example.com ",
  poc_name: "Ada Lovelace",
  poc_position: "  ",
  sales_topic_description: "Invoice matching",
  about_company: "",
});
assert.deepEqual(payload, {
  client_web_page: "https://example.com",
  poc_name: "Ada Lovelace",
  poc_position: null,
  sales_topic_description: "Invoice matching",
  about_company: null,
});
assert.equal(Object.keys(payload).length, 5);

assert.equal(hasStage1IntakeContent(payload), true);
assert.equal(hasStage1IntakeContent(buildStage1IntakePayload(EMPTY_STAGE1_FORM)), false);

assert.deepEqual(
  stage1IntakeToFormValues({
    client_web_page: "https://acme.example",
    poc_name: null,
    poc_position: "COO",
    sales_topic_description: "Ops automation",
    about_company: "Regional distributor",
  }),
  {
    client_web_page: "https://acme.example",
    poc_name: "",
    poc_position: "COO",
    sales_topic_description: "Ops automation",
    about_company: "Regional distributor",
  },
);

console.log("MS-33 stage1Intake tests passed");
