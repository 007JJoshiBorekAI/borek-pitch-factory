import { ClientDirectoryPanel } from "@/components/ClientDirectoryPanel";
import { RequireAuth } from "@/components/RequireAuth";

export default function ClientsPage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <ClientDirectoryPanel />
      </Suspense>
    </RequireAuth>
  );
}
import { Suspense } from "react";
