import { generateStage2Outputs, getStage2Outputs } from "./api";
import { journeyOutputsErrorMessage } from "./apiErrors";
import {
  STAGE2_OUTPUTS_NOT_GENERATED,
  adaptStage2OutputsEnvelope,
  type AdaptedStage2Review,
} from "./stageOutputsApiAdapter";
import type { Stage2ArtifactAvailability } from "./stageOutputReview";

export async function fetchAdaptedStage2Outputs(
  accessToken: string,
  opportunityId: string,
): Promise<AdaptedStage2Review> {
  const envelope = await getStage2Outputs(accessToken, opportunityId);
  return adaptStage2OutputsEnvelope(envelope);
}

export async function generateAndFetchAdaptedStage2Outputs(
  accessToken: string,
  opportunityId: string,
): Promise<AdaptedStage2Review> {
  const envelope = await generateStage2Outputs(accessToken, opportunityId);
  return adaptStage2OutputsEnvelope(envelope);
}

export function stage2OutputsErrorMessage(error: unknown): string {
  return journeyOutputsErrorMessage(error);
}

export function isStage2OutputsReady(adapted: AdaptedStage2Review): boolean {
  return adapted.envelopeStatus === "ready" && adapted.panelOutputs !== null;
}

export function stage2OutputsUnavailableDependencies(adapted: AdaptedStage2Review | null): string[] {
  if (!adapted) {
    return [STAGE2_OUTPUTS_NOT_GENERATED];
  }
  return adapted.dependencies;
}

const EMPTY_STAGE2_AVAILABILITY: Stage2ArtifactAvailability = {
  call_summary: false,
  minutes_of_meeting: false,
  adjusted_deck: false,
};

export function deriveStage2ArtifactAvailability(
  adapted: AdaptedStage2Review | null,
): Stage2ArtifactAvailability {
  if (!adapted?.panelOutputs) {
    return EMPTY_STAGE2_AVAILABILITY;
  }

  const outputs = adapted.panelOutputs;
  const hasCallSummary =
    outputs.call_summary.status === "generated" && Boolean(outputs.call_summary.text?.trim());
  const hasMom =
    outputs.minutes_of_meeting.status === "generated" &&
    outputs.minutes_of_meeting.sections.length > 0;
  const hasDeck =
    outputs.presentation_ref.status === "generated" ||
    outputs.presentation_ref.status === "pending";

  return {
    call_summary: hasCallSummary,
    minutes_of_meeting: hasMom,
    adjusted_deck: hasDeck,
  };
}
