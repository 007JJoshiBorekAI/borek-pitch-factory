import type { EmailDraftLength } from "./journeyOutputsContracts";
import {
  canConfirmFollowupReview,
  followupDraftErrors,
  primaryFollowupRecipient,
  validateFollowupProjectStatics,
  type FollowupChecklistId,
  type FollowupChecklistState,
  type FollowupDraft,
  type FollowupProjectStatics,
} from "./followupReview";

export type FollowUpEmailReadinessPhase =
  | "loading"
  | "incomplete"
  | "ready"
  | "confirmed"
  | "error";

export type FollowUpChecklistItemStatus = "ready" | "edited" | "missing" | "none" | "attached";

export interface FollowUpEmailChecklistItem {
  id: "recipient" | "subject" | "body" | "attachment";
  label: string;
  status: FollowUpChecklistItemStatus;
  statusLabel: string;
}

export interface FollowUpEmailReadinessModel {
  phase: FollowUpEmailReadinessPhase;
  heading: string;
  recipientSummary: string | null;
  recipientReady: boolean;
  checklist: FollowUpEmailChecklistItem[];
  reviewComplete: boolean;
  canConfirm: boolean;
  primaryCtaLabel: string;
  primaryCtaDisabled: boolean;
  supportCopy: string;
  editorSavedLabel: string | null;
  validationErrors: string[];
}

export function followUpMeetingInputHref(opportunityId: string | null): string {
  if (!opportunityId) {
    return "/clients";
  }
  return `/upload?opportunityId=${encodeURIComponent(opportunityId)}&journeyStage=deepening`;
}

export function formatFollowUpRecipientDisplay(
  statics: FollowupProjectStatics,
  clientName?: string | null,
): string {
  const recipient = primaryFollowupRecipient(statics);
  const nameParts = [recipient.first_name, recipient.last_name].filter(Boolean).join(" ").trim();
  const person = nameParts || recipient.email.trim();
  const org = clientName?.trim() || statics.client_short.trim() || statics.project_name.trim();
  if (person && org && !person.includes(org)) {
    return `${person} · ${org}`;
  }
  return person || org || "Recipient not set";
}

export function formatFollowUpRecipientShort(statics: FollowupProjectStatics): string {
  const recipient = primaryFollowupRecipient(statics);
  const nameParts = [recipient.first_name, recipient.last_name].filter(Boolean).join(" ").trim();
  return nameParts || recipient.email.trim() || "the recipient";
}

export function isFollowUpSubjectEditable(
  demoMode: boolean,
  locked: boolean,
  busy: boolean,
): boolean {
  return demoMode && !locked && !busy;
}

export function isFollowUpBodyEditable(
  demoMode: boolean,
  locked: boolean,
  busy: boolean,
): boolean {
  return demoMode && !locked && !busy;
}

export function isFollowUpRecipientEditable(locked: boolean, busy: boolean): boolean {
  return !locked && !busy;
}

export function attachmentReadiness(
  draft: FollowupDraft | null,
): Pick<FollowUpEmailChecklistItem, "status" | "statusLabel"> {
  if (!draft?.attachment_name?.trim()) {
    return { status: "none", statusLabel: "None" };
  }
  return { status: "attached", statusLabel: "Attached" };
}

export function bodyReadinessStatus(
  draft: FollowupDraft | null,
  demoMode: boolean,
  bodyEdited: boolean,
): Pick<FollowUpEmailChecklistItem, "status" | "statusLabel"> {
  if (!draft?.body.trim()) {
    return { status: "missing", statusLabel: "Missing" };
  }
  if (demoMode && bodyEdited) {
    return { status: "edited", statusLabel: "Edited" };
  }
  if (draft.body.trim()) {
    return { status: "ready", statusLabel: demoMode ? "Ready" : "Ready" };
  }
  return { status: "missing", statusLabel: "Missing" };
}

export function subjectReadinessStatus(
  draft: FollowupDraft | null,
): Pick<FollowUpEmailChecklistItem, "status" | "statusLabel"> {
  if (!draft?.subject.trim()) {
    return { status: "missing", statusLabel: "Missing" };
  }
  return { status: "ready", statusLabel: "Ready" };
}

