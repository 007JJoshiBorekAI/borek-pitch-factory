import assert from "node:assert/strict";

import type { ListedOpportunityResponse, RecentWorkApiSnapshot } from "./api.js";
import {
  buildClientDirectory,
  filterClientDirectoryRows,
  formatClientLastActivity,
  mapClientAction,
  mapClientProgress,
  resolveClientContact,
  summarizeClientDirectory,
} from "./clientDirectory.js";
import { lifecycleFor, type RecentWorkSnapshot } from "./recentPresentations.js";

function listedOpportunity(
  overrides: Partial<ListedOpportunityResponse> = {},
): ListedOpportunityResponse {
  return {
    id: "opp-1",
    client_name: "Nova Retail",
    opportunity_name: "Q1 expansion",
    department: "Sales",
    language: "en",
    status: "active",
    pii_redaction_enabled: false,
    created_by: "user-1",
    created_at: "2026-09-01T10:00:00.000Z",
    updated_at: "2026-09-20T10:00:00.000Z",
    ...overrides,
  };
}

function recentSnapshot(
  overrides: Partial<RecentWorkApiSnapshot> = {},
): RecentWorkApiSnapshot {
  return {
    opportunity: listedOpportunity(),
    transcript_count: 0,
    has_plan: false,
    activity_at: "2026-09-20T10:00:00.000Z",
    ...overrides,
  };
}

function snapshotFromRecent(recent: RecentWorkApiSnapshot): RecentWorkSnapshot {
  return {
    opportunity: recent.opportunity,
    transcriptCount: recent.transcript_count,
    frameworkStatus: recent.framework_status ?? undefined,
    hasPlan: recent.has_plan,
    presentationId: recent.presentation_id ?? undefined,
    presentationName: recent.presentation_name ?? undefined,
    deck: recent.deck ?? undefined,
    resourceLoadFailed: recent.resource_load_failed,
    activityAt: recent.activity_at ?? undefined,
    job: recent.job ?? undefined,
  };
}

assert.equal(
  resolveClientContact(
    listedOpportunity({
      stage1_intake: {
        client_web_page: null,
        poc_name: "Alex Morgan",
        poc_position: "VP Sales",
        sales_topic_description: null,
        about_company: null,
      },
    }),
  ),
  "Alex Morgan · VP Sales",
);

assert.equal(
  resolveClientContact(
    listedOpportunity({
      additional_client_information: {
        location_requirements: [],
        constraints: [],
        contacts: [{ name: "Jamie Lee", role: "CTO" }],
        priorities: [],
      },
    }),
  ),
  "Jamie Lee · CTO",
);

assert.equal(resolveClientContact(listedOpportunity()), null);

const generatingRecent = recentSnapshot({
  job: {
    job_type: "stage1_generation",
    status: "RUNNING",
    current_stage: "research",
  },
});
const generatingSnapshot = snapshotFromRecent(generatingRecent);
assert.deepEqual(mapClientProgress(generatingSnapshot, listedOpportunity()), {
  progress: "Generating pitch",
  tone: "generating",
  filterCategory: "pre-meeting",
});

const postMeetingRecent = recentSnapshot({
  transcript_count: 2,
  framework_status: "draft",
});
assert.deepEqual(
  mapClientProgress(snapshotFromRecent(postMeetingRecent), listedOpportunity()),
  {
    progress: "Post-meeting",
    tone: "post-meeting",
    filterCategory: "post-meeting",
  },
);

const followUpRecent = recentSnapshot({
  transcript_count: 1,
  deck: { pptx_download_url: "/deck/1.pptx" },
});
assert.deepEqual(
  mapClientProgress(snapshotFromRecent(followUpRecent), listedOpportunity()),
  {
    progress: "Follow-up ready",
    tone: "follow-up",
    filterCategory: "post-meeting",
  },
);

const idleRecent = recentSnapshot({ activity_at: "2026-09-01T10:00:00.000Z" });
assert.deepEqual(mapClientProgress(snapshotFromRecent(idleRecent), listedOpportunity()), {
  progress: "No active pitch",
  tone: "inactive",
  filterCategory: "pre-meeting",
});

