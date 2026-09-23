import assert from "node:assert/strict";

import { buildStage1IntakePayload } from "./stage1Intake.js";

const payload = buildStage1IntakePayload({
  client_web_page: "https://example.com",
  poc_name: "Ada",
  poc_position: "",
  sales_topic_description: "Invoice matching",
  about_company: "",
});

assert.deepEqual(Object.keys(payload).sort(), [
  "about_company",
  "client_web_page",
  "poc_name",
  "poc_position",
  "sales_topic_description",
]);
assert.equal(payload.poc_position, null);
assert.equal(payload.about_company, null);

console.log("MS-33 stage1Intake PATCH tests passed");
