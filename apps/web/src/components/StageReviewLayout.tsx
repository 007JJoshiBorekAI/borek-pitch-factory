"use client";

import Link from "next/link";
import React from "react";

import { AppPageHeader } from "@/components/AppPageHeader";
import { JourneyOutputStepper } from "@/components/JourneyOutputStepper";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { StageOutputHubPanel } from "@/components/StageOutputHubPanel";
import type { JourneyStageName } from "@/lib/api";
import { pipelineHref } from "@/lib/pipelineContext";
import type { StageOutputHubItem } from "@/lib/stageOutputReview";
import {
  type ConcretisationReviewStep,
  type DeepeningReviewStep,
  type FirstContactReviewStep,
} from "@/lib/stageOutputReview";

interface StageReviewLayoutProps {
  journeyStage: JourneyStageName;
  currentStep: FirstContactReviewStep | DeepeningReviewStep | ConcretisationReviewStep;
  opportunityId: string;
  clientName: string;
  opportunityName: string;
  kicker: string;
  title: string;
  lead: string;
  demoMode: boolean;
  loading: boolean;
  error: string | null;
  hubItems: StageOutputHubItem[];
  eligibilityLockCopy?: string | null;
  children: React.ReactNode;
}

export function StageReviewLayout({
  journeyStage,
  currentStep,
  opportunityId,
  clientName,
  opportunityName,
  kicker,
  title,
  lead,
  demoMode,
  loading,
  error,
  hubItems,
  eligibilityLockCopy = null,
  children,
}: StageReviewLayoutProps) {
  const backHref = pipelineHref("/upload", opportunityId);

  return (
    <WorkspaceShell className="stage-review-page">
      <div className="app-shell app-workspace-body">
        <div className="stage-review-context" aria-label="Opportunity">
          <span>{clientName}</span>
          <strong>{opportunityName}</strong>
          {demoMode ? <span className="stage-output-demo-badge">Demonstration data</span> : null}
        </div>

        <JourneyOutputStepper
          journeyStage={journeyStage}
          currentStep={currentStep}
          opportunityId={opportunityId}
          demoMode={demoMode}
          eligibilityLockCopy={eligibilityLockCopy}
        />

        <AppPageHeader kicker={kicker} title={title} lead={lead} />

        {error ? (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        ) : null}

        {loading ? <p className="journey-start-loading">Loading review context…</p> : null}

        <div className="stage-review-body">
          <section className="stage-review-content">{children}</section>
          <StageOutputHubPanel items={hubItems} />
        </div>

        <div className="stage-review-footer">
          <Link href={backHref} className="btn btn-secondary btn-sm">
            Back to intake
          </Link>
        </div>
      </div>
    </WorkspaceShell>
  );
}
