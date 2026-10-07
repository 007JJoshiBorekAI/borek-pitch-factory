import { apiFetch, generateMeetingExtraction, resolveBackendOpportunityId, savePersonalNotes, type WorkflowDeckLine } from "./api";

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
export interface MeetingInputs {
  transcripts: MeetingTranscript[]; notes: PersonalNotes; extraction: MeetingExtraction | null;
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
  const [transcripts, notes, extraction] = await Promise.all([
    read<MeetingTranscript[]>("transcripts"), read<PersonalNotes>("personal-notes"),
    read<unknown>("meeting-extraction"),
  ]);
  return { transcripts, notes, extraction: parseMeetingExtraction(extraction) };
}

export function extractionIsCurrent(extraction: MeetingExtraction | null, transcriptId: string, notes: PersonalNotes) {
  return Boolean(extraction && extraction.transcript_id === transcriptId &&
    extraction.personal_notes_updated_at === (notes.text?.trim() ? notes.updated_at : null));
}

export class MeetingNotesConflict extends Error {
  constructor(readonly savedNotes: PersonalNotes) {
    super("Additional notes changed in another session. Your text is retained; choose which notes to use before continuing.");
  }
}

export async function prepareMeetingEvidence(
  token: string, opportunityId: string, transcriptId: string, notes: string, expectedNotes: PersonalNotes,
  options: { signal?: AbortSignal; onProgress?: (message: string) => void; onInputs?: (inputs: MeetingInputs) => void } = {},
) {
  const { signal, onProgress, onInputs } = options;
  const [inputs, workflow] = await Promise.all([
    loadMeetingInputs(token, opportunityId, signal), loadPostMeetingWorkflow(token, opportunityId, signal),
  ]);
  signal?.throwIfAborted();
  if (!workflowCompleted(workflow, "first_meeting_completed") || workflow.finalization || !workflow.documents.approved_discovery) {
    throw new Error("This pitch is not eligible for document generation. Check meeting completion and the approved Discovery document.");
  }
  if (!inputs.transcripts.some((item) => item.id === transcriptId)) throw new Error("Upload a transcript before generating documents.");
  if (notes.length > 20000) throw new Error("Additional notes must be 20,000 characters or fewer.");
  if (inputs.notes.updated_at !== expectedNotes.updated_at || inputs.notes.text !== expectedNotes.text) throw new MeetingNotesConflict(inputs.notes);
  if (notes.trim() !== (inputs.notes.text ?? "")) {
    onProgress?.("Saving additional notes");
    await savePersonalNotes(token, opportunityId, notes);
    signal?.throwIfAborted();
    inputs.notes = await apiFetch<PersonalNotes>(postMeetingPath(opportunityId, "personal-notes"), token, { signal, cache: "no-store" });
    signal?.throwIfAborted();
    if ((inputs.notes.text ?? "") !== notes.trim()) throw new MeetingNotesConflict(inputs.notes);
  }
  onInputs?.({ ...inputs });
  if (!extractionIsCurrent(inputs.extraction, transcriptId, inputs.notes)) {
    onProgress?.("Processing transcript");
    inputs.extraction = parseMeetingExtraction(await generateMeetingExtraction(token, opportunityId, transcriptId));
    signal?.throwIfAborted();
    if (!extractionIsCurrent(inputs.extraction, transcriptId, inputs.notes)) {
      throw new Error("The transcript has not finished processing for these notes. Retry generation.");
    }
    onInputs?.({ ...inputs });
  }
  return { inputs, workflow };
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
