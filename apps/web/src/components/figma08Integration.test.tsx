import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");

function read(name: string): string {
  return readFileSync(`${root}/${name}`, "utf8");
}

assert.match(css, /\.workflow-state-card/);
assert.match(css, /\.workflow-state-accent/);

assert.match(read("RecoveryBanner.tsx"), /recoveryNoticeToWorkflowState/);
assert.match(read("WorkflowStateCard.tsx"), /data-workflow-state-key/);
assert.match(read("ClientsWorkspacePanel.tsx"), /newClientWorkflowState/);
assert.match(read("ArchiveHistoryView.tsx"), /filedArchiveEmptyWorkflowState/);
assert.match(read("FileUploadQueue.tsx"), /transcriptProcessingWorkflowState/);
assert.match(read("FollowUpEmailView.tsx"), /followUpReadinessWorkflowState/);
assert.match(read("LiveGenerationProgress.tsx"), /jobProgressResearchingState/);
assert.match(read("PreMeetingIntakeView.tsx"), /preMeetingMissingInformationState/);
assert.doesNotMatch(read("ArchiveHistoryView.tsx"), /Restore/);
assert.doesNotMatch(read("FollowUpEmailView.tsx"), />Send email</);

console.log("FIGMA-08 integration tests passed");
