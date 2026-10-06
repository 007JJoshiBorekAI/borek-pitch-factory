import { apiFetch, resolveBackendOpportunityId, type WorkflowDeckLine } from "./api";

export const EXTRACTION_FIELDS = [
  ["requirements", "Requirements"], ["challenges", "Challenges"], ["priorities", "Priorities"],
  ["opportunities", "Opportunities"], ["discussed_solutions", "Discussed solutions"],
  ["decisions", "Decisions"], ["follow_ups", "Follow-ups"],
] as const;

export interface PostMeetingWorkflow {
  opportunity_id: string;
  current_status: string;
  steps: { key: string; state: "completed" | "current" | "pending" }[];
  documents: {
    approved_discovery: { version_id: string; version_number: number } | null;
    ppt1: WorkflowDeckLine | null;
    ppt2: WorkflowDeckLine | null;
  };
  finalization: Record<string, unknown> | null;
}

export interface MeetingTranscript {
  id: string; file_name: string; processing_status: string; created_at: string;
}
export interface PersonalNotes { text: string | null; updated_at: string | null }
export type MeetingExtraction = {
  transcript_id: string; generated_at: string; personal_notes_updated_at: string | null;
} & Record<(typeof EXTRACTION_FIELDS)[number][0], string[]>;
export interface AttachableUseCase {
  fact_id: string; title: string | null; statement: string | null;
  document_id: string; document_version: string; service_key: string | null;
}
export interface SavedUseCases {
  use_case_ids: string[];
  use_cases: { fact_id: string; status: "resolved" | "unresolved"; document_version: string | null; payload: Record<string, unknown> | null }[];
}
export interface MeetingInputs {
  transcripts: MeetingTranscript[]; notes: PersonalNotes; extraction: MeetingExtraction | null;
  available: AttachableUseCase[]; selected: SavedUseCases;
}

export function postMeetingPath(opportunityId: string, suffix: string) {
  return `/opportunities/${encodeURIComponent(resolveBackendOpportunityId(opportunityId))}/${suffix}`;
}

export async function loadPostMeetingWorkflow(token: string, opportunityId: string, signal?: AbortSignal) {
  const value = await apiFetch<PostMeetingWorkflow>(postMeetingPath(opportunityId, "workflow-status"), token, { signal, cache: "no-store" });
  if (value.opportunity_id !== resolveBackendOpportunityId(opportunityId) || !Array.isArray(value.steps) || !value.documents) {
    throw new Error("The workflow response is incomplete or belongs to another opportunity. Reload to retry.");
  }
  return value;
}

export function parseMeetingExtraction(value: unknown): MeetingExtraction | null {
  if (!value || typeof value !== "object") throw new Error("Invalid meeting extraction response.");
  const record = value as Record<string, unknown>;
  if (record.status === "not_generated" && record.extraction === null) return null;
  if (typeof record.transcript_id !== "string" || typeof record.generated_at !== "string" ||
    !(record.personal_notes_updated_at === null || typeof record.personal_notes_updated_at === "string") ||
    EXTRACTION_FIELDS.some(([key]) => !Array.isArray(record[key]) || !(record[key] as unknown[]).every((item) => typeof item === "string"))) {
    throw new Error("The meeting extraction is incomplete. Retry extraction before generating PPT #2.");
  }
  return value as MeetingExtraction;
}

export async function loadMeetingInputs(token: string, opportunityId: string, signal?: AbortSignal): Promise<MeetingInputs> {
  const read = <T>(suffix: string) => apiFetch<T>(postMeetingPath(opportunityId, suffix), token, { signal, cache: "no-store" });
  const [transcripts, notes, extraction, available, selected] = await Promise.all([
    read<MeetingTranscript[]>("transcripts"), read<PersonalNotes>("personal-notes"),
    read<unknown>("meeting-extraction"), read<{ use_cases: AttachableUseCase[] }>("available-use-cases"),
    read<SavedUseCases>("selected-use-cases"),
  ]);
  return { transcripts, notes, extraction: parseMeetingExtraction(extraction), available: available.use_cases, selected };
}

export function extractionIsCurrent(extraction: MeetingExtraction | null, transcriptId: string, notes: PersonalNotes) {
  return Boolean(extraction && extraction.transcript_id === transcriptId &&
    extraction.personal_notes_updated_at === (notes.text?.trim() ? notes.updated_at : null));
}

export function meetingEvidenceKey(inputs: MeetingInputs) {
  return JSON.stringify({ extraction: inputs.extraction, notes: inputs.notes, selected: inputs.selected });
}

export function workflowCompleted(workflow: PostMeetingWorkflow | null, key: string) {
  return workflow?.steps.some((step) => step.key === key && step.state === "completed") ?? false;
}

export function validateTranscript(file: { name: string; size: number }): string | null {
  if (!/\.(txt|vtt|srt|docx)$/i.test(file.name)) return "Choose a TXT, VTT, SRT, or DOCX transcript.";
  if (!file.size) return "The transcript is empty. Choose a file containing meeting text.";
  return null;
}

export function postMeetingError(error: unknown) {
  return error instanceof Error ? error.message : "The request failed. Your unsaved input is retained; please retry.";
}
