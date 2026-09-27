import { ClientsWorkspacePanel } from "@/components/ClientsWorkspacePanel";
import { RequireAuth } from "@/components/RequireAuth";
import { WorkspaceShell } from "@/components/WorkspaceShell";

export default function ClientsPage() {
  return (
    <RequireAuth>
      <WorkspaceShell activeSection="clients">
        <ClientsWorkspacePanel />
      </WorkspaceShell>
    </RequireAuth>
  );
}
