import type {
  OriginKind,
  SourceRef,
  Stage1Fact,
  Stage1Hypothesis,
  Stage1Research,
} from "./stage1Contracts";

export interface FactRowView {
  label: string;
  fieldKey: keyof Stage1Research["company_facts"];
  fact: Stage1Fact;
  displayValue: string;
  origin: OriginKind;
  isUnknown: boolean;
}

export function originLabel(origin: OriginKind): string {
  switch (origin) {
    case "SOURCE_FACT":
      return "Source-backed";
    case "AI_INFERENCE":
      return "AI hypothesis";
    case "USER_INPUT":
      return "User input";
    default:
      return "Unknown";
  }
}

export function originBadgeClassName(origin: OriginKind): string {
  switch (origin) {
    case "SOURCE_FACT":
      return "stage-origin-badge stage-origin-fact";
    case "AI_INFERENCE":
      return "stage-origin-badge stage-origin-inference";
    case "USER_INPUT":
      return "stage-origin-badge stage-origin-user";
    default:
      return "stage-origin-badge stage-origin-unknown";
  }
}

export function factDisplayValue(fact: Stage1Fact): string {
  if (fact.status === "verified" && fact.value) {
    return fact.value;
  }
  return "Unknown — no established fact";
}

export function hypothesisDisplayValue(hypothesis: Stage1Hypothesis): string | null {
  if (hypothesis.status === "generated" && hypothesis.text) {
    return hypothesis.text;
  }
  return null;
}

export function companyFactRows(research: Stage1Research): FactRowView[] {
  const labels: Record<keyof Stage1Research["company_facts"], string> = {
    description: "Company description",
    headquarters: "Headquarters",
    employee_headcount: "Headcount",
    decision_makers: "Decision makers",
    revenue: "Revenue",
  };

  return (Object.keys(labels) as Array<keyof Stage1Research["company_facts"]>).map(
    (fieldKey) => {
      const fact = research.company_facts[fieldKey];
      return {
        label: labels[fieldKey],
        fieldKey,
        fact,
        displayValue: factDisplayValue(fact),
        origin: fact.origin,
        isUnknown: fact.status === "unknown",
      };
    },
  );
}

export function formatSourceRef(ref: SourceRef): string {
  return `${ref.source_id} · ${ref.locator}`;
}

export function dependencyLabel(code: string): string {
  switch (code) {
    case "COMPANY_RESEARCH_PROVIDER_UNAVAILABLE":
      return "Company research provider unavailable";
    case "BOREK_OFFERING_UNAVAILABLE":
      return "Borek offering could not be resolved";
    case "HYPOTHESIS_GENERATION_NOT_RUN":
      return "Support hypothesis not generated";
    case "STAGE1_RESEARCH_UNAVAILABLE":
      return "Stage 1 research unavailable";
    case "CLIENT_DOCUMENTS_UNAVAILABLE":
      return "Client documents unavailable";
    case "USE_CASE_CORPUS_UNAVAILABLE":
      return "Use-case corpus unavailable";
    case "DISCOVERY_QUESTIONS_NOT_RUN":
      return "Discovery questions not generated";
    case "AGENDA_NOT_RUN":
      return "Meeting agenda not generated";
    case "PRESENTATION_NOT_RUN":
      return "First-meeting presentation not generated";
    case "STAGE1_OUTPUTS_NOT_GENERATED":
      return "First Contact outputs have not been generated yet";
    case "STAGE2_OUTPUTS_NOT_GENERATED":
      return "Deepening outputs have not been generated yet";
    case "FIRST_MEETING_PPT_PROFILE_UNFROZEN":
      return "First-meeting presentation profile is not frozen yet";
    case "RETRIEVAL_PROMPT_VERSION_UNAVAILABLE":
      return "Generation prompt version is not exposed by the retrieval API";
    default:
      return code;
  }
}