const preMeetingRecent = recentSnapshot({
  framework_status: "draft",
});
assert.deepEqual(
  mapClientProgress(snapshotFromRecent(preMeetingRecent), listedOpportunity()),
  {
    progress: "Pre-meeting",
    tone: "pre-meeting",
    filterCategory: "pre-meeting",
  },
);

const lifecycle = lifecycleFor(generatingSnapshot);
assert.deepEqual(mapClientAction("Generating pitch", generatingSnapshot, lifecycle), {
  label: "View",
  href: "/deck-center?opportunityId=opp-1",
});

assert.deepEqual(
  mapClientAction("No active pitch", generatingSnapshot, lifecycle),
  {
    label: "Create pitch",
    href: "/upload?new=1",
  },
);

const grouped = buildClientDirectory(
  [
    listedOpportunity({ id: "opp-1", opportunity_name: "Older pitch" }),
    listedOpportunity({
      id: "opp-2",
      client_name: "Nova Retail",
      opportunity_name: "Latest pitch",
      updated_at: "2026-09-25T10:00:00.000Z",
    }),
    listedOpportunity({
      id: "opp-3",
      client_name: "  nova retail ",
      opportunity_name: "Duplicate casing",
      updated_at: "2026-09-24T10:00:00.000Z",
    }),
  ],
  [
    recentSnapshot({ opportunity: { ...recentSnapshot().opportunity, id: "opp-1" } }),
    recentSnapshot({
      opportunity: {
        ...recentSnapshot().opportunity,
        id: "opp-2",
        updated_at: "2026-09-25T10:00:00.000Z",
      },
      activity_at: "2026-09-25T10:00:00.000Z",
      framework_status: "draft",
    }),
    recentSnapshot({
      opportunity: {
        ...recentSnapshot().opportunity,
        id: "opp-3",
        updated_at: "2026-09-24T10:00:00.000Z",
      },
      activity_at: "2026-09-24T10:00:00.000Z",
    }),
  ],
);

assert.equal(grouped.length, 1);
assert.equal(grouped[0]?.clientName, "Nova Retail");
assert.equal(grouped[0]?.opportunityContext, "Latest pitch");
assert.deepEqual(grouped[0]?.opportunityIds.sort(), ["opp-1", "opp-2", "opp-3"]);

const summary = summarizeClientDirectory(grouped);
assert.equal(summary.clientCount, 1);
assert.equal(summary.activePitchCount, 1);

const searchableRows = buildClientDirectory(
  [
    listedOpportunity({
      id: "a",
      client_name: "Alpha Corp",
      stage1_intake: {
        client_web_page: null,
        poc_name: "Sam",
        poc_position: "CEO",
        sales_topic_description: null,
        about_company: null,
      },
    }),
    listedOpportunity({ id: "b", client_name: "Beta Ltd" }),
  ],
  [
    recentSnapshot({
      opportunity: { ...recentSnapshot().opportunity, id: "a", client_name: "Alpha Corp" },
      framework_status: "draft",
    }),
    recentSnapshot({
      opportunity: { ...recentSnapshot().opportunity, id: "b", client_name: "Beta Ltd" },
      transcript_count: 1,
    }),
  ],
);

assert.equal(filterClientDirectoryRows(searchableRows, "sam", "all").length, 1);
assert.equal(filterClientDirectoryRows(searchableRows, "", "pre-meeting").length, 1);
assert.equal(filterClientDirectoryRows(searchableRows, "", "post-meeting").length, 1);

assert.equal(formatClientLastActivity("2026-09-25T09:59:30.000Z", Date.parse("2026-09-25T10:00:00.000Z")), "Just now");
assert.equal(formatClientLastActivity("2026-09-25T09:30:00.000Z", Date.parse("2026-09-25T10:00:00.000Z")), "30 min ago");
assert.equal(formatClientLastActivity("2026-09-25T08:00:00.000Z", Date.parse("2026-09-25T10:00:00.000Z")), "Today");
assert.equal(formatClientLastActivity("2026-09-24T10:00:00.000Z", Date.parse("2026-09-25T10:00:00.000Z")), "Yesterday");

console.log("FIGMA-04 client directory tests passed");
