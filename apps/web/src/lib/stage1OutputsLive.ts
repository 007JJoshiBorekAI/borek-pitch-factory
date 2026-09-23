import { generateStage1Outputs, getStage1Outputs } from "./api";
import { journeyOutputsErrorMessage } from "./apiErrors";
import {
  STAGE1_OUTPUTS_NOT_GENERATED,
  adaptStage1OutputsEnvelope,
  type AdaptedStage1Review,
} from "./stageOutputsApiAdapter";
import type { Stage1ArtifactAvailability } from "./stageOutputReview";

export async function fetchAdaptedStage1Outputs(
  accessToken: string,
  opportunityId: string,
): Promise<AdaptedStage1Review> {
  const envelope = await getStage1Outputs(accessToken, opportunityId);
  return adaptStage1OutputsEnvelope(envelope);
}

export async function generateAndFetchAdaptedStage1Outputs(
  accessToken: string,
  opportunityId: string,
): Promise<AdaptedStage1Review> {
  const envelope = await generateStage1Outputs(accessToken, opportunityId);
  return adaptStage1OutputsEnvelope(envelope);
}

export function stage1OutputsErrorMessage(error: unknown): string {
  return journeyOutputsErrorMessage(error);
}

export function isStage1OutputsReady(adapted: AdaptedStage1Review): boolean {
  return adapted.envelopeStatus === "ready" && adapted.panelOutputs !== null;
}

export function stage1OutputsUnavailableDependencies(adapted: AdaptedStage1Review | null): string[] {
  if (!adapted) {
    return [STAGE1_OUTPUTS_NOT_GENERATED];
  }
  return adapted.dependencies;
}

const EMPTY_STAGE1_AVAILABILITY: Stage1ArtifactAvailability = {
  company_research_brief: false,
  discovery_questions: false,
  use_case_relevance: false,
  first_meeting_deck: false,
  meeting_agenda: false,
};

export function deriveStage1ArtifactAvailability(
  adapted: AdaptedStage1Review | null,
): Stage1ArtifactAvailability {
  if (!adapted?.panelOutputs) {
    return EMPTY_STAGE1_AVAILABILITY;
  }

  const outputs = adapted.panelOutputs;
  const hasGeneratedQuestions =
    outputs.discovery_questions.status === "generated" &&
    outputs.discovery_questions.items.some((item) => item.status === "generated" && item.text);
  const hasUseCases =
    outputs.use_cases.status === "generated" && outputs.use_cases.items.length > 0;
  const hasAgenda =
    outputs.meeting_agenda.status === "generated" && outputs.meeting_agenda.items.length > 0;
  const hasDeck =
    outputs.presentation_ref.status === "generated" ||
    outputs.presentation_ref.status === "pending";

  return {
    company_research_brief: adapted.embeddedResearch !== null,
    discovery_questions: hasGeneratedQuestions,
    use_case_relevance: hasUseCases,
    first_meeting_deck: hasDeck,
    meeting_agenda: hasAgenda,
  };
}

/** Retrieval responses leave prompt_version empty; never treat it as a generation version. */
export function isRetrievalPromptVersionUnavailable(promptVersion: string): boolean {
  return promptVersion.trim().length === 0;
}
