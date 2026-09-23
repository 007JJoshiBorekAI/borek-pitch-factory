import { ClientDirectoryPanel } from "@/components/ClientDirectoryPanel";
import { RequireAuth } from "@/components/RequireAuth";

export default function ClientsPage() {
  return (
    <RequireAuth>
      <ClientDirectoryPanel />
    </RequireAuth>
  );
}
