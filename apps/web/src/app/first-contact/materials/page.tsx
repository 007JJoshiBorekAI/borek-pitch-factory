import { Suspense } from "react";

import { FirstContactMaterialsPanel } from "@/components/FirstContactMaterialsPanel";
import { StageReviewContextMissing } from "@/components/StageReviewContextMissing";
import { RequireAuth } from "@/components/RequireAuth";

export default async function FirstContactMaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ opportunityId?: string }>;
}) {
  const opportunityId = (await searchParams).opportunityId?.trim() ?? "";
  return (
    <RequireAuth>
      {opportunityId ? (
        <Suspense fallback={<p className="journey-start-loading">Loading materials…</p>}>
          <FirstContactMaterialsPanel opportunityId={opportunityId} />
        </Suspense>
      ) : (
        <StageReviewContextMissing
          title="First contact meeting materials"
          detail="Open meeting materials from a First contact opportunity after research outputs are ready."
        />
      )}
    </RequireAuth>
  );
}
