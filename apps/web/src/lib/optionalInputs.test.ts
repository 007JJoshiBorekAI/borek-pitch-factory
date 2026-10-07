import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  EMPTY_CLIENT_INFORMATION_EXTRAS,
  displayClientName,
  normalizeClientInformation,
  normalizeClientInformationExtras,
  validateClientInformation,
  validateClientInformationExtras,
} from "./clientInformation.js";
import { parseIntakeDraft, persistIntakeDraft, restoreIntakeDraft } from "./intakeDraft.js";
import { previewDirectoryItem, previewOpportunityId } from "./previewJourney.js";

const EMPTY_VALUES = { company_name: "", contact_person: "", website_url: "", meeting_purpose: "", additional_information: "" };
const FULL_VALUES = {
  company_name: "Northwind GmbH",
  contact_person: "Ada Lovelace",
  website_url: "https://northwind.example",
  meeting_purpose: "Warehouse slotting review",
  additional_information: "Family-owned distributor.",
};
const FULL_EXTRAS = {
  ...EMPTY_CLIENT_INFORMATION_EXTRAS,
  business_industry: "Technology and software",
  contact_phone: "+49 30 1234 5678",
  contact_position: "COO",
};

// A–E. Every user-entered field may be empty, alone or all together.
assert.deepEqual(validateClientInformation(EMPTY_VALUES), {}, "client information can be fully empty");
assert.deepEqual(validateClientInformationExtras(EMPTY_CLIENT_INFORMATION_EXTRAS), {}, "pitch information can be fully empty");
assert.deepEqual(validateClientInformation({ ...EMPTY_VALUES, company_name: "   ", website_url: "  " }), {}, "whitespace counts as empty");
for (const key of Object.keys(FULL_VALUES) as Array<keyof typeof FULL_VALUES>) {
  assert.deepEqual(validateClientInformation({ ...FULL_VALUES, [key]: "" }), {}, `${key} can be empty`);
}
for (const key of ["business_industry", "contact_phone", "contact_position", "pitch_notes", "additional_opportunity_information", "company_logo_name"] as const) {
  assert.deepEqual(validateClientInformationExtras({ ...FULL_EXTRAS, [key]: "" }), {}, `${key} can be empty`);
}
assert.deepEqual(validateClientInformationExtras({ ...FULL_EXTRAS, pitch_file_names: [] }), {}, "no file is required");

// Missing values stay empty: nothing is filled in on the user's behalf.
assert.deepEqual(normalizeClientInformation(EMPTY_VALUES), EMPTY_VALUES);
assert.deepEqual(normalizeClientInformationExtras(EMPTY_CLIENT_INFORMATION_EXTRAS), EMPTY_CLIENT_INFORMATION_EXTRAS);

// J. A value that is provided is still validated.
for (const invalid of ["invalid", "ftp://northwind.example", "http://localhost", "javascript:alert(1)"]) {
  assert.deepEqual(validateClientInformation({ ...EMPTY_VALUES, website_url: invalid }), {
    website_url: "Enter a valid HTTP or HTTPS website URL.",
  }, `${invalid} is rejected`);
}
assert.deepEqual(validateClientInformation({ ...EMPTY_VALUES, website_url: "northwind.example" }), {}, "a bare domain is accepted and normalised");
for (const invalid of ["123", "abc", "+49", "phone"]) {
  assert.deepEqual(validateClientInformationExtras({ ...EMPTY_CLIENT_INFORMATION_EXTRAS, contact_phone: invalid }), {
    contact_phone: "Enter a valid phone number including the country code.",
  }, `${invalid} is rejected`);
}
assert.deepEqual(validateClientInformationExtras({ ...EMPTY_CLIENT_INFORMATION_EXTRAS, contact_phone: "+49 30 1234 5678" }), {});

// K. A fully populated client is unaffected.
assert.deepEqual(validateClientInformation(FULL_VALUES), {});
assert.deepEqual(validateClientInformationExtras(FULL_EXTRAS), {});

