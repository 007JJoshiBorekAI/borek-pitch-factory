import { FollowupReviewPanel } from "@/components/FollowupReviewPanel";
import { PipelineContextMissing } from "@/components/PipelineContextMissing";
import { RequireAuth } from "@/components/RequireAuth";
import { parseEmailReviewJourneyStage } from "@/lib/stageEmailReview";

export default async function FollowupReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ opportunityId?: string; journeyStage?: string }>;
}) {
  const params = await searchParams;
  const opportunityId = params.opportunityId?.trim() ?? "";
  const journeyStage = parseEmailReviewJourneyStage(params.journeyStage);
  return (
    <RequireAuth>
      {opportunityId ? (
        <FollowupReviewPanel opportunityId={opportunityId} journeyStage={journeyStage} />
      ) : (
        <PipelineContextMissing
          title="Email review"
          detail="Open this review from an opportunity workflow step after email settings are available."
        />
      )}
    </RequireAuth>
  );
}
