import { Suspense } from "react";

import { FirstContactReviewPanel } from "@/components/FirstContactReviewPanel";
import { StageReviewContextMissing } from "@/components/StageReviewContextMissing";
import { RequireAuth } from "@/components/RequireAuth";

export default async function FirstContactReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ opportunityId?: string }>;
}) {
  const opportunityId = (await searchParams).opportunityId?.trim() ?? "";
  return (
    <RequireAuth>
      {opportunityId ? (
        <Suspense fallback={<p className="journey-start-loading">Loading review…</p>}>
          <FirstContactReviewPanel opportunityId={opportunityId} />
        </Suspense>
      ) : (
        <StageReviewContextMissing
          title="First contact research review"
          detail="Open this review from a First contact opportunity after intake and client documents are saved."
        />
      )}
    </RequireAuth>
  );
}
