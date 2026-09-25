import type { JourneyStageName } from "./api";

/** BT-36 first-meeting presentation profile — not the 8-slide Figma reference. */
export const FIRST_CONTACT_SLIDE_COUNT = 3;

export type StageOutputArtifactStatus =
  | "available"
  | "awaiting_generation"
  | "generation_failed"
  | "backend_unavailable";

export type StageOutputArtifactId =
  | "company_research_brief"
  | "discovery_questions"
  | "use_case_relevance"
  | "first_meeting_deck"
  | "meeting_agenda"
  | "optional_email"
  | "call_summary"
  | "minutes_of_meeting"
  | "adjusted_deck"
  | "draft_email"
  | "priced_proposal_deck"
  | "proposal_followup_email";

export interface StageOutputArtifactDefinition {
  id: StageOutputArtifactId;
  label: string;
  detail: string;
}

export const FIRST_CONTACT_ARTIFACTS: readonly StageOutputArtifactDefinition[] = [
  {
    id: "company_research_brief",
    label: "Company research brief",
    detail: "Description, headcount, HQ, decision makers, revenue",
  },
  {
    id: "discovery_questions",
    label: "Discovery questions",
    detail: "10–15 probing questions for the first meeting",
  },
  {
    id: "use_case_relevance",
    label: "Use case relevance",
    detail: "Matched Borek use cases with rationale",
  },
  {
    id: "first_meeting_deck",
    label: "First-meeting presentation",
    detail: `${FIRST_CONTACT_SLIDE_COUNT}-slide profile (AI-tech, hypothesis, use case)`,
  },
  {
    id: "meeting_agenda",
    label: "First-meeting agenda",
    detail: "Timed agenda for the initial client conversation",
  },
  {
    id: "optional_email",
    label: "Optional pre-meeting email",
    detail: "Draft intro email for the client",
  },
];

export const DEEPENING_ARTIFACTS: readonly StageOutputArtifactDefinition[] = [
  {
    id: "call_summary",
    label: "Call summary",
    detail: "Structured summary of the first meeting",
  },
  {
    id: "minutes_of_meeting",
    label: "Minutes of meeting",
    detail: "Formal MOM document for download",
  },
  {
    id: "adjusted_deck",
    label: "Adjusted presentation",
    detail: "Deck updated from the meeting discussion",
  },
  {
    id: "draft_email",
    label: "Post-meeting email",
    detail: "Primary follow-up draft for client review",
  },
];

export const CONCRETISATION_EMAIL_ARTIFACT: StageOutputArtifactDefinition = {
  id: "proposal_followup_email",
  label: "Proposal follow-up email",
  detail: "Optional email after the priced proposal deck is ready",
};

export function artifactsForJourneyStage(
  journeyStage: JourneyStageName,
): readonly StageOutputArtifactDefinition[] {
  switch (journeyStage) {
    case "first_contact":
      return FIRST_CONTACT_ARTIFACTS;
    case "deepening":
      return DEEPENING_ARTIFACTS;
    case "concretisation":
      return [CONCRETISATION_EMAIL_ARTIFACT];
    default:
      return [];
  }
}

export function stageOutputStatusLabel(status: StageOutputArtifactStatus): string {
  switch (status) {
    case "available":
      return "Available for review";
    case "awaiting_generation":
      return "Awaiting generation";
    case "generation_failed":
      return "Generation failed";
    default:
      return "Backend not available";
  }
}

export function stageOutputStatusClassName(status: StageOutputArtifactStatus): string {
  switch (status) {
    case "available":
      return "stage-output-status-available";
    case "awaiting_generation":
      return "stage-output-status-awaiting";
    case "generation_failed":
      return "stage-output-status-failed";
    default:
      return "stage-output-status-unavailable";
  }
}
