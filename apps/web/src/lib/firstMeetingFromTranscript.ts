import type { PitchDraft } from "@/lib/pitchDraft";
import type { Stage2OutputsEnvelope, TranscriptSummary } from "@/lib/api";

const PAIN_HINT =
  /\b(pressure|problem|pain|complain|nightmare|exception|under pressure|loudest|triggered|scary)\b/i;
const REQUIREMENT_HINT =
  /\b(must|need|require|required|no long-term|stay in|security|least privilege|kill switch|logging|traceability|approved|not approved|works council|EU\b|data stays)\b/i;
const NEXT_MEETING_HINT =
  /\b(workshop|calendar|half-day|requirements workshop|book|15 October|next meeting)\b/i;

const ISO_DATE = /\b(\d{2}\.\d{2}\.\d{4})\b/;
const SPOKEN_DATE =
  /\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+\d{4})?)\b/i;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function uniqueLines(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

export function meetingDateFromSummary(summary: TranscriptSummary): string {
  const narrative = summary.narrative ?? "";
  const iso = narrative.match(ISO_DATE);
  if (iso?.[1]) return iso[1];
  const spoken = narrative.match(SPOKEN_DATE);
  if (spoken?.[1]) return spoken[1];
  for (const item of summary.action_items ?? []) {
    const due = item.due?.trim();
    if (due) return due;
    const inText = item.text.match(ISO_DATE);
    if (inText?.[1]) return inText[1];
    const spokenInText = item.text.match(SPOKEN_DATE);
    if (spokenInText?.[1]) return spokenInText[1];
  }
  return "";
}

export function painPointsFromSummary(summary: TranscriptSummary): string {
  const fromNarrative = splitSentences(summary.narrative ?? "").filter((line) => PAIN_HINT.test(line));
  return uniqueLines(fromNarrative).join("\n");
}

export function requirementsFromSummary(summary: TranscriptSummary): string {
  const fromDecisions = (summary.decisions ?? []).filter((line) => REQUIREMENT_HINT.test(line));
  const fromNarrative = splitSentences(summary.narrative ?? "").filter((line) => REQUIREMENT_HINT.test(line));
  return uniqueLines([...fromDecisions, ...fromNarrative]).join("\n");
}

export function questionsFromSummary(summary: TranscriptSummary): string {
  return uniqueLines(summary.open_questions ?? []).join("\n\n");
}

export function nextMeetingFromSummary(summary: TranscriptSummary): string {
  const hits = splitSentences(summary.narrative ?? "").filter((line) => NEXT_MEETING_HINT.test(line));
  if (hits.length > 0) {
    return hits[hits.length - 1];
  }
  for (const item of summary.action_items ?? []) {
    if (NEXT_MEETING_HINT.test(item.text)) {
      return item.text.trim();
    }
  }
  return "";
}

export function actionItemsFromSummary(summary: TranscriptSummary): string {
  return (summary.action_items ?? [])
    .map((item) => {
      const text = item.text.trim();
      if (!text) return "";
      const owner = item.owner?.trim();
      const due = item.due?.trim();
      const prefix = owner ? `${owner}: ` : "";
      const suffix = due ? ` (due ${due})` : "";
      return `${prefix}${text}${suffix}`;
    })
    .filter(Boolean)
    .join("\n");
}

export function nextStepsFromStage2Outputs(outputs: NonNullable<Stage2OutputsEnvelope["outputs"]>): string {
  const mom = outputs.mom;
  const parts = uniqueLines([
    ...(mom.decisions ?? []),
    ...(mom.action_items ?? []),
  ]);
  return parts.join("\n");
}

export function responsibleFromSummary(summary: TranscriptSummary): string {
  for (const item of summary.action_items ?? []) {
    const owner = item.owner?.trim();
    if (owner && /borek/i.test(owner)) {
      return owner.replace(/\s*\([^)]*\)\s*$/, "").trim();
    }
  }
  for (const item of summary.action_items ?? []) {
    const owner = item.owner?.trim();
    if (owner) {
      return owner.replace(/\s*\([^)]*\)\s*$/, "").trim();
    }
  }
  return "";
}

export interface MeetingDraftSuggestions {
  meetingDate: string;
  participants: string;
  summary: string;
  painPoints: string;
  requirements: string;
  questions: string;
  nextMeeting: string;
  actionItems: string;
  nextSteps: string;
  responsible: string;
}

export function meetingDraftSuggestionsFromStage2(
  outputs: NonNullable<Stage2OutputsEnvelope["outputs"]>,
): MeetingDraftSuggestions {
  const summary = outputs.transcript_summary as unknown as TranscriptSummary;
  return {
    meetingDate: meetingDateFromSummary(summary),
    participants: (summary.participants ?? []).join(", "),
    summary: outputs.call_summary.trim(),
    painPoints: painPointsFromSummary(summary),
    requirements: requirementsFromSummary(summary),
    questions: questionsFromSummary(summary),
    nextMeeting: nextMeetingFromSummary(summary),
    actionItems: actionItemsFromSummary(summary),
    nextSteps: nextStepsFromStage2Outputs(outputs),
    responsible: responsibleFromSummary(summary),
  };
}

export function stage2NeedsRefresh(
  latestTranscriptId: string | undefined,
  envelope: Stage2OutputsEnvelope | null,
): boolean {
  if (!latestTranscriptId) return false;
  if (!envelope || envelope.status !== "ready" || !envelope.outputs) return true;
  const summary = envelope.outputs.transcript_summary as unknown as TranscriptSummary | undefined;
  if (!summary?.transcript_id) return true;
  return summary.transcript_id !== latestTranscriptId;
}

export function meetingSectionEmpty(draft: PitchDraft): boolean {
  return !(
    draft.meetingDate.trim()
    || draft.participants.trim()
    || draft.summary.trim()
    || draft.painPoints.trim()
    || draft.requirements.trim()
    || draft.questions.trim()
  );
}

type MeetingFieldKey =
  | "meetingDate"
  | "participants"
  | "summary"
  | "painPoints"
  | "requirements"
  | "questions"
  | "nextMeeting"
  | "actionItems"
  | "nextSteps"
  | "responsible";

const MEETING_FIELD_KEYS: MeetingFieldKey[] = [
  "meetingDate",
  "participants",
  "summary",
  "painPoints",
  "requirements",
  "questions",
  "nextMeeting",
  "actionItems",
  "nextSteps",
  "responsible",
];

export function applyStage2OutputsToDraft(
  draft: PitchDraft,
  envelope: Stage2OutputsEnvelope,
  options: { overwriteMeeting?: boolean } = {},
): PitchDraft {
  if (envelope.status !== "ready" || !envelope.outputs) {
    return draft;
  }
  const suggested = meetingDraftSuggestionsFromStage2(envelope.outputs);
  const overwrite = options.overwriteMeeting ?? false;
  const next = { ...draft };
  for (const key of MEETING_FIELD_KEYS) {
    const value = suggested[key];
    if (!value.trim()) continue;
    const current = next[key].trim();
    if (overwrite || !current) {
      next[key] = value;
    }
  }
  return next;
}
