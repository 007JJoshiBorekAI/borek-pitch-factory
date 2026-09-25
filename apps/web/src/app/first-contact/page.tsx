import { Suspense } from "react";

import { FirstContactPanel } from "@/components/FirstContactPanel";
import { RequireAuth } from "@/components/RequireAuth";

export default function FirstContactPage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <FirstContactPanel />
      </Suspense>
    </RequireAuth>
  );
}
