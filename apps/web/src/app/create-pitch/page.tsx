import { Suspense } from "react";

import { CreatePitchPanel } from "@/components/CreatePitchPanel";
import { RequireAuth } from "@/components/RequireAuth";

export default function CreatePitchPage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <CreatePitchPanel />
      </Suspense>
    </RequireAuth>
  );
}
