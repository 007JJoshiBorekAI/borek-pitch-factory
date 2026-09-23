"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { StageReviewLayout } from "@/components/StageReviewLayout";
import {
  demoDiscoveryQuestions,
  demoHypothesisText,
  demoResearchFacts,
  demoUseCases,
} from "@/lib/stageOutputDemoContent";
import { STAGE_OUTPUT_BACKEND_NOTE, isStageOutputDemoMode } from "@/lib/stageOutputReview";
import { loadStageReviewContext } from "@/lib/stageOutputReviewLoad";
import type { StageOutputHubItem } from "@/lib/stageOutputReview";

function UnavailableReviewState({ message }: { message: string }) {
  return (
    <div className="stage-review-unavailable">
      <strong>Output not available yet</strong>
      <p>{message}</p>
    </div>
  );
}

export function FirstContactReviewPanel({ opportunityId }: { opportunityId: string }) {
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
          "first_contact",
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
          setError("This review could not be loaded. Return to intake and try again.");
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
      journeyStage="first_contact"
      currentStep="research"
      opportunityId={opportunityId}
      clientName={clientName}
      opportunityName={opportunityName}
      kicker="First contact"
      title="Research review"
      lead="Review the company brief, hypothesis, discovery questions, and use-case relevance before the first meeting."
      demoMode={demoMode}
      loading={loading}
      error={error}
      hubItems={hubItems}
      eligibilityLockCopy={eligibilityLockCopy}
    >
      {demoMode ? (
        <>
          <p className="stage-output-demo-banner" role="note">
            Demonstration data — sample BT-36 contract fixture, not live research for this client.
          </p>
          <section className="upload-panel stage-review-section">
            <h2>Company research brief</h2>
            <dl className="stage-review-facts">
              {demoResearchFacts().map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="upload-panel stage-review-section">
            <h2>Hypothesis and product relevance</h2>
            <p>{demoHypothesisText()}</p>
          </section>
          <section className="upload-panel stage-review-section">
            <h2>Discovery questions</h2>
            <ol className="stage-review-numbered-list">
              {demoDiscoveryQuestions().map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ol>
          </section>
          <section className="upload-panel stage-review-section">
            <h2>Use case relevance</h2>
            <ul className="stage-review-bullet-list">
              {demoUseCases().map((useCase) => (
                <li key={useCase.title}>
                  <strong>{useCase.title}</strong>
                  <span>{useCase.summary}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <UnavailableReviewState message={STAGE_OUTPUT_BACKEND_NOTE} />
      )}
    </StageReviewLayout>
  );
}
