import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ClientInformationAdapterError,
  clientInformationErrorMessage,
  createFixtureClientInformationAdapter,
  normalizeClientInformation,
  normalizeWebsiteUrl,
  validateClientInformation,
  type ClientInformationRecord,
} from "./clientInformation.js";

const record: ClientInformationRecord = {
  opportunity_id: "opp-ms41",
  revision: 3,
  source: "fixture",
  values: {
    company_name: "Acme GmbH",
    contact_person: "Jordan Meyer",
    website_url: "https://example.com",
    meeting_purpose: "Prepare discovery",
    additional_information: "Existing context",
  },
};

assert.deepEqual(validateClientInformation(record.values), {});
assert.deepEqual(validateClientInformation({
  company_name: "",
  contact_person: "",
  website_url: "invalid",
  meeting_purpose: "",
  additional_information: "",
}), {
  company_name: "Enter the company name.",
  contact_person: "Enter the contact person.",
  meeting_purpose: "Enter the meeting purpose.",
  website_url: "Enter a valid HTTP or HTTPS website URL.",
});
assert.equal(normalizeWebsiteUrl("example.com"), "https://example.com");
assert.deepEqual(normalizeClientInformation({
  company_name: " Acme ",
  contact_person: " Jordan ",
  website_url: " example.com ",
  meeting_purpose: " Discovery ",
  additional_information: " Context ",
}), {
  company_name: "Acme",
  contact_person: "Jordan",
  website_url: "https://example.com",
  meeting_purpose: "Discovery",
  additional_information: "Context",
});

async function run() {
const adapter = createFixtureClientInformationAdapter(record);
const loaded = await adapter.load("opp-ms41");
assert.deepEqual(loaded, record);
const saved = await adapter.save({
  opportunity_id: "opp-ms41",
  expected_revision: 3,
  values: { ...record.values, company_name: "Updated GmbH" },
});
assert.equal(saved.revision, 4);
assert.equal(saved.values.company_name, "Updated GmbH");
assert.deepEqual((await adapter.load("opp-ms41")).values, saved.values);
await assert.rejects(
  () => adapter.save({ opportunity_id: "opp-ms41", expected_revision: 3, values: record.values }),
  (error: unknown) => error instanceof ClientInformationAdapterError && error.kind === "conflict",
);
await assert.rejects(
  () => adapter.load("opp-other"),
  (error: unknown) => error instanceof ClientInformationAdapterError && error.kind === "authorization",
);

const retryError = new ClientInformationAdapterError("retryable", "Temporary failure");
const retryAdapter = createFixtureClientInformationAdapter(record, { nextFailure: retryError });
await assert.rejects(
  () => retryAdapter.save({ opportunity_id: "opp-ms41", expected_revision: 3, values: record.values }),
  retryError,
);
assert.equal(
  clientInformationErrorMessage(retryError),
  "The connection was interrupted. Your edits are still here; try saving again.",
);
assert.equal(
  (await retryAdapter.save({ opportunity_id: "opp-ms41", expected_revision: 3, values: record.values })).revision,
  4,
);

const component = readFileSync("src/components/ClientInformationEditor.tsx", "utf8");
const language = readFileSync("src/components/LanguageProvider.tsx", "utf8");
for (const label of [
  "Company Name",
  "Contact Person",
  "Website URL",
  "Meeting Purpose",
  "Additional Information",
]) {
  assert.match(language, new RegExp(label));
}
assert.match(component, /expected_revision/);
assert.match(component, /role="alert"/);
assert.match(component, /aria-invalid/);
assert.match(component, /copy\.clientForm\.reload/);
assert.match(component, /copy\.clientForm\.cancel/);
assert.match(component, /client-form-section/);
assert.match(component, /createStep === 1/);
assert.match(component, /createStep >= 2/);
assert.match(component, /createStep === 3/);
assert.match(component, /disabled=\{createStep !== 3 \|\| busy\}/);
assert.doesNotMatch(component, /sessionStorage|additional_client_information|discovery_questions/);

console.log("MS-41 client information tests passed");
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
