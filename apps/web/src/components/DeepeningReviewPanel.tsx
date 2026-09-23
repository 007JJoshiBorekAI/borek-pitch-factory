"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { StageReviewLayout } from "@/components/StageReviewLayout";
import { demoDeepeningMomSections, demoDeepeningSummary } from "@/lib/stageOutputDemoContent";
import { STAGE_OUTPUT_BACKEND_NOTE, isStageOutputDemoMode } from "@/lib/stageOutputReview";
import { loadStageReviewContext } from "@/lib/stageOutputReviewLoad";
import type { StageOutputHubItem } from "@/lib/stageOutputReview";

function UnavailableReviewState({ message }: { message: string }) {
  return (
    <div className="stage-review-unavailable">
      <strong>Post-meeting outputs not available yet</strong>
      <p>{message}</p>
    </div>
  );
}

export function DeepeningReviewPanel({ opportunityId }: { opportunityId: string }) {
  const { accessToken } = useAuth();
  const searchParams = useSearchParams();
  const demoMode = isStageOutputDemoMode(searchParams);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [opportunityName, setOpportunityName] = useState("");
  const [hubItems, setHubItems] = useState<StageOutputHubItem[]>([]);
  const [eligibilityLockCopy, setEligibilityLockCopy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!accessToken) {
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const loaded = await loadStageReviewContext(
          accessToken,
          opportunityId,
          "deepening",
          demoMode,
        );
        if (!active) {
          return;
        }
        setClientName(loaded.opportunity.client_name);
        setOpportunityName(loaded.opportunity.opportunity_name);
        setHubItems(loaded.hubItems);
        setEligibilityLockCopy(loaded.eligibilityLockCopy);
      } catch {
        if (active) {
          setError("Post-meeting review could not be loaded. Return to intake and try again.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [accessToken, demoMode, opportunityId]);

  return (
    <StageReviewLayout
      journeyStage="deepening"
      currentStep="review"
      opportunityId={opportunityId}
      clientName={clientName}
      opportunityName={opportunityName}
      kicker="Deepening"
      title="Post-meeting review"
      lead="Review the call summary, minutes of meeting, adjusted presentation, and post-meeting email draft."
      demoMode={demoMode}
      loading={loading}
      error={error}
      hubItems={hubItems}
      eligibilityLockCopy={eligibilityLockCopy}
    >
      {demoMode ? (
        <>
          <p className="stage-output-demo-banner" role="note">
            Demonstration data — sample BT-36 stage2_outputs fixture, not live meeting output.
          </p>
          <section className="upload-panel stage-review-section">
            <h2>Call summary</h2>
            <p>{demoDeepeningSummary()}</p>
          </section>
          <section className="upload-panel stage-review-section">
            <h2>Minutes of meeting</h2>
            <div className="stage-review-mom-sections">
              {demoDeepeningMomSections().map((section) => (
                <article key={section.heading}>
                  <h3>{section.heading}</h3>
                  <p>{section.body}</p>
                </article>
              ))}
            </div>
            <p className="upload-hint">
              DOCX download will connect to filed artefacts in a later MS-35 phase.
            </p>
          </section>
          <section className="upload-panel stage-review-section">
            <h2>Adjusted presentation</h2>
            <p className="upload-hint">
              Deck preview uses the existing presentation route when a live adjusted deck exists.
              No download URL is invented in this foundation pass.
            </p>
          </section>
        </>
      ) : (
        <UnavailableReviewState message={STAGE_OUTPUT_BACKEND_NOTE} />
      )}
    </StageReviewLayout>
  );
}