export function recipientReadinessStatus(
  statics: FollowupProjectStatics,
  staticsSaved: boolean,
): Pick<FollowUpEmailChecklistItem, "status" | "statusLabel"> {
  if (!staticsSaved || validateFollowupProjectStatics(statics).length > 0) {
    return { status: "missing", statusLabel: "Incomplete" };
  }
  return { status: "ready", statusLabel: "Ready" };
}

export function followUpPrimaryCtaLabel(input: {
  confirmed: boolean;
  confirming: boolean;
}): string {
  if (input.confirming) {
    return "Confirming review…";
  }
  if (input.confirmed) {
    return "Confirmed — not sent";
  }
  return "Confirm email";
}

export function followUpSupportCopy(recipientShort: string, confirmed: boolean): string {
  if (confirmed) {
    return "Review confirmed on the server — email is not sent from this application.";
  }
  return `Confirming records your review for ${recipientShort}. No email is sent from this application.`;
}

export function followUpEditorHeaderLabel(demoMode: boolean, liveDraftReadOnly: boolean): string {
  if (demoMode) {
    return "EDITABLE EMAIL";
  }
  if (liveDraftReadOnly) {
    return "GENERATED DRAFT";
  }
  return "EMAIL DRAFT";
}

export function buildFollowUpEmailReadiness(input: {
  statics: FollowupProjectStatics;
  staticsSaved: boolean;
  draft: FollowupDraft | null;
  checklist: FollowupChecklistState;
  acknowledgedFlags: ReadonlySet<string>;
  demoMode: boolean;
  serverConfirmed: boolean;
  bodyEdited: boolean;
  busy: boolean;
  confirming: boolean;
  loading: boolean;
  error: string | null;
  clientName?: string | null;
}): FollowUpEmailReadinessModel {
  const validationErrors = [
    ...validateFollowupProjectStatics(input.statics),
    ...(input.draft ? followupDraftErrors(input.draft) : []),
  ];
  const recipientShort = formatFollowUpRecipientShort(input.statics);
  const confirmed =
    input.serverConfirmed ||
    input.draft?.status === "reviewed" ||
    input.draft?.status === "sent";
  const locked = confirmed || Boolean(input.draft && input.draft.status !== "draft");
  const canConfirm = canConfirmFollowupReview(
    input.draft,
    input.statics,
    input.checklist,
    input.acknowledgedFlags,
    input.staticsSaved,
  );

  const recipientItem = recipientReadinessStatus(input.statics, input.staticsSaved);
  const subjectItem = subjectReadinessStatus(input.draft);
  const bodyItem = bodyReadinessStatus(input.draft, input.demoMode, input.bodyEdited);
  const attachmentItem = attachmentReadiness(input.draft);

  const checklist: FollowUpEmailChecklistItem[] = [
    { id: "recipient", label: "Recipient", ...recipientItem },
    { id: "subject", label: "Subject", ...subjectItem },
    { id: "body", label: "Email body", ...bodyItem },
    { id: "attachment", label: "Attachment", ...attachmentItem },
  ];

  let phase: FollowUpEmailReadinessPhase = "incomplete";
  if (input.loading) {
    phase = "loading";
  } else if (input.error) {
    phase = "error";
  } else if (confirmed) {
    phase = "confirmed";
  } else if (canConfirm) {
    phase = "ready";
  }

  const heading =
    phase === "confirmed"
      ? "Review confirmed"
      : phase === "ready"
        ? "Ready to confirm"
        : "Complete review";

  return {
    phase,
    heading,
    recipientSummary: recipientItem.status === "ready" ? `To ${recipientShort}` : null,
    recipientReady: recipientItem.status === "ready",
    checklist,
    reviewComplete: confirmed,
    canConfirm,
    primaryCtaLabel: followUpPrimaryCtaLabel({
      confirmed,
      confirming: input.confirming,
    }),
    primaryCtaDisabled: !canConfirm || input.busy || locked || input.confirming,
    supportCopy: followUpSupportCopy(recipientShort, confirmed),
    editorSavedLabel: input.staticsSaved ? "Saved" : null,
    validationErrors,
  };
}

export const FOLLOWUP_EMAIL_LENGTHS: EmailDraftLength[] = ["short", "medium", "extensive"];

export function followUpLengthLabel(length: EmailDraftLength): string {
  switch (length) {
    case "short":
      return "Short";
    case "medium":
      return "Medium";
    case "extensive":
      return "Extensive";
  }
}

export type { FollowupChecklistId };
