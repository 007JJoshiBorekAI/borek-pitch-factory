"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { DiscoveryQuestionsPanel } from "@/components/DiscoveryQuestionsPanel";
import { Stage1ResearchReviewPanel } from "@/components/Stage1ResearchReviewPanel";
import { StageReviewLayout } from "@/components/StageReviewLayout";
import { UseCaseListPanel } from "@/components/UseCaseListPanel";
import {
  STAGE1_OUTPUTS_NOT_GENERATED,
  type AdaptedStage1Review,
} from "@/lib/stageOutputsApiAdapter";
import {
  deriveStage1ArtifactAvailability,
  fetchAdaptedStage1Outputs,
  generateAndFetchAdaptedStage1Outputs,
  stage1OutputsErrorMessage,
  stage1OutputsUnavailableDependencies,
} from "@/lib/stage1OutputsLive";
import type { Stage1ArtifactAvailability } from "@/lib/stageOutputReview";
import { stage1OutputsDemo, stage1ResearchDemo } from "@/lib/stageOutputDemoFixtures";
import {
  buildStageOutputHubItems,
  isStageOutputDemoMode,
} from "@/lib/stageOutputReview";
import { loadStageReviewContext } from "@/lib/stageOutputReviewLoad";
import type { StageOutputHubItem } from "@/lib/stageOutputReview";
import { dependencyLabel } from "@/lib/stage1ResearchView";

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
  const [adaptedOutputs, setAdaptedOutputs] = useState<AdaptedStage1Review | null>(null);
  const [outputsLoadError, setOutputsLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const refreshHubItems = useCallback(
    (
      stage1Availability: Stage1ArtifactAvailability | undefined,
      processedDocs: number,
      intakeReady: boolean,
    ) => {
      setHubItems(
        buildStageOutputHubItems(
          {
            journeyStage: "first_contact",
            opportunityId,
            processedClientDocumentCount: processedDocs,
            hasStage1Intake: intakeReady,
            apiLoadFailed: false,
            stage1Availability,
          },
          demoMode,
        ),
      );
    },
    [demoMode, opportunityId],
  );

  const loadLiveStage1Outputs = useCallback(async () => {
    if (!accessToken || demoMode) {
      setAdaptedOutputs(null);
      setOutputsLoadError(null);
      return;
    }
    try {
      const adapted = await fetchAdaptedStage1Outputs(accessToken, opportunityId);
      setAdaptedOutputs(adapted);
      setOutputsLoadError(null);
      refreshHubItems(
        deriveStage1ArtifactAvailability(adapted),
        processedClientDocumentCount,
        hasStage1Intake,
      );
    } catch (loadError) {
      setAdaptedOutputs(null);
      setOutputsLoadError(stage1OutputsErrorMessage(loadError));
    }
  }, [
    accessToken,
    demoMode,
    hasStage1Intake,
    opportunityId,
    processedClientDocumentCount,
    refreshHubItems,
  ]);

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
        if (demoMode) {
          refreshHubItems(undefined, loaded.processedClientDocumentCount, loaded.liveContextHasIntake);
        }
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
    void loadLiveStage1Outputs();
  }, [loadLiveStage1Outputs]);

  async function handleGenerateStage1Outputs() {
    if (!accessToken || demoMode || generating) {
      return;
    }
    setGenerating(true);
    setGenerateError(null);
    try {
      const adapted = await generateAndFetchAdaptedStage1Outputs(accessToken, opportunityId);
      setAdaptedOutputs(adapted);
      setOutputsLoadError(null);
      refreshHubItems(
        deriveStage1ArtifactAvailability(adapted),
        processedClientDocumentCount,
        hasStage1Intake,
      );
    } catch (generateFailure) {
      setGenerateError(stage1OutputsErrorMessage(generateFailure));
    } finally {
      setGenerating(false);
    }
  }

  const research = demoMode ? stage1ResearchDemo : adaptedOutputs?.embeddedResearch ?? null;
  const outputs = demoMode ? stage1OutputsDemo : adaptedOutputs?.panelOutputs ?? null;
  const liveDependencies = demoMode
    ? []
    : stage1OutputsUnavailableDependencies(adaptedOutputs);
  const outputsNotGenerated =
    !demoMode &&
    (adaptedOutputs === null ||
      adaptedOutputs.envelopeStatus === "not_generated" ||
      adaptedOutputs.panelOutputs === null);

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

      {!demoMode && outputsLoadError ? (
        <p className="form-error" role="alert">
          {outputsLoadError}
        </p>
      ) : null}

      {research ? (
        <Stage1ResearchReviewPanel research={research} />
      ) : (
        <section className="upload-panel stage-review-section">
          <h2>Company research brief</h2>
          <UnavailableReviewState
            message={
              outputsNotGenerated
                ? dependencyLabel(STAGE1_OUTPUTS_NOT_GENERATED)
                : "Company research is not included in the Stage 1 outputs response."
            }
          />
          {!demoMode && outputsNotGenerated ? (
            <div className="stage-review-generate-row">
              <button
                type="button"
                className="btn btn-primary"
                disabled={generating || !accessToken}
                onClick={() => void handleGenerateStage1Outputs()}
              >
                {generating ? "Generating Stage 1 outputs…" : "Generate Stage 1 outputs"}
              </button>
              <p className="upload-hint">
                Requires an explicit action. No generation runs when opening this page.
              </p>
              {generateError ? <p className="form-error">{generateError}</p> : null}
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
            dependencies={liveDependencies}
          />
          <UseCaseListPanel
            collection={{ status: "unknown", items: [] }}
            dependencies={liveDependencies}
          />
          {!demoMode && outputsNotGenerated ? (
            <section className="upload-panel stage-review-section">
              <div className="stage-review-generate-row">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={generating || !accessToken}
                  onClick={() => void handleGenerateStage1Outputs()}
                >
                  {generating ? "Generating Stage 1 outputs…" : "Generate Stage 1 outputs"}
                </button>
                {generateError ? <p className="form-error">{generateError}</p> : null}
              </div>
            </section>
          ) : null}
        </>
      )}
    </StageReviewLayout>
  );
}
