import type { ClientDocument, OpportunityResponse, TranscriptResponse } from "./api";
import type { TranscriptQueueItem } from "./uploadQueue";

export type PostMeetingInputMode = "jamie" | "upload" | "notes";

export const POST_MEETING_INPUT_MODES: ReadonlyArray<{
  id: PostMeetingInputMode;
  label: string;
}> = [
  { id: "jamie", label: "Jamie.ai" },
  { id: "upload", label: "Upload transcript" },
  { id: "notes", label: "Type notes" },
];

/** Jamie connector exists server-side only; no product UI flow is wired yet. */
export function isJamieAvailable(): boolean {
  return false;
}

export function jamieUnavailableMessage(): string {
  return "Jamie.ai is not connected in this environment. Upload a transcript or type notes instead.";
}

export function defaultPostMeetingInputMode(): PostMeetingInputMode {
  return "upload";
}

export function isTranscriptProcessed(status: string | undefined): boolean {
  return status === "processed";
}

export function hasUploadedTranscript(queueItems: TranscriptQueueItem[]): boolean {
  return queueItems.some((item) => item.status === "success");
}

export function hasProcessingTranscript(
  queueItems: TranscriptQueueItem[],
  remoteTranscripts: TranscriptResponse[] = [],
): boolean {
  if (queueItems.some((item) => item.status === "uploading")) {
    return true;
  }
  if (remoteTranscripts.some((row) => row.processing_status === "pending")) {
    return true;
  }
  return false;
}

export function hasProcessedTranscript(
  queueItems: TranscriptQueueItem[],
  remoteTranscripts: TranscriptResponse[] = [],
): boolean {
  if (queueItems.some((item) => item.status === "success")) {
    return true;
  }
  return remoteTranscripts.some((row) => isTranscriptProcessed(row.processing_status));
}

export function primaryTranscriptLabel(
  opportunity: OpportunityResponse | null,
  queueItems: TranscriptQueueItem[],
  remoteTranscripts: TranscriptResponse[] = [],
): string {
  const fileName =
    queueItems.find((item) => item.status === "success")?.fileName ??
    remoteTranscripts[0]?.file_name ??
    null;
  if (fileName) {
    return fileName;
  }
  if (opportunity) {
    return `${opportunity.client_name} · First meeting`;
  }
  return "Meeting transcript";
}

export function primaryTranscriptMeta(
  queueItems: TranscriptQueueItem[],
  remoteTranscripts: TranscriptResponse[] = [],
): string {
  if (hasProcessingTranscript(queueItems, remoteTranscripts)) {
    return "Processing transcript…";
  }
  if (hasProcessedTranscript(queueItems, remoteTranscripts)) {
    return "Transcript processed";
  }
  if (queueItems.some((item) => item.status === "pending")) {
    return "Ready to upload";
  }
  return "Add a transcript to continue";
}

function formatOptionalDate(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function opportunityCreatedAt(opportunity: OpportunityResponse | null): string | null {
  if (!opportunity || !("created_at" in opportunity)) {
    return null;
  }
  const createdAt = (opportunity as OpportunityResponse & { created_at?: string }).created_at;
  return formatOptionalDate(createdAt);
}

export function formatClientContext(opportunity: OpportunityResponse | null): string {
  if (!opportunity) {
    return "Select a client to add meeting input";
  }
  const date = opportunityCreatedAt(opportunity);
  return date ? `${opportunity.client_name} · ${date}` : opportunity.client_name;
}

export function formatReadinessMeetingContext(opportunity: OpportunityResponse | null): string {
  if (!opportunity) {
    return "First meeting";
  }
  const date = opportunityCreatedAt(opportunity);
  return date ? `First meeting · ${date}` : "First meeting";
}

export interface PostMeetingReadinessChecklist {
  meetingSourceLabel: string;
  meetingSourceReady: boolean;
  meetingSourceStatus: "Ready" | "Processing" | "Pending" | "Unavailable";
  feedbackAdded: boolean;
  documentAdded: boolean;
}

export interface PostMeetingReadinessState extends PostMeetingReadinessChecklist {
  canContinue: boolean;
  continueBlockedReason: string | null;
  ctaLabel: string;
  ctaHelperText: string;
}

export function buildReadinessChecklist(input: {
  mode: PostMeetingInputMode;
  queueItems: TranscriptQueueItem[];
  remoteTranscripts: TranscriptResponse[];
  feedbackText: string | null;
  clientDocuments: ClientDocument[];
}): PostMeetingReadinessChecklist {
  const meetingSourceLabel =
    input.mode === "jamie"
      ? "Jamie.ai transcript"
      : input.mode === "notes"
        ? "Typed meeting notes"
        : "Meeting transcript";

  let meetingSourceReady = false;
  let meetingSourceStatus: PostMeetingReadinessChecklist["meetingSourceStatus"] = "Pending";

  if (input.mode === "jamie") {
    meetingSourceStatus = "Unavailable";
  } else if (hasProcessedTranscript(input.queueItems, input.remoteTranscripts)) {
    meetingSourceReady = true;
    meetingSourceStatus = "Ready";
  } else if (hasProcessingTranscript(input.queueItems, input.remoteTranscripts)) {
    meetingSourceStatus = "Processing";
  }

  const feedbackAdded = Boolean(input.feedbackText?.trim());
  const documentAdded = input.clientDocuments.some(
    (row) => row.processing_status === "processed",
  );

  return {
    meetingSourceLabel,
    meetingSourceReady,
    meetingSourceStatus,
    feedbackAdded,
    documentAdded,
  };
}

export function buildReadinessState(input: {
  mode: PostMeetingInputMode;
  queueItems: TranscriptQueueItem[];
  remoteTranscripts: TranscriptResponse[];
  feedbackText: string | null;
  clientDocuments: ClientDocument[];
  busy?: boolean;
}): PostMeetingReadinessState {
  const checklist = buildReadinessChecklist(input);
  const canContinue = checklist.meetingSourceReady && !input.busy;
  const continueBlockedReason = checklist.meetingSourceReady
    ? null
    : input.mode === "jamie"
      ? jamieUnavailableMessage()
      : hasProcessingTranscript(input.queueItems, input.remoteTranscripts)
        ? "Wait for transcript processing to finish."
        : "Upload or type meeting notes as a transcript file before continuing.";

  return {
    ...checklist,
    canContinue,
    continueBlockedReason,
    ctaLabel: "Generate Email",
    ctaHelperText: "Review Stage 2 outputs before sending email",
  };
}

export function notesTranscriptFileName(clientName: string): string {
  const safe = clientName.trim().replace(/[^\w.-]+/g, "-").replace(/-+/g, "-") || "meeting";
  return `${safe}-meeting-notes.txt`;
}

export function createNotesTranscriptFile(clientName: string, notes: string): File {
  return new File([notes.trim()], notesTranscriptFileName(clientName), { type: "text/plain" });
}