// G. A blank draft can be saved and restored at every step of the wizard.
const values = new Map<string, string>();
const storage: Storage = {
  get length() { return values.size; },
  clear: () => values.clear(),
  getItem: (key) => values.get(key) ?? null,
  key: (index) => Array.from(values.keys())[index] ?? null,
  removeItem: (key) => { values.delete(key); },
  setItem: (key, value) => { values.set(key, value); },
};
for (const step of [1, 2, 3] as const) {
  const blank = { step, values: EMPTY_VALUES, extras: EMPTY_CLIENT_INFORMATION_EXTRAS };
  assert.deepEqual(parseIntakeDraft(blank), blank, `blank draft is valid at step ${step}`);
  assert.equal(persistIntakeDraft("owner", blank, storage), true);
  assert.deepEqual(restoreIntakeDraft("owner", storage), blank);
}
assert.equal(parseIntakeDraft({ step: 2, values: { ...EMPTY_VALUES, website_url: "javascript:bad" }, extras: EMPTY_CLIENT_INFORMATION_EXTRAS }), null,
  "a draft with an invalid provided value is still rejected");

// An unnamed client gets a system id and a display-only label; the stored name stays empty.
assert.match(previewOpportunityId(""), /^opp-client-[a-z0-9]+$/);
assert.equal(displayClientName("", "Unnamed client"), "Unnamed client");
assert.equal(displayClientName("   ", "Unnamed client"), "Unnamed client");
assert.equal(displayClientName(null, "Unnamed client"), "Unnamed client");
assert.equal(displayClientName("Northwind GmbH", "Unnamed client"), "Northwind GmbH");
const unnamed = previewDirectoryItem({
  opportunity_id: "opp-client-1",
  created_at: "2026-10-07T00:00:00.000Z",
  updated_at: "2026-10-07T00:00:00.000Z",
  client: { opportunity_id: "opp-client-1", revision: 1, values: EMPTY_VALUES, source: "fixture" },
  discovery: {} as never,
  presentation: { state: "waiting", version_id: null, source_discovery_version_id: null, slide_count: 0 },
  workflow: { revision: 1, current_status: "client_information", completed_statuses: [], blocked_reason: null, available_actions: [] },
});
assert.equal(unnamed.company_name, "", "the placeholder is never written into the record");

// H + UI. The form has no required markers, and an unnamed client is still sent to the API.
const source = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");
const editor = source("../components/ClientInformationEditor.tsx");
assert.doesNotMatch(editor, /required: true|\brequired[,:=]|aria-required/, "no field is marked required");
assert.doesNotMatch(editor, /<span aria-hidden="true">\s?\*<\/span>/, "no required asterisks");
assert.doesNotMatch(editor, /clientForm\.required/);
assert.match(editor, /copy\.clientForm\.allOptional/);
assert.doesNotMatch(editor, /Pending pitch information/, "no stand-in value is injected to pass validation");
assert.doesNotMatch(source("../components/LanguageProvider.tsx"), /Required fields|Pflichtfelder|Country code required|Ländervorwahl erforderlich/);
const api = source("./api.ts");
assert.doesNotMatch(api, /if \(!seed\?\.company_name\)/, "a missing company name no longer blocks the sync");
assert.match(api, /if \(!seed\) \{/);
assert.match(api, /client_name: seed\.company_name,/, "the name is sent as entered, not replaced");
assert.doesNotMatch(api, /Unknown Company|Example GmbH|"N\/A"/);
const directory = source("../components/ClientDirectoryPanel.tsx");
assert.match(directory, /displayClientName\(item\.company_name, copy\.clients\.unnamed\)/);

// The Discovery sheet never prints a stand-in company name.
const sheet = source("./discoveryWhitePaper.ts");
assert.doesNotMatch(sheet, /\|\| "Client"/, "no stand-in name on the Discovery sheet");
assert.match(sheet, /const paperLabel = \(c: SheetContext\) => \(c\.client \? `\$\{c\.client\} · Discovery Paper` : "Discovery Paper"\);/);
assert.match(sheet, /Prepared \$\{audience \? `for \$\{audience\} ` : ""\}ahead of the first meeting/);

console.log("Optional client input tests passed");
