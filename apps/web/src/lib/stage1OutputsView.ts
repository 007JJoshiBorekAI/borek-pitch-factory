import type {
  AgendaItem,
  DiscoveryQuestion,
  DiscoveryQuestionCollection,
  MeetingAgenda,
  PresentationRef,
  UseCaseCollection,
  UseCaseMatch,
} from "./stage1Contracts";
import { FIRST_CONTACT_SLIDE_COUNT } from "./stageOutputArtifacts";
import { dependencyLabel } from "./stage1ResearchView";

export function sortedAgendaItems(agenda: MeetingAgenda): AgendaItem[] {
  return [...agenda.items].sort((left, right) => left.order - right.order);
}

export function discoveryQuestionCount(collection: DiscoveryQuestionCollection): number {
  return collection.items.filter((item) => item.status === "generated" && item.text).length;
}

export function discoveryQuestionsUnavailableMessage(
  collection: DiscoveryQuestionCollection,
  dependencies: string[] = [],
): string {
  if (collection.status === "unknown") {
    const dependency = dependencies.find((code) => code.startsWith("DISCOVERY") || code.includes("RESEARCH"));
    return dependency
      ? dependencyLabel(dependency)
      : "Discovery questions have not been generated yet.";
  }
  const count = discoveryQuestionCount(collection);
  if (count < 10) {
    return `Only ${count} questions available — the contract requires 10–15 when successfully generated.`;
  }
  return "Discovery questions are not available.";
}

export function useCaseStatusLabel(status: UseCaseMatch["status"]): string {
  switch (status) {
    case "matched":
      return "Matched";
    case "none_found":
      return "No match";
    default:
      return "Unknown";
  }
}

export function useCaseStatusClassName(status: UseCaseMatch["status"]): string {
  switch (status) {
    case "matched":
      return "stage-use-case-matched";
    case "none_found":
      return "stage-use-case-none";
    default:
      return "stage-use-case-unknown";
  }
}

export function useCasesUnavailableMessage(
  collection: UseCaseCollection,
  dependencies: string[] = [],
): string {
  if (collection.status === "unknown") {
    const corpusDependency = dependencies.find((code) => code.includes("CORPUS"));
    return corpusDependency
      ? dependencyLabel(corpusDependency)
      : "Use-case matching has not been generated yet.";
  }
  return "Use-case relevance is not available.";
}

export function agendaUnavailableMessage(
  agenda: MeetingAgenda,
  dependencies: string[] = [],
): string {
  if (agenda.status === "unknown") {
    const dependency = dependencies.find((code) => code.includes("AGENDA"));
    return dependency ? dependencyLabel(dependency) : "Meeting agenda has not been generated yet.";
  }
  return "Meeting agenda is not available.";
}

export function presentationUnavailableMessage(
  presentationRef: PresentationRef,
  dependencies: string[] = [],
): string {
  if (presentationRef.status === "generated") {
    return "Presentation reference exists but no authorized preview or download is available in this environment.";
  }
  if (presentationRef.status === "pending") {
    const unfrozen = dependencies.find((code) => code.includes("PPT_PROFILE_UNFROZEN"));
    if (unfrozen) {
      return dependencyLabel(unfrozen);
    }
    return "First-meeting presentation generation is pending.";
  }
  const dependency = dependencies.find((code) => code.includes("PRESENTATION"));
  return dependency
    ? dependencyLabel(dependency)
    : "First-meeting presentation has not been generated yet.";
}

export function presentationProfileSummary(presentationRef: PresentationRef): string {
  return `${presentationRef.profile} · ${FIRST_CONTACT_SLIDE_COUNT} slides`;
}

export function discoveryQuestionCopyText(question: DiscoveryQuestion, index: number): string {
  return `${index + 1}. ${question.text ?? ""}`.trim();
}

export function allDiscoveryQuestionsCopyText(questions: DiscoveryQuestion[]): string {
  return questions
    .filter((item) => item.status === "generated" && item.text)
    .map((item, index) => discoveryQuestionCopyText(item, index))
    .join("\n");
}
