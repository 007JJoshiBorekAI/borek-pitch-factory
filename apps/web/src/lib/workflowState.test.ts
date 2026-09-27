import assert from "node:assert/strict";

import {
  confirmedEmailNotSentWorkflowState,
  filedArchiveEmptyWorkflowState,
  followUpReadinessWorkflowState,
  generationFailedWorkflowState,
  isArchiveRestoreSupported,
  isAwaitingApprovalSupported,
  jobProgressResearchingState,
  missingInformationWorkflowState,
  newClientWorkflowState,
  preMeetingMissingInformationState,
  readyToConfirmEmailWorkflowState,
  recoveryNoticeToWorkflowState,
  researchingWorkflowState,
  transcriptProcessingWorkflowState,
  transcriptReadyWorkflowState,
  WORKFLOW_CAPABILITY,
} from "./workflowState.js";

assert.equal(isAwaitingApprovalSupported(), false);
assert.equal(isArchiveRestoreSupported(), false);
assert.equal(WORKFLOW_CAPABILITY.emailSend, false);

const newClient = newClientWorkflowState();
assert.equal(newClient.key, "new_client");
assert.equal(newClient.eyebrow, "NEW CLIENT");
assert.equal(newClient.title, "Start with the essentials");
assert.equal(newClient.primaryAction?.href, "/upload?new=1");
assert.equal(newClient.primaryAction?.label, "Add client");

const researching = researchingWorkflowState();
assert.equal(researching.key, "researching");
assert.equal(researching.meta, "Usually under 3 min");
assert.equal(researching.role, "status");

const missing = missingInformationWorkflowState({
  title: "Revenue could not be verified",
  description: "Continue without it or add a trusted source.",
  primaryAction: { label: "Add source" },
});
assert.equal(missing.key, "missing_information");
assert.equal(missing.role, "alert");
assert.equal(missing.recoverable, true);

const failed = generationFailedWorkflowState({
  primaryAction: { label: "Try again" },
  technical: { code: "RENDERER_FAILED" },
});
assert.equal(failed.key, "generation_failed");
assert.equal(failed.recoverable, true);
assert.equal(failed.technical?.code, "RENDERER_FAILED");

const failedNoRetry = generationFailedWorkflowState({});
assert.equal(failedNoRetry.recoverable, false);
assert.equal(failedNoRetry.primaryAction, undefined);

const processing = transcriptProcessingWorkflowState({
  sourceLabel: "call.txt · received",
});
assert.equal(processing.key, "transcript_processing");
assert.equal(processing.meta, "call.txt · received");

const ready = transcriptReadyWorkflowState({
  title: "call.txt",
  description: "Transcript processed",
});
assert.equal(ready.key, "transcript_ready");

const emailReady = readyToConfirmEmailWorkflowState({ recipientSummary: "To Mira Koch" });
assert.equal(emailReady.key, "ready_to_confirm_email");
assert.match(emailReady.description, /does not send email/);
assert.doesNotMatch(emailReady.eyebrow, /READY TO SEND/i);

const confirmed = confirmedEmailNotSentWorkflowState();
assert.equal(confirmed.key, "confirmed_email_not_sent");
assert.match(confirmed.title, /not sent/i);

const archived = filedArchiveEmptyWorkflowState();
assert.equal(archived.key, "filed_archive");
assert.equal(archived.primaryAction?.label, "Recent presentations");
assert.equal(archived.primaryAction?.href, "/");
assert.ok(!archived.primaryAction?.label.includes("Restore"));

const recoveryFailed = recoveryNoticeToWorkflowState({
  category: "TERMINAL_FAILURE",
  title: "We could not complete your presentation",
  message: "Your saved work remains available.",
  action: { kind: "RETRY", label: "Try again" },
});
assert.equal(recoveryFailed.key, "generation_failed");
assert.equal(recoveryFailed.primaryAction?.label, "Try again");

const recoveryRunning = recoveryNoticeToWorkflowState({
  category: "STILL_RUNNING",
  title: "Work is still in progress",
  message: "Your framework is still being prepared.",
  action: { kind: "KEEP_CHECKING", label: "Keep checking" },
});
assert.equal(recoveryRunning.key, "researching");

const recoveryInput = recoveryNoticeToWorkflowState({
  category: "INPUT_REQUIRED",
  title: "A transcript is needed",
  message: "Upload at least one transcript before generating the framework.",
  action: { kind: "UPLOAD", label: "Upload transcripts" },
});
assert.equal(recoveryInput.key, "missing_information");

const jobResearching = jobProgressResearchingState("RUNNING", "framework", "Reading transcripts");
assert.ok(jobResearching);
assert.equal(jobResearching?.key, "researching");
assert.equal(jobProgressResearchingState("COMPLETED", "framework", "Done"), null);

assert.equal(followUpReadinessWorkflowState("ready", "To Mira Koch")?.key, "ready_to_confirm_email");
assert.equal(followUpReadinessWorkflowState("confirmed", null)?.key, "confirmed_email_not_sent");
assert.equal(followUpReadinessWorkflowState("incomplete", null)?.key, "missing_information");
assert.equal(followUpReadinessWorkflowState("loading", null), null);

const preMeetingMissing = preMeetingMissingInformationState({
  validationMessage: "Enter a client name.",
  processedDocumentCount: 1,
});
assert.equal(preMeetingMissing?.key, "missing_information");

const preMeetingDocs = preMeetingMissingInformationState({
  processedDocumentCount: 0,
});
assert.equal(preMeetingDocs?.key, "missing_information");
assert.equal(preMeetingDocs?.primaryAction?.label, "Add source");

console.log("FIGMA-08 workflowState tests passed");
