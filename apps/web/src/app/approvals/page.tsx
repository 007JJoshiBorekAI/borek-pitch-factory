import { Suspense } from "react";

import { ApprovalsPanel } from "@/components/ApprovalsPanel";
import { RequireAuth } from "@/components/RequireAuth";

export default function ApprovalsPage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <ApprovalsPanel />
      </Suspense>
    </RequireAuth>
  );
}
