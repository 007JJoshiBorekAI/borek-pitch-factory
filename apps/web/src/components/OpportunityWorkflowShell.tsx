"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { DiscoveryWorkflowStepper } from "@/components/DiscoveryWorkflowStepper";
import { RequireAuth } from "@/components/RequireAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { useLanguage } from "@/components/LanguageProvider";
import { usePreviewJourney } from "@/components/PreviewJourneyProvider";
import type { DiscoveryFirstWorkspaceFixture } from "@/lib/discoveryFirst";

interface OpportunityWorkflowShellProps {
  fixture: DiscoveryFirstWorkspaceFixture;
  children: ReactNode;
}

export function OpportunityWorkflowShell({ fixture, children }: OpportunityWorkflowShellProps) {
  const { copy } = useLanguage();
  const pathname = usePathname();
  const { getOpportunity } = usePreviewJourney();
  const preview = getOpportunity(fixture.opportunity_id);
  const workflowSnapshot = preview?.workflow ?? fixture.workflow;
  const preMeetingStatuses = new Set(["client_information", "discovery_prepared", "ppt_1_ready"]);
  const activeSection = preMeetingStatuses.has(workflowSnapshot.current_status)
    ? "pre_meeting"
    : "post_meeting";
  const readyPages = preview?.discovery.pages.filter((page) => page.state === "ready").length ?? 0;
  const workspaceProgress = pathname.endsWith("/presentations") && preview?.presentation.state === "ready"
    ? `${preview.presentation.slide_count} of ${preview.presentation.slide_count} slides ready`
    : `${readyPages} of 7 pages ready`;
  return (
    <RequireAuth>
      <div className="app-workspace discovery-workflow-shell">
        <SiteHeader opportunityId={fixture.opportunity_id} activeSection={activeSection} />
        <main className="discovery-workflow-main">
          <div className="discovery-workflow-heading">
            <div>
              <p className="discovery-workflow-kicker">{copy.workflow.opportunity} {preview?.client.values.company_name ?? fixture.opportunity_id}</p>
              <h2>{copy.workflow.creating}</h2>
              <p className="discovery-workflow-meta">{workspaceProgress}</p>
            </div>
          </div>
          {activeSection === "post_meeting" ? (
            <DiscoveryWorkflowStepper
              opportunityId={fixture.opportunity_id}
              workflow={workflowSnapshot}
            />
          ) : null}
          {workflowSnapshot.blocked_reason ? (
            <p className="discovery-contract-notice" role="status">
              <strong>{copy.workflow.blocked}</strong> {workflowSnapshot.blocked_reason}
            </p>
          ) : null}
          {children}
        </main>
      </div>
    </RequireAuth>
  );
}
