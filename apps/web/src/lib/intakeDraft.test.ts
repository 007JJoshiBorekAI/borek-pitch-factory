import assert from "node:assert/strict";
import { backendOpportunityMapKey } from "./backendOpportunityMap";

import {
  authOwnerId, beginAuthSession, clearAuthSession, getAuthOwnerId,
  isAuthSessionEnded, isPreviewSessionActive, syncAuthOwner,
} from "./authSession";
import {
  clearIntakeDraft, intakeDraftStorageKey, parseIntakeDraft,
  persistIntakeDraft, restoreIntakeDraft, type IntakeDraft,
} from "./intakeDraft";

class FakeStorage implements Storage {
  private values = new Map<string, string>();
  failRead = false;
  failWrite = false;
  failRemove = false;
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) {
    if (this.failRead) throw new Error("Storage read denied");
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrite) throw new Error("Storage quota exceeded");
    this.values.set(key, value);
  }
  removeItem(key: string) {
    if (this.failRemove) throw new Error("Storage removal denied");
    this.values.delete(key);
  }
}

const draft: IntakeDraft = {
  step: 3,
  values: {
    company_name: "Acme", contact_person: "Jordan", website_url: "https://example.com",
    meeting_purpose: "Discovery", additional_information: "Context",
  },
  extras: {
    company_logo_name: "logo.svg", business_industry: "Technology and software",
    contact_phone: "+49 30 1234567", contact_position: "COO", pitch_notes: "Notes",
    pitch_file_names: ["brief.pdf"], additional_opportunity_information: "Q1",
  },
};
const local = new FakeStorage();
const session = new FakeStorage();
const legacyKey = "borek-premeeting-create-draft-v1";
const originalLocal = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const originalSession = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: local });
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: session });

