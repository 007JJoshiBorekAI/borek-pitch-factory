import assert from "node:assert/strict";
import { loadLiveOpportunity, opportunityAccessMode } from "./opportunityResolution";
import { backendOpportunityMapKey, readBackendOpportunityMap } from "./backendOpportunityMap";

const uuid = "12345678-1234-4234-8234-123456789abc";
assert.equal(opportunityAccessMode("opp-known", true, false, "opp-known"), "preview");
assert.equal(opportunityAccessMode("opp-unknown", false, false, "opp-unknown"), "missing");
assert.equal(opportunityAccessMode(uuid, false, false, uuid), "missing");
assert.equal(opportunityAccessMode(uuid, false, true, uuid), "live");
assert.equal(opportunityAccessMode("opp-mapped", true, true, uuid), "live");
assert.equal(opportunityAccessMode("new", true, true, uuid), "missing");

const stored = new Map<string, string>();
const storage: Storage = {
  get length() { return stored.size; },
  key: (index) => [...stored.keys()][index] ?? null,
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => { stored.set(key, value); },
  removeItem: (key) => { stored.delete(key); },
  clear: () => stored.clear(),
};
storage.setItem(backendOpportunityMapKey("owner-a", "https://api.example"), JSON.stringify({ "opp-client": uuid, "opp-bad": "no-uuid" }));
assert.deepEqual(readBackendOpportunityMap(storage, "owner-a", "https://api.example"), { "opp-client": uuid });
assert.deepEqual(readBackendOpportunityMap(storage, "owner-b", "https://api.example"), {});
assert.deepEqual(readBackendOpportunityMap(storage, "owner-a", "https://other.example"), {});
storage.setItem(backendOpportunityMapKey("owner-b", "https://api.example"), "{invalid");
assert.deepEqual(readBackendOpportunityMap(storage, "owner-b", "https://api.example"), {});

async function run() {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => Response.json(String(url).endsWith("workflow-status") ? {
      current_status: "ppt1_ready", steps: [{ key: "discovery_prepared", state: "completed" }],
    } : {
      id: uuid, client_name: "Actual client", opportunity_name: "First meeting",
      stage1_intake: { poc_name: "Actual contact", client_web_page: "https://example.com", sales_topic_description: "Real topic", about_company: "Actual context" },
      created_at: "2026-10-06", updated_at: "2026-10-06",
    });
    const loaded = await loadLiveOpportunity("token", "opp-mapped", uuid);
    assert.equal(loaded.client.source, "live");
    assert.equal(loaded.client.values.company_name, "Actual client");
    assert.equal(loaded.client.values.contact_person, "Actual contact");
    assert.equal(loaded.workflow.current_status, "ppt_1_ready");
    assert.deepEqual(loaded.workflow.completed_statuses, ["discovery_prepared"]);
    assert.equal(loaded.discovery.source, "live");
    globalThis.fetch = async () => Response.json({ id: "wrong-id", client_name: "Other client" });
    await assert.rejects(() => loadLiveOpportunity("token", uuid, uuid), /different or incomplete/);
    globalThis.fetch = async () => new Response("", { status: 404 });
    await assert.rejects(() => loadLiveOpportunity("token", uuid, uuid), /404/);
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log("Opportunity boundary and owner-scoped backend map tests passed");
}
void run().catch((error) => { console.error(error); process.exitCode = 1; });
