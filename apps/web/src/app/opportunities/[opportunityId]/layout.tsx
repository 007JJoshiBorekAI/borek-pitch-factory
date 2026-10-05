import type { ReactNode } from "react";

import { OpportunityWorkflowShell } from "@/components/OpportunityWorkflowShell";
import { RequireAuth } from "@/components/RequireAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { NewClientWorkspace } from "@/components/NewClientWorkspace";
import { discoveryFirstFixtureForOpportunity } from "@/lib/discoveryFirstFixtures";

interface OpportunityLayoutProps {
  children: ReactNode;
  params: Promise<{ opportunityId: string }>;
}

export default async function OpportunityLayout({ children, params }: OpportunityLayoutProps) {
  const { opportunityId } = await params;
  if (opportunityId === "new") {
    return (
      <RequireAuth>
        <div className="app-workspace new-client-workspace">
          <SiteHeader activeSection="pre_meeting" />
          <NewClientWorkspace>{children}</NewClientWorkspace>
        </div>
      </RequireAuth>
    );
  }
  const fixture = discoveryFirstFixtureForOpportunity(opportunityId);
  return <OpportunityWorkflowShell fixture={fixture}>{children}</OpportunityWorkflowShell>;
}
