import type { AdditionalClientInformation } from "@/lib/api";

const MARKER = "\n\n[[pitch-draft]]\n";
const STORAGE_PREFIX = "borek.pitchDraft.";
const RELEASE_PREFIX = "borek.releaseDecision.";

export interface PitchDraft {
  pitchTitle: string;
  client: string;
  service: string;
  businessNeed: string;
  description: string;
  owner: string;
  team: string;
  voiceNote: string;
  meetingDate: string;
  participants: string;
  summary: string;
  painPoints: string;
  requirements: string;
  questions: string;
  businessOpportunity: string;
  proposedSolution: string;
  borekServices: string;
  scope: string;
  timeline: string;
  budget: string;
  decisionMakers: string;
  stakeholders: string;
  primaryContact: string;
  nextSteps: string;
  nextMeeting: string;
  actionItems: string;
  responsible: string;
  language: string;
  reviewedAt: string;
}

export type ReleaseDecision = "pending" | "changes" | "released";

export function emptyPitchDraft(seed: Partial<PitchDraft> = {}): PitchDraft {
  return {
    pitchTitle: "",
    client: "",
    service: "",
    businessNeed: "",
    description: "",
    owner: "",
    team: "",
    voiceNote: "",
    meetingDate: "",
    participants: "",
    summary: "",
    painPoints: "",
    requirements: "",
    questions: "",
    businessOpportunity: "",
    proposedSolution: "",
    borekServices: "",
    scope: "",
    timeline: "",
    budget: "",
    decisionMakers: "",
    stakeholders: "",
    primaryContact: "",
    nextSteps: "",
    nextMeeting: "",
    actionItems: "",
    responsible: "",
    language: "English",
    reviewedAt: "",
    ...seed,
  };
}

export function loadPitchDraft(opportunityId: string): PitchDraft | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${opportunityId}`);
  if (!raw) return null;
  try {
    return emptyPitchDraft(JSON.parse(raw) as Partial<PitchDraft>);
  } catch {
    return null;
  }
}

export function savePitchDraft(opportunityId: string, draft: PitchDraft): void {
  window.sessionStorage.setItem(`${STORAGE_PREFIX}${opportunityId}`, JSON.stringify(draft));
}

export function draftFromNotes(notes: string | null | undefined): PitchDraft | null {
  const raw = notes?.split(MARKER)[1]?.trim();
  if (!raw) return null;
  try {
    return emptyPitchDraft(JSON.parse(raw) as Partial<PitchDraft>);
  } catch {
    return null;
  }
}

export function notesWithDraft(notes: string | null | undefined, draft: PitchDraft): string {
  const base = (notes ?? "").split(MARKER)[0].trimEnd();
  const next = `${base}${MARKER}${JSON.stringify(draft)}`;
  return next.slice(0, 20_000);
}

export function informationWithDraft(
  current: AdditionalClientInformation | null | undefined,
  draft: PitchDraft,
): AdditionalClientInformation {
  return {
    location_requirements: current?.location_requirements ?? [],
    constraints: current?.constraints ?? [],
    contacts: current?.contacts ?? [],
    priorities: current?.priorities ?? [draft.businessNeed].filter(Boolean),
    notes: notesWithDraft(current?.notes, draft),
  };
}

export function sectionReady(draft: PitchDraft): { meeting: boolean; opportunity: boolean; stakeholders: boolean; nextSteps: boolean } {
  return {
    meeting: Boolean(draft.summary.trim() || draft.meetingDate.trim()),
    opportunity: Boolean(draft.businessOpportunity.trim() || draft.proposedSolution.trim()),
    stakeholders: Boolean(draft.decisionMakers.trim() || draft.primaryContact.trim()),
    nextSteps: Boolean(draft.nextSteps.trim() && draft.nextMeeting.trim() && draft.responsible.trim()),
  };
}

export function loadReleaseDecision(opportunityId: string): ReleaseDecision {
  if (typeof window === "undefined") return "pending";
  const value = window.sessionStorage.getItem(`${RELEASE_PREFIX}${opportunityId}`);
  if (value === "changes" || value === "released") return value;
  return "pending";
}

export function saveReleaseDecision(opportunityId: string, decision: ReleaseDecision): void {
  window.sessionStorage.setItem(`${RELEASE_PREFIX}${opportunityId}`, decision);
}
