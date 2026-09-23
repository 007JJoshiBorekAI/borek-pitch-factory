"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { DiscoveryQuestionsPanel } from "@/components/DiscoveryQuestionsPanel";
import { Stage1ResearchReviewPanel } from "@/components/Stage1ResearchReviewPanel";
import { StageReviewLayout } from "@/components/StageReviewLayout";
import { UseCaseListPanel } from "@/components/UseCaseListPanel";
import { generateStage1Research } from "@/lib/api";
import type { Stage1Research } from "@/lib/stage1Contracts";
import { stage1OutputsDemo, stage1ResearchDemo } from "@/lib/stageOutputDemoFixtures";
import {
  STAGE_OUTPUT_BACKEND_NOTE,
  buildStageOutputHubItems,
  isStageOutputDemoMode,
} from "@/lib/stageOutputReview";
import { loadStageReviewContext } from "@/lib/stageOutputReviewLoad";
import type { StageOutputHubItem } from "@/lib/stageOutputReview";
import {
  readSessionStage1Research,
  writeSessionStage1Research,
} from "@/lib/stage1ResearchSession";

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
  const [processedClientDocumentCount, setProcessedClientDocumentCount] = useState(0);
  const [hasStage1Intake, setHasStage1Intake] = useState(false);
  const [sessionResearch, setSessionResearch] = useState<Stage1Research | null>(null);
  const [researchGenerating, setResearchGenerating] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);

  const refreshHubItems = useCallback(
    (sessionResearchAvailable: boolean, processedDocs: number, intakeReady: boolean) => {
      setHubItems(
        buildStageOutputHubItems(
          {
            journeyStage: "first_contact",
            opportunityId,
            processedClientDocumentCount: processedDocs,
            hasStage1Intake: intakeReady,
            apiLoadFailed: false,
            hasSessionResearch: sessionResearchAvailable,
          },
          demoMode,
        ),
      );
    },
    [demoMode, opportunityId],
  );

  useEffect(() => {
    setSessionResearch(readSessionStage1Research(opportunityId));
  }, [opportunityId]);

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
        setEligibilityLockCopy(loaded.eligibilityLockCopy);
        setProcessedClientDocumentCount(loaded.processedClientDocumentCount);
        setHasStage1Intake(loaded.liveContextHasIntake);
        refreshHubItems(
          Boolean(readSessionStage1Research(opportunityId)),
          loaded.processedClientDocumentCount,
          loaded.liveContextHasIntake,
        );
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
  }, [accessToken, demoMode, opportunityId, refreshHubItems]);

  useEffect(() => {
    refreshHubItems(Boolean(sessionResearch), processedClientDocumentCount, hasStage1Intake);
  }, [
    sessionResearch,
    processedClientDocumentCount,
    hasStage1Intake,
    refreshHubItems,
  ]);

  async function handleGenerateResearch() {
    if (!accessToken || demoMode || researchGenerating) {
      return;
    }
    setResearchGenerating(true);
    setResearchError(null);
    try {
      const result = await generateStage1Research(accessToken, opportunityId);
      if (result.opportunity_id !== opportunityId) {
        setResearchError("Research response did not match this opportunity.");
        return;
      }
      if (!writeSessionStage1Research(opportunityId, result)) {
        setResearchError("Research could not be stored for this session.");
        return;
      }
      setSessionResearch(result);
    } catch {
      setResearchError("Company research could not be generated. Try again.");
    } finally {
      setResearchGenerating(false);
    }
  }

  const research = demoMode ? stage1ResearchDemo : sessionResearch;
  const outputs = demoMode ? stage1OutputsDemo : null;
  const liveOutputDependencies = ["STAGE1_RESEARCH_UNAVAILABLE", "DISCOVERY_QUESTIONS_NOT_RUN"];

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
        <p className="stage-output-demo-banner" role="note">
          Demonstration data — sample BT-36 contract fixture, not live research for this client.
        </p>
      ) : null}

      {!demoMode && sessionResearch ? (
        <p className="stage-output-session-banner" role="note">
          Session-only research result — this POST response is not persisted. Reloading the page
          will clear it until BT-36 GET endpoints are available.
        </p>
      ) : null}

      {research ? (
        <Stage1ResearchReviewPanel research={research} />
      ) : (
        <section className="upload-panel stage-review-section">
          <h2>Company research brief</h2>
          <UnavailableReviewState message={STAGE_OUTPUT_BACKEND_NOTE} />
          {!demoMode ? (
            <div className="stage-review-generate-row">
              <button
                type="button"
                className="btn btn-primary"
                disabled={researchGenerating || !accessToken}
                onClick={() => void handleGenerateResearch()}
              >
                {researchGenerating ? "Generating research…" : "Generate company research"}
              </button>
              <p className="upload-hint">
                Requires an explicit action. No external research call runs when opening this page.
              </p>
              {researchError ? <p className="form-error">{researchError}</p> : null}
            </div>
          ) : null}
        </section>
      )}

      {outputs ? (
        <>
          <DiscoveryQuestionsPanel
            collection={outputs.discovery_questions}
            dependencies={outputs.dependencies}
          />
          <UseCaseListPanel collection={outputs.use_cases} dependencies={outputs.dependencies} />
        </>
      ) : (
        <>
          <DiscoveryQuestionsPanel
            collection={{ status: "unknown", items: [] }}
            dependencies={liveOutputDependencies}
          />
          <UseCaseListPanel
            collection={{ status: "unknown", items: [] }}
            dependencies={["USE_CASE_CORPUS_UNAVAILABLE", ...liveOutputDependencies]}
          />
        </>
      )}
    </StageReviewLayout>
  );
}
