import { AppPageHeader } from "@/components/AppPageHeader";
import { RequireAuth } from "@/components/RequireAuth";
import { WorkspaceShell } from "@/components/WorkspaceShell";

export default function ClientsPage() {
  return (
    <RequireAuth>
      <WorkspaceShell activeSection="clients">
        <main className="app-shell app-workspace-body">
          <div className="clients-placeholder">
            <p className="clients-placeholder-badge">FIGMA-04 placeholder</p>
            <AppPageHeader
              kicker="Clients"
              title="Client overview"
              lead="The Clients workspace is planned for FIGMA-04. Navigation is wired, but client list and management functionality are not implemented yet."
            />
            <p>
              Use <strong>Pre-meeting</strong> intake to create clients and pitches for now. Existing
              opportunities remain available from Recent presentations and Archive.
            </p>
          </div>
        </main>
      </WorkspaceShell>
    </RequireAuth>
  );
}
