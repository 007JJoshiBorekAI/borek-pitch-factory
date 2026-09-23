import type { JourneyStageName } from "./api";
import {
  followupReviewHref,
  journeyStageForEmailArtifact,
} from "./stageEmailReview";
import {
  artifactsForJourneyStage,
  stageOutputStatusLabel,
  type StageOutputArtifactDefinition,
  type StageOutputArtifactId,
  type StageOutputArtifactStatus,
} from "./stageOutputArtifacts";

export const STAGE_OUTPUT_DEMO_QUERY = "demo";
export const STAGE_OUTPUT_BACKEND_NOTE =
  "Stage output APIs are not deployed on this environment yet (BT-36 Phase 3 onward).";

export interface StageOutputHubItem {
  id: StageOutputArtifactId;
  label: string;
  detail: string;
  status: StageOutputArtifactStatus;
  statusLabel: string;
  reviewHref: string | null;
  isDemo: boolean;
}

export interface StageOutputLiveContext {
  journeyStage: JourneyStageName;
  opportunityId: string;
  processedClientDocumentCount: number;
  hasStage1Intake: boolean;
  apiLoadFailed: boolean;
  /** Session-scoped POST result — not persisted across reload. */
  hasSessionResearch?: boolean;
}

export type FirstContactReviewStep = "intake" | "research" | "materials" | "email";
export type DeepeningReviewStep = "intake" | "generation" | "review" | "email";
export type ConcretisationReviewStep = "proposal" | "email";

export function isStageOutputDemoMode(search: string | URLSearchParams | null | undefined): boolean {
  if (!search) {
    return false;
  }
  const params =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search;
  return params.get(STAGE_OUTPUT_DEMO_QUERY) === "1";
}

export function appendDemoQuery(href: string, demoMode: boolean): string {
  if (!demoMode) {
    return href;
  }
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}${STAGE_OUTPUT_DEMO_QUERY}=1`;
}

function reviewHrefForArtifact(
  artifactId: StageOutputArtifactId,
  opportunityId: string,
  demoMode: boolean,
): string | null {
  const base = (path: string) => appendDemoQuery(`${path}?opportunityId=${encodeURIComponent(opportunityId)}`, demoMode);
  switch (artifactId) {
    case "company_research_brief":
    case "discovery_questions":
    case "use_case_relevance":
      return base("/first-contact/review");
    case "first_meeting_deck":
    case "meeting_agenda":
      return base("/first-contact/materials");
    case "optional_email":
    case "draft_email":
    case "proposal_followup_email": {
      const emailStage = journeyStageForEmailArtifact(artifactId);
      if (!emailStage) {
        return null;
      }
      return followupReviewHref(opportunityId, emailStage, demoMode);
    }
    case "call_summary":
    case "minutes_of_meeting":
    case "adjusted_deck":
      return base("/deepening/review");
    case "priced_proposal_deck":
      return `/deck-center?opportunityId=${encodeURIComponent(opportunityId)}`;
    default:
      return null;
  }
}

function liveStatusForArtifact(
  artifactId: StageOutputArtifactId,
  context: StageOutputLiveContext,
): StageOutputArtifactStatus {
  if (context.apiLoadFailed) {
    return "backend_unavailable";
  }

  if (artifactId === "priced_proposal_deck") {
    return "awaiting_generation";
  }

  if (context.journeyStage === "first_contact") {
    if (artifactId === "company_research_brief" && context.hasSessionResearch) {
      return "available";
    }

    const inputsReady =
      context.hasStage1Intake && context.processedClientDocumentCount > 0;
    if (!inputsReady) {
      return "awaiting_generation";
    }
  }

  return "backend_unavailable";
}

function hubItemFromDefinition(
  definition: StageOutputArtifactDefinition,
  context: StageOutputLiveContext,
  demoMode: boolean,
): StageOutputHubItem {
  if (demoMode) {
    return {
      id: definition.id,
      label: definition.label,
      detail: definition.detail,
      status: "available",
      statusLabel: "Demonstration data",
      reviewHref: reviewHrefForArtifact(definition.id, context.opportunityId, true),
      isDemo: true,
    };
  }

  const status = liveStatusForArtifact(definition.id, context);
  return {
    id: definition.id,
    label: definition.label,
    detail: definition.detail,
    status,
    statusLabel: stageOutputStatusLabel(status),
    reviewHref:
      status === "available"
        ? reviewHrefForArtifact(definition.id, context.opportunityId, false)
        : null,
    isDemo: false,
  };
}

export function buildStageOutputHubItems(
  context: StageOutputLiveContext,
  demoMode: boolean,
): StageOutputHubItem[] {
  return artifactsForJourneyStage(context.journeyStage).map((definition) =>
    hubItemFromDefinition(definition, context, demoMode),
  );
}

export const FIRST_CONTACT_REVIEW_STEPS: ReadonlyArray<{
  id: FirstContactReviewStep;
  label: string;
  path: string;
}> = [
  { id: "intake", label: "Intake", path: "/upload" },
  { id: "research", label: "Research review", path: "/first-contact/review" },
  { id: "materials", label: "Meeting materials", path: "/first-contact/materials" },
  { id: "email", label: "Optional email", path: "__followup_review__" },
];

export const DEEPENING_REVIEW_STEPS: ReadonlyArray<{
  id: DeepeningReviewStep;
  label: string;
  path: string;
}> = [
  { id: "intake", label: "Intake", path: "/upload" },
  { id: "generation", label: "Generation", path: "/framework-review" },
  { id: "review", label: "Post-meeting review", path: "/deepening/review" },
  { id: "email", label: "Follow-up email", path: "__followup_review__" },
];

export const CONCRETISATION_REVIEW_STEPS: ReadonlyArray<{
  id: ConcretisationReviewStep;
  label: string;
  path: string;
}> = [
  { id: "proposal", label: "Presentation", path: "/deck-center" },
  { id: "email", label: "Follow-up email", path: "__followup_review__" },
];

export { followupReviewHref } from "./stageEmailReview";

export function firstContactStepIndex(step: FirstContactReviewStep): number {
  return FIRST_CONTACT_REVIEW_STEPS.findIndex((row) => row.id === step);
}

export function deepeningStepIndex(step: DeepeningReviewStep): number {
  return DEEPENING_REVIEW_STEPS.findIndex((row) => row.id === step);
}
