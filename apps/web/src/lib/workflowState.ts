import type { FollowUpEmailReadinessPhase } from "./followUpEmail";
import type { JobProgressPhase, JobProgressStatus } from "./jobProgress";
import type { RecoveryNotice } from "./recoveryUx";

/** Product capabilities that FIGMA-08 must not fake. */
export const WORKFLOW_CAPABILITY = {
  awaitingApprovalQueue: false,
  archiveRestore: false,
  emailSend: false,
} as const;

export type WorkflowStateKey =
  | "new_client"
  | "researching"
  | "missing_information"
  | "generation_failed"
  | "transcript_processing"
  | "transcript_ready"
  | "ready_to_confirm_email"
  | "confirmed_email_not_sent"
  | "filed_archive";

export type WorkflowStateTone = "brand" | "active" | "neutral";

export interface WorkflowStateAction {
  label: string;
  href?: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface WorkflowStateTechnicalDetails {
  code?: string;
  stage?: string;
  jobId?: string;
  message?: string;
}

export interface WorkflowStatePresentation {
  key: WorkflowStateKey;
  eyebrow: string;
  title: string;
  description: string;
  tone: WorkflowStateTone;
  iconLabel: string;
  role: "status" | "alert";
  recoverable: boolean;
  ariaLive?: "polite" | "assertive";
  primaryAction?: WorkflowStateAction;
  secondaryAction?: WorkflowStateAction;
  meta?: string;
  technical?: WorkflowStateTechnicalDetails;
}

export function isAwaitingApprovalSupported(): boolean {
  return WORKFLOW_CAPABILITY.awaitingApprovalQueue;
}

export function isArchiveRestoreSupported(): boolean {
  return WORKFLOW_CAPABILITY.archiveRestore;
}

export function newClientWorkflowState(): WorkflowStatePresentation {
  return {
    key: "new_client",
    eyebrow: "NEW CLIENT",
    title: "Start with the essentials",
    description: "Add the client, contact and opportunity.",
    tone: "brand",
    iconLabel: "+",
    role: "status",
    recoverable: false,
    primaryAction: { label: "Add client", href: "/upload?new=1" },
  };
}

export function researchingWorkflowState(options?: {
  title?: string;
  description?: string;
  meta?: string;
}): WorkflowStatePresentation {
  return {
    key: "researching",
    eyebrow: "RESEARCHING",
    title: options?.title ?? "Preparing the company brief",
    description: options?.description ?? "Checking public sources…",
    tone: "active",
    iconLabel: "…",
    role: "status",
    recoverable: false,
    meta: options?.meta ?? "Usually under 3 min",
    ariaLive: "polite",
  };
}

export function missingInformationWorkflowState(input: {
  title: string;
  description: string;
  primaryAction?: WorkflowStateAction;
}): WorkflowStatePresentation {
  return {
    key: "missing_information",
    eyebrow: "MISSING INFORMATION",
    title: input.title,
    description: input.description,
    tone: "neutral",
    iconLabel: "!",
    role: "alert",
    recoverable: true,
    primaryAction: input.primaryAction,
    ariaLive: "assertive",
  };
}

export function generationFailedWorkflowState(input: {
  title?: string;
  description?: string;
  primaryAction?: WorkflowStateAction;
  technical?: WorkflowStateTechnicalDetails;
}): WorkflowStatePresentation {
  return {
    key: "generation_failed",
    eyebrow: "GENERATION FAILED",
    title: input.title ?? "The pitch could not be prepared",
    description: input.description ?? "Your client data is safe. Try again.",
    tone: "brand",
    iconLabel: "×",
    role: "alert",
    recoverable: Boolean(input.primaryAction),
    primaryAction: input.primaryAction,
    technical: input.technical,
    ariaLive: "assertive",
  };
}

export function transcriptProcessingWorkflowState(input?: {
  sourceLabel?: string;
  title?: string;
  description?: string;
}): WorkflowStatePresentation {
  return {
    key: "transcript_processing",
    eyebrow: "TRANSCRIPT PROCESSING",
    title: input?.title ?? "Processing the meeting",
    description: input?.description ?? "Summary, minutes and follow-up will appear here.",
    tone: "active",
    iconLabel: "…",
    role: "status",
    recoverable: false,
    meta: input?.sourceLabel,
    ariaLive: "polite",
  };
}

export function transcriptReadyWorkflowState(input: {
  title: string;
  description: string;
  meta?: string;
}): WorkflowStatePresentation {
  return {
    key: "transcript_ready",
    eyebrow: "TRANSCRIPT READY",
    title: input.title,
    description: input.description,
    tone: "active",
    iconLabel: "✓",
    role: "status",
    recoverable: false,
    meta: input.meta ?? "Ready",
  };
}

export function readyToConfirmEmailWorkflowState(input?: {
  recipientSummary?: string | null;
}): WorkflowStatePresentation {
  return {
    key: "ready_to_confirm_email",
    eyebrow: "READY TO CONFIRM",
    title: "Ready to confirm",
    description: input?.recipientSummary
      ? `${input.recipientSummary}. Review the checklist, then confirm — Pitch Factory does not send email.`
      : "Review recipient, subject, and body, then confirm — Pitch Factory does not send email.",
    tone: "active",
    iconLabel: "✓",
    role: "status",
    recoverable: false,
  };
}

export function confirmedEmailNotSentWorkflowState(): WorkflowStatePresentation {
  return {
    key: "confirmed_email_not_sent",
    eyebrow: "CONFIRMED",
    title: "Review confirmed — not sent",
    description:
      "This workspace records your confirmation only. Copy the draft separately if you need to send it.",
    tone: "brand",
    iconLabel: "✓",
    role: "status",
    recoverable: false,
  };
}

export function filedArchiveEmptyWorkflowState(): WorkflowStatePresentation {
  return {
    key: "filed_archive",
    eyebrow: "ARCHIVED",
    title: "Workspace archived",
    description: "All versions, files and activity remain traceable when presentations are filed.",
    tone: "neutral",
    iconLabel: "▦",
    role: "status",
    recoverable: false,
    primaryAction: { label: "Recent presentations", href: "/" },
  };
}

export function filedArchiveFilteredEmptyWorkflowState(): WorkflowStatePresentation {
  return missingInformationWorkflowState({
    title: "No filed presentations match",
    description: "Try a different client, opportunity name, or date range.",
  });
}

function recoveryPrimaryAction(notice: RecoveryNotice): WorkflowStateAction | undefined {
  if (!notice.action) {
    return undefined;
  }
  return {
    label: notice.action.label,
    href: notice.action.href,
  };
}

export function recoveryNoticeToWorkflowState(notice: RecoveryNotice): WorkflowStatePresentation {
  switch (notice.category) {
    case "TERMINAL_FAILURE":
      return generationFailedWorkflowState({
        title: notice.title,
        description: notice.message,
        primaryAction: recoveryPrimaryAction(notice),
        technical: notice.technical,
      });
    case "STILL_RUNNING":
    case "RETRYING":
      return researchingWorkflowState({
        title: notice.category === "RETRYING" ? notice.title : undefined,
        description: notice.message,
        meta: notice.action?.label ?? "Usually under 3 min",
      });
    case "INPUT_REQUIRED":
    case "VALIDATION_NEEDS_REVIEW":
    case "CONNECTION_LOST":
      return missingInformationWorkflowState({
        title: notice.title,
        description: notice.message,
        primaryAction: recoveryPrimaryAction(notice),
      });
    default:
      return missingInformationWorkflowState({
        title: notice.title,
        description: notice.message,
        primaryAction: recoveryPrimaryAction(notice),
      });
  }
}

export function jobProgressResearchingState(
  status: JobProgressStatus,
  phase: JobProgressPhase,
  headline: string,
): WorkflowStatePresentation | null {
  if (status !== "RUNNING" && status !== "QUEUED") {
    return null;
  }

  const phaseTitles: Record<JobProgressPhase, string> = {
    framework: "Preparing the company brief",
    planning: "Preparing the presentation plan",
    generation: "Preparing the pitch",
    slide: "Regenerating slide content",
  };

  return researchingWorkflowState({
    title: phaseTitles[phase],
    description: headline,
    meta: status === "QUEUED" ? "Queued" : "Usually under 3 min",
  });
}

export function followUpReadinessWorkflowState(
  phase: FollowUpEmailReadinessPhase,
  recipientSummary: string | null,
): WorkflowStatePresentation | null {
  if (phase === "loading" || phase === "error") {
    return null;
  }
  if (phase === "confirmed") {
    return confirmedEmailNotSentWorkflowState();
  }
  if (phase === "ready") {
    return readyToConfirmEmailWorkflowState({ recipientSummary });
  }
  if (phase === "incomplete") {
    return missingInformationWorkflowState({
      title: "Complete review",
      description: "Finish recipient, subject, body, and checklist items before confirming.",
    });
  }
  return null;
}

export function preMeetingMissingInformationState(input: {
  validationMessage?: string;
  processedDocumentCount: number;
}): WorkflowStatePresentation | null {
  if (input.validationMessage) {
    return missingInformationWorkflowState({
      title: "Required information missing",
      description: input.validationMessage,
    });
  }
  if (input.processedDocumentCount === 0) {
    return missingInformationWorkflowState({
      title: "Client source material is required",
      description: "Upload at least one processed client document before generating the brief.",
      primaryAction: { label: "Add source" },
    });
  }
  return null;
}
