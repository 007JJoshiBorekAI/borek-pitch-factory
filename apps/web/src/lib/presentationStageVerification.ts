import { listArchiveArtifacts } from "./api";
import type { JourneyStageName } from "./api";

export interface PresentationRefLike {
  status: "pending" | "generated" | "unknown";
  profile: string;
  presentation_id: string | null;
  presentation_version_id: string | null;
}

export interface VerifiedStagePresentation {
  presentationId: string;
  presentationVersionId: string | null;
  profile: string;
  journeyStage: JourneyStageName;
  opportunityId: string;
  verificationSource: "archive_artifact";
}

const PROFILE_STAGE: Record<string, JourneyStageName> = {
  first_meeting_3_slide: "first_contact",
  deepening_adjusted: "deepening",
};

export function journeyStageForProfile(profile: string): JourneyStageName | null {
  return PROFILE_STAGE[profile] ?? null;
}

/**
 * Resolve a stage presentation only when archive metadata confirms both the
 * opportunity and journey stage. Slide count and latest-presentation heuristics
 * are intentionally not used.
 */
export async function resolveVerifiedStagePresentation(
  accessToken: string,
  opportunityId: string,
  expectedProfile: string,
): Promise<VerifiedStagePresentation | null> {
  const journeyStage = journeyStageForProfile(expectedProfile);
  if (!journeyStage) {
    return null;
  }

  try {
    const artifacts = await listArchiveArtifacts(accessToken);
    const match = artifacts.find(
      (artifact) =>
        artifact.opportunity_id === opportunityId &&
        artifact.journey_stage === journeyStage &&
        Boolean(artifact.presentation_id),
    );
    if (!match) {
      return null;
    }
    return {
      presentationId: match.presentation_id,
      presentationVersionId: match.presentation_version_id,
      profile: expectedProfile,
      journeyStage,
      opportunityId,
      verificationSource: "archive_artifact",
    };
  } catch {
    return null;
  }
}

/** @deprecated Use resolveVerifiedStagePresentation — slide count is not verification. */
export async function resolveVerifiedFirstMeetingPresentation(): Promise<null> {
  return null;
}
