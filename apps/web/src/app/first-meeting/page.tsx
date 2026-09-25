import { Suspense } from "react";

import { FirstMeetingPanel } from "@/components/FirstMeetingPanel";
import { RequireAuth } from "@/components/RequireAuth";

export default function FirstMeetingPage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <FirstMeetingPanel />
      </Suspense>
    </RequireAuth>
  );
}
