"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { ActionItemsPanel } from "@/components/ActionItemsPanel";
import { AdjustedPresentationPanel } from "@/components/AdjustedPresentationPanel";
import { CallSummaryPanel } from "@/components/CallSummaryPanel";
import { DecisionsListPanel } from "@/components/DecisionsListPanel";
import { MinutesOfMeetingPanel } from "@/components/MinutesOfMeetingPanel";
import { OpenQuestionsPanel } from "@/components/OpenQuestionsPanel";
import { StageReviewLayout } from "@/components/StageReviewLayout";
import {
  resolveVerifiedStagePresentation,
  type VerifiedStagePresentation,
} from "@/lib/presentationStageVerification";
import {
  STAGE2_OUTPUTS_NOT_GENERATED,
  type AdaptedStage2Review,
  isDeepeningPresentationDownloadBlocked,
} from "@/lib/stageOutputsApiAdapter";
import {
  deriveStage2ArtifactAvailability,
  fetchAdaptedStage2Outputs,
  generateAndFetchAdaptedStage2Outputs,
  stage2OutputsErrorMessage,
  stage2OutputsUnavailableDependencies,
} from "@/lib/stage2OutputsLive";
import { stage2OutputsDemo } from "@/lib/stageOutputDemoFixtures";
import {
  buildStageOutputHubItems,
  isStageOutputDemoMode,
} from "@/lib/stageOutputReview";
import { loadStageReviewContext } from "@/lib/stageOutputReviewLoad";
import type { Stage2ArtifactAvailability, StageOutputHubItem } from "@/lib/stageOutputReview";
import { dependencyLabel } from "@/lib/stage1ResearchView";

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
  const [adaptedOutputs, setAdaptedOutputs] = useState<AdaptedStage2Review | null>(null);
  const [outputsLoadError, setOutputsLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [verifiedPresentation, setVerifiedPresentation] =
    useState<VerifiedStagePresentation | null>(null);

  const refreshHubItems = useCallback(
    (stage2Availability: Stage2ArtifactAvailability | undefined) => {
      setHubItems(
        buildStageOutputHubItems(
          {
            journeyStage: "deepening",
            opportunityId,
            processedClientDocumentCount: 0,
            hasStage1Intake: false,
            apiLoadFailed: false,
            stage2Availability,
          },
          demoMode,
        ),
      );
    },
    [demoMode, opportunityId],
  );

  const loadLiveStage2Outputs = useCallback(async () => {
    if (!accessToken || demoMode) {
      setAdaptedOutputs(null);
      setOutputsLoadError(null);
      return;
    }
    try {
      const adapted = await fetchAdaptedStage2Outputs(accessToken, opportunityId);
      setAdaptedOutputs(adapted);
      setOutputsLoadError(null);
      refreshHubItems(deriveStage2ArtifactAvailability(adapted));
    } catch (loadError) {
      setAdaptedOutputs(null);
      setOutputsLoadError(stage2OutputsErrorMessage(loadError));
    }
  }, [accessToken, demoMode, opportunityId, refreshHubItems]);

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
        setEligibilityLockCopy(loaded.eligibilityLockCopy);
        if (demoMode) {
          setHubItems(loaded.hubItems);
        }
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

  useEffect(() => {
    void loadLiveStage2Outputs();
  }, [loadLiveStage2Outputs]);

  useEffect(() => {
    let active = true;
    async function loadPresentation() {
      if (
        !accessToken ||
        demoMode ||
        !adaptedOutputs ||
        isDeepeningPresentationDownloadBlocked(adaptedOutputs)
      ) {
        setVerifiedPresentation(null);
        return;
      }
      const verified = await resolveVerifiedStagePresentation(
        accessToken,
        opportunityId,
        "deepening_adjusted",
      );
      if (active) {
        setVerifiedPresentation(verified);
      }
    }
    void loadPresentation();
    return () => {
      active = false;
    };
  }, [accessToken, adaptedOutputs, demoMode, opportunityId]);

  async function handleGenerateStage2Outputs() {
    if (!accessToken || demoMode || generating) {
      return;
    }
    setGenerating(true);
    setGenerateError(null);
    try {
      const adapted = await generateAndFetchAdaptedStage2Outputs(accessToken, opportunityId);
      setAdaptedOutputs(adapted);
      setOutputsLoadError(null);
      refreshHubItems(deriveStage2ArtifactAvailability(adapted));
    } catch (generateFailure) {
      setGenerateError(stage2OutputsErrorMessage(generateFailure));
    } finally {
      setGenerating(false);
    }
  }

  const outputs = demoMode ? stage2OutputsDemo : adaptedOutputs?.panelOutputs ?? null;
  const liveDependencies = demoMode
    ? [
        "TRANSCRIPT_SUMMARY_UNAVAILABLE",
        "MEETING_FEEDBACK_UNAVAILABLE",
        "CALL_SUMMARY_NOT_RUN",
        "MOM_NOT_RUN",
        "PRESENTATION_NOT_RUN",
      ]
    : stage2OutputsUnavailableDependencies(adaptedOutputs);
  const outputsNotGenerated =
    !demoMode &&
    (adaptedOutputs === null ||
      adaptedOutputs.envelopeStatus === "not_generated" ||
      adaptedOutputs.panelOutputs === null);

  return (
    <StageReviewLayout
      journeyStage="deepening"
      currentStep="review"
      opportunityId={opportunityId}
      clientName={clientName}
      opportunityName={opportunityName}
      kicker="Deepening"
      title="Post-meeting review"
      lead="Review the call summary, minutes of meeting, decisions, action items, and adjusted presentation after the first meeting."
      demoMode={demoMode}
      loading={loading}
      error={error}
      hubItems={hubItems}
      eligibilityLockCopy={eligibilityLockCopy}
    >
      {demoMode ? (
        <p className="stage-output-demo-banner" role="note">
          Demonstration data — sample BT-36 stage2_outputs fixture, not live meeting output.
        </p>
      ) : null}

      {!demoMode && outputsLoadError ? (
        <p className="form-error" role="alert">
          {outputsLoadError}
        </p>
      ) : null}

      <CallSummaryPanel
        summary={
          outputs?.call_summary ?? {
            status: "unknown",
            origin: "UNKNOWN",
            text: null,
            source_refs: [],
          }
        }
        dependencies={outputs?.dependencies ?? liveDependencies}
      />
      <MinutesOfMeetingPanel
        mom={
          outputs?.minutes_of_meeting ?? {
            status: "unknown",
            origin: "UNKNOWN",
            sections: [],
            source_refs: [],
          }
        }
        dependencies={outputs?.dependencies ?? liveDependencies}
      />
      <DecisionsListPanel decisions={outputs?.decisions ?? []} />
      <ActionItemsPanel items={outputs?.action_items ?? []} />
      <OpenQuestionsPanel questions={outputs?.open_questions ?? []} />
      <AdjustedPresentationPanel
        presentationRef={
          outputs?.presentation_ref ?? {
            status: "unknown",
            profile: "deepening_adjusted",
            presentation_id: null,
            presentation_version_id: null,
          }
        }
        dependencies={outputs?.dependencies ?? liveDependencies}
        opportunityId={opportunityId}
        verifiedPresentation={verifiedPresentation}
        demoMode={demoMode}
      />

      {!demoMode && outputsNotGenerated ? (
        <section className="upload-panel stage-review-section">
          <div className="stage-review-unavailable">
            <strong>Post-meeting outputs unavailable</strong>
            <p>{dependencyLabel(STAGE2_OUTPUTS_NOT_GENERATED)}</p>
          </div>
          <div className="stage-review-generate-row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={generating || !accessToken}
              onClick={() => void handleGenerateStage2Outputs()}
            >
              {generating ? "Generating Stage 2 outputs…" : "Generate Stage 2 outputs"}
            </button>
            <p className="upload-hint">
              Requires an explicit action. No generation runs when opening this page.
            </p>
            {generateError ? <p className="form-error">{generateError}</p> : null}
          </div>
        </section>
      ) : null}
    </StageReviewLayout>
  );
}
