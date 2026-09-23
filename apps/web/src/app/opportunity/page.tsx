import { Suspense } from "react";

import { OpportunityStagePanel } from "@/components/OpportunityStagePanel";
import { RequireAuth } from "@/components/RequireAuth";

export default function OpportunityStagePage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <OpportunityStagePanel />
      </Suspense>
    </RequireAuth>
  );
}