try {
  assert.equal(persistIntakeDraft(null, draft, local), false);
  assert.equal(persistIntakeDraft("owner-a", draft, local), true);
  const second = { ...draft, values: { ...draft.values, company_name: "Owner B" } };
  assert.equal(persistIntakeDraft("owner-b", second, local), true);
  assert.deepEqual(restoreIntakeDraft("owner-a", local), draft);
  assert.deepEqual(restoreIntakeDraft("owner-b", local), second);
  assert.equal(restoreIntakeDraft(null, local), null);
  local.setItem(legacyKey, JSON.stringify(draft));
  assert.equal(restoreIntakeDraft("new-owner", local), null);
  assert.equal(local.getItem(legacyKey), null);
  assert.equal(local.getItem(intakeDraftStorageKey("new-owner")), null);

  for (const value of [
    null, [], {}, { ...draft, step: 4 },
    { ...draft, values: { ...draft.values, company_name: 7 } },
    { ...draft, values: { ...draft.values, website_url: "javascript:bad" } },
    { ...draft, extras: { ...draft.extras, contact_phone: null } },
    { ...draft, extras: { ...draft.extras, pitch_file_names: "brief.pdf" } },
    { ...draft, extras: { ...draft.extras, pitch_file_names: [42] } },
  ]) {
    local.setItem(intakeDraftStorageKey("invalid"), JSON.stringify(value));
    assert.equal(restoreIntakeDraft("invalid", local), null);
    assert.equal(local.getItem(intakeDraftStorageKey("invalid")), null);
  }
  local.setItem(intakeDraftStorageKey("invalid"), "{broken JSON");
  assert.equal(restoreIntakeDraft("invalid", local), null);
  assert.equal(local.getItem(intakeDraftStorageKey("invalid")), null);
  assert.equal(parseIntakeDraft({ ...draft, step: 2, values: { ...draft.values, meeting_purpose: "" } })?.step, 2);
  // Inputs are optional: a later step with an empty field is still a valid draft.
  assert.equal(parseIntakeDraft({ ...draft, step: 3, values: { ...draft.values, meeting_purpose: "" } })?.step, 3);
  assert.equal(parseIntakeDraft({ ...draft, extras: { ...draft.extras, business_industry: "" } })?.extras.business_industry, "");
  assert.equal(parseIntakeDraft({ ...draft, step: 1, values: { ...draft.values, company_name: "" } })?.step, 1);
  const stripped = parseIntakeDraft({ ...draft, values: { ...draft.values, contact_phone: "not canonical" } });
  assert.deepEqual(Object.keys(stripped!.values), Object.keys(draft.values));

  syncAuthOwner("owner-a");
  assert.equal(getAuthOwnerId(), "owner-a");
  local.setItem("borek-preview-journey-v1:owner-a", "{}");
  const ownerAMap = backendOpportunityMapKey("owner-a", "https://api.example");
  const ownerBMap = backendOpportunityMapKey("owner-b", "https://api.example");
  local.setItem(ownerAMap, "{}");
  local.setItem(ownerBMap, "{}");
  syncAuthOwner("owner-b");
  assert.equal(getAuthOwnerId(), "owner-b");
  assert.equal(local.getItem(intakeDraftStorageKey("owner-a")), null);
  assert.equal(local.getItem("borek-preview-journey-v1:owner-a"), null);
  assert.equal(local.getItem(ownerAMap), null);
  assert.equal(local.getItem(ownerBMap), "{}");
  assert.deepEqual(restoreIntakeDraft("owner-b", local), second);
  clearAuthSession();
  assert.equal(getAuthOwnerId(), null);
  assert.equal(restoreIntakeDraft("owner-b", local), null);
  assert.equal(local.getItem(ownerBMap), null);

  beginAuthSession(true);
  syncAuthOwner("local-preview");
  persistIntakeDraft("local-preview", draft);
  assert.equal(isPreviewSessionActive(), true);
  assert.equal(authOwnerId(null, true, null), "local-preview");
  clearAuthSession();
  assert.equal(isPreviewSessionActive(), false);
  assert.equal(isAuthSessionEnded(), true);
  assert.equal(getAuthOwnerId(), null);
  assert.equal(restoreIntakeDraft("local-preview"), null);
  // A reload must not revive preview or development-token authentication.
  const preview = isPreviewSessionActive();
  const developmentToken = isAuthSessionEnded() ? null : "dev-bypass";
  assert.equal(authOwnerId(null, preview, developmentToken), null);
  beginAuthSession();
  assert.equal(isAuthSessionEnded(), false);
  assert.equal(authOwnerId("user-id", true, "token"), "user-id");
  assert.equal(authOwnerId(null, true, "token"), "local-preview");
  assert.equal(authOwnerId(null, false, "dev-token"), "development-access");
  assert.equal(authOwnerId(null, false, "dev-bypass"), "development-access");
  assert.equal(authOwnerId(null, false, null), null);

  local.failWrite = true;
  assert.equal(persistIntakeDraft("owner-a", draft), false);
  local.failRead = true;
  local.failRemove = true;
  session.failRead = true;
  session.failWrite = true;
  session.failRemove = true;
  assert.equal(restoreIntakeDraft("owner-a"), null);
  assert.equal(clearIntakeDraft("owner-a"), false);
  assert.doesNotThrow(() => clearAuthSession("owner-a"));
  assert.doesNotThrow(() => syncAuthOwner("owner-b"));
  assert.equal(getAuthOwnerId(), null);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("Denied"); } });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, get() { throw new Error("Denied"); } });
  assert.equal(persistIntakeDraft("owner-a", draft), false);
  assert.equal(restoreIntakeDraft("owner-a"), null);
  assert.doesNotThrow(() => clearAuthSession());
  assert.doesNotThrow(() => beginAuthSession(true));
} finally {
  if (originalLocal) Object.defineProperty(globalThis, "localStorage", originalLocal);
  else Reflect.deleteProperty(globalThis, "localStorage");
  if (originalSession) Object.defineProperty(globalThis, "sessionStorage", originalSession);
  else Reflect.deleteProperty(globalThis, "sessionStorage");
}

console.log("Intake draft and auth session tests passed");
