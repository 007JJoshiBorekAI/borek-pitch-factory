import { Suspense } from "react";

import { NewPitchPanel } from "@/components/NewPitchPanel";
import { RequireAuth } from "@/components/RequireAuth";

export default function HomePage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <NewPitchPanel />
      </Suspense>
    </RequireAuth>
  );
}
