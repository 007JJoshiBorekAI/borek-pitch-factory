import { ActivityLogPanel } from "@/components/ActivityLogPanel";
import { RequireAuth } from "@/components/RequireAuth";

export default function ActivityPage() {
  return (
    <RequireAuth>
      <ActivityLogPanel />
    </RequireAuth>
  );
}
