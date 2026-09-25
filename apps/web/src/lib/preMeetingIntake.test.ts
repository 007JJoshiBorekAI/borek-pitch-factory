import assert from "node:assert/strict";

import {
  EMPTY_PRE_MEETING_FORM,
  buildPreMeetingCreatePayload,
  isGenerateReady,
  preMeetingToStage1Values,
  validatePreMeetingForm,
} from "./preMeetingIntake.js";

assert.equal(
  validatePreMeetingForm({
    ...EMPTY_PRE_MEETING_FORM,
    client_name: "Acme",
    sales_opportunity: "Automation rollout",
    department: "Sales",
  }),
  undefined,
);

assert.match(
  validatePreMeetingForm({
    ...EMPTY_PRE_MEETING_FORM,
    client_name: "Acme",
    sales_opportunity: "Automation rollout",
  }) ?? "",
  /department/i,
);

const payload = buildPreMeetingCreatePayload({
  ...EMPTY_PRE_MEETING_FORM,
  client_name: " Acme ",
  sales_opportunity: " First pitch ",
  department: " Sales ",
  notes: "Context",
  client_web_page: "https://acme.example",
  poc_name: "Ada",
  poc_position: "Lead",
  about_company: "Manufacturing",
  language: "en",
  pii_redaction_enabled: true,
});

assert.equal(payload.client_name, "Acme");
assert.equal(payload.opportunity_name, "First pitch");
assert.equal(payload.department, "Sales");
assert.equal(payload.stage1_intake?.sales_topic_description, "Context");

assert.equal(
  preMeetingToStage1Values({
    ...EMPTY_PRE_MEETING_FORM,
    notes: "Notes only",
  }).sales_topic_description,
  "Notes only",
);

assert.equal(
  isGenerateReady(
    {
      ...EMPTY_PRE_MEETING_FORM,
      client_name: "Acme",
      sales_opportunity: "Pitch",
      department: "Sales",
    },
    1,
  ),
  true,
);

assert.equal(
  isGenerateReady(
    {
      ...EMPTY_PRE_MEETING_FORM,
      client_name: "Acme",
      sales_opportunity: "Pitch",
      department: "Sales",
    },
    0,
  ),
  false,
);

console.log("FIGMA-03 pre-meeting intake tests passed");
