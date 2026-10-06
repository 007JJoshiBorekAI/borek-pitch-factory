import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

test("discovery approval and generation call the discovery-paper endpoints", () => {
  const discovery = source("../components/DiscoveryWorkspace.tsx");
  assert.match(discovery, /approveLiveDiscovery/);
  assert.match(discovery, /generateLiveDiscovery/);
  const liveDiscovery = source("./liveDiscovery.ts");
  assert.match(liveDiscovery, /approveDiscoveryPaper/);
  assert.match(liveDiscovery, /generateDiscoveryPaper/);
  assert.doesNotMatch(discovery, /concretisation/);
});

test("meeting evidence reaches transcript, notes, extraction, use cases, and PPT #2", () => {
  const meeting = source("../components/MeetingEvidencePanel.tsx");
  assert.match(source("./firstMeetingHandoff.ts"), /workflow\/first-meeting-completed/);
  assert.match(meeting, /uploadTranscript/);
  assert.match(meeting, /savePersonalNotes/);
  assert.match(meeting, /generateMeetingExtraction/);
  assert.match(meeting, /saveSelectedUseCases/);
  assert.match(meeting, /generateAndAwaitPostMeetingPresentation/);
  assert.match(meeting, /regeneratePresentationId/);
  assert.match(source("./ppt2Generation.ts"), /regeneratePpt2/);
  assert.doesNotMatch(meeting, /DeckCenterPanel|MeetingPreparationPanel/);
  assert.doesNotMatch(meeting, /concretisation/);
});

test("owner review can finalize and follow-up prepares a deepening draft only", () => {
  const review = source("../components/OwnerCheckpointPanel.tsx");
  const followUp = source("../components/FollowUpDraftPanel.tsx");
  const api = source("./api.ts");
  assert.match(review, /markOwnerReviewed/);
  assert.match(review, /finalizeWorkflow/);
  assert.match(followUp, /generateEmailDraft/);
  assert.match(followUp, /"deepening"/);
  assert.doesNotMatch(followUp, /concretisation/);
  assert.doesNotMatch(api, /gamma|GAMMA|PRESENTATION_ENGINE/);
  assert.match(api, /\/ppt2\/generate/);
  assert.match(api, /\/ppt2\/\$\{presentationId\}\/regenerate/);
  assert.match(api, /\/stage1-outputs\/generate/);
  assert.doesNotMatch(api, /\/presentation\/generate/);
});
