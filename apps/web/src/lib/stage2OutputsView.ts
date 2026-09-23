import type {
  ActionItem,
  MinutesOfMeeting,
  Stage2SummaryBlock,
  StatedItem,
  TranscriptTurnRef,
} from "./stage2Contracts";
import { dependencyLabel } from "./stage1ResearchView";

export function formatTranscriptTurnRef(ref: TranscriptTurnRef): string {
  return `${ref.conversation_id} · ${ref.speaker_role} · ${ref.excerpt_pointer}`;
}

export function confidenceLabel(confidence: StatedItem["confidence"]): string {
  switch (confidence) {
    case "high":
      return "High confidence";
    case "medium":
      return "Medium confidence";
    case "low":
      return "Low confidence";
    default:
      return "Unknown confidence";
  }
}

export function displayOwner(owner: string | null): string {
  return owner ?? "Unknown owner";
}

export function displayDue(due: string | null): string {
  return due ?? "No deadline stated";
}

export function callSummaryUnavailableMessage(
  summary: Stage2SummaryBlock,
  dependencies: string[] = [],
): string {
  if (summary.status === "unknown") {
    const dependency = dependencies.find((code) => code.includes("CALL_SUMMARY"));
    return dependency ? dependencyLabel(dependency) : "Call summary has not been generated yet.";
  }
  return "Call summary is not available.";
}

export function momUnavailableMessage(
  mom: MinutesOfMeeting,
  dependencies: string[] = [],
): string {
  if (mom.status === "unknown") {
    const dependency = dependencies.find((code) => code.includes("MOM"));
    return dependency ? dependencyLabel(dependency) : "Minutes of meeting have not been generated yet.";
  }
  return "Minutes of meeting are not available.";
}

export function stage2DependencyLabel(code: string): string {
  switch (code) {
    case "TRANSCRIPT_SUMMARY_UNAVAILABLE":
      return "Transcript summary unavailable";
    case "MEETING_FEEDBACK_UNAVAILABLE":
      return "Meeting feedback unavailable";
    case "CALL_SUMMARY_NOT_RUN":
      return "Call summary not generated";
    case "MOM_NOT_RUN":
      return "Minutes of meeting not generated";
    case "PRESENTATION_NOT_RUN":
      return "Adjusted presentation not generated";
    default:
      return dependencyLabel(code);
  }
}

export function adjustedPresentationUnavailableMessage(
  status: string,
  dependencies: string[] = [],
): string {
  if (status === "pending") {
    return "Adjusted presentation generation is pending.";
  }
  if (status === "generated") {
    return "Presentation reference exists but stage and opportunity could not be verified from backend metadata.";
  }
  const dependency = dependencies.find((code) => code.includes("PRESENTATION"));
  return dependency
    ? stage2DependencyLabel(dependency)
    : "Adjusted presentation has not been generated yet.";
}

export function hasGeneratedActionItems(items: ActionItem[]): ActionItem[] {
  return items.filter((item) => item.origin === "SOURCE_FACT" && item.action);
}
