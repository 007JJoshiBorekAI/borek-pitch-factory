import { Suspense } from "react";

import { DeepeningReviewPanel } from "@/components/DeepeningReviewPanel";
import { StageReviewContextMissing } from "@/components/StageReviewContextMissing";
import { RequireAuth } from "@/components/RequireAuth";

export default async function DeepeningReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ opportunityId?: string }>;
}) {
  const opportunityId = (await searchParams).opportunityId?.trim() ?? "";
  return (
    <RequireAuth>
      {opportunityId ? (
        <Suspense fallback={<p className="journey-start-loading">Loading review…</p>}>
          <DeepeningReviewPanel opportunityId={opportunityId} />
        </Suspense>
      ) : (
        <StageReviewContextMissing
          title="Deepening post-meeting review"
          detail="Open this review from a Deepening opportunity after the first meeting transcript is uploaded."
        />
      )}
    </RequireAuth>
  );
}
