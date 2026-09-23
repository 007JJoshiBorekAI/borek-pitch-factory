import {
  getJourneyStageEligibility,
  getOpportunity,
  listClientDocuments,
  type JourneyStageEligibilityResponse,
  type OpportunityResponse,
} from "./api";
import { lockCopyFor, visibleJourneyStages } from "./journeyStageEligibility";
import { hasStage1IntakeContent } from "./stage1Intake";
import {
  buildStageOutputHubItems,
  type StageOutputHubItem,
  type StageOutputLiveContext,
} from "./stageOutputReview";

export interface LoadedStageReviewContext {
  opportunity: OpportunityResponse;
  eligibility: JourneyStageEligibilityResponse;
  hubItems: StageOutputHubItem[];
  eligibilityLockCopy: string | null;
  processedClientDocumentCount: number;
  liveContextHasIntake: boolean;
}

export async function loadStageReviewContext(
  accessToken: string,
  opportunityId: string,
  journeyStage: StageOutputLiveContext["journeyStage"],
  demoMode: boolean,
): Promise<LoadedStageReviewContext> {
  const [opportunity, eligibility, documents] = await Promise.all([
    getOpportunity(accessToken, opportunityId),
    getJourneyStageEligibility(accessToken, opportunityId, journeyStage),
    journeyStage === "first_contact"
      ? listClientDocuments(accessToken, opportunityId).catch(() => [])
      : Promise.resolve([]),
  ]);

  const processedClientDocumentCount = documents.filter(
    (row) => row.processing_status === "processed",
  ).length;

  const liveContext: StageOutputLiveContext = {
    journeyStage,
    opportunityId,
    processedClientDocumentCount,
    hasStage1Intake: hasStage1IntakeContent(opportunity.stage1_intake),
    apiLoadFailed: false,
  };

  const stageRow = visibleJourneyStages(eligibility).find((row) => row.id === journeyStage);
  const eligibilityLockCopy = stageRow?.lockReason ?? null;

  return {
    opportunity,
    eligibility,
    hubItems: buildStageOutputHubItems(liveContext, demoMode),
    eligibilityLockCopy,
    processedClientDocumentCount,
    liveContextHasIntake: liveContext.hasStage1Intake,
  };
}
