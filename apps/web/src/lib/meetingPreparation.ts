import type { PitchDraft } from "@/lib/pitchDraft";

const DEFAULT_DISCOVERY_QUESTIONS = [
  "What is driving the need to change now?",
  "Which languages and channels are in scope?",
  "Where does quality break down today?",
  "How are volume and service levels measured?",
  "Who owns the final decision?",
  "What must be true after 90 days?",
];

export function discoveryQuestionsFromDraft(draft: PitchDraft): string[] {
  const fromField = draft.questions
    .split(/\n+/)
    .map((line) => line.replace(/^\s*\d+[\).\s-]+/, "").trim())
    .filter(Boolean);
  if (fromField.length > 0) {
    return fromField;
  }
  return DEFAULT_DISCOVERY_QUESTIONS;
}

export function meetingPrepBannerSummary(questionCount: number): string {
  return `8-slide pitch · ${questionCount} discovery questions · 30-minute agenda`;
}

export function formatMeetingPrepUpdated(iso: string | undefined): string | null {
  if (!iso?.trim()) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
