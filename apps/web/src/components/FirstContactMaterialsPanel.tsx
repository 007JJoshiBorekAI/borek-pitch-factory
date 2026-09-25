"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { FirstMeetingPresentationPanel } from "@/components/FirstMeetingPresentationPanel";
import { MeetingAgendaPanel } from "@/components/MeetingAgendaPanel";
import { StageReviewLayout } from "@/components/StageReviewLayout";
import {
  resolveVerifiedStagePresentation,
  type VerifiedStagePresentation,
} from "@/lib/presentationStageVerification";
import {
  STAGE1_OUTPUTS_NOT_GENERATED,
  type AdaptedStage1Review,
  isFirstContactPresentationDownloadBlocked,
} from "@/lib/stageOutputsApiAdapter";
import {
  deriveStage1ArtifactAvailability,
  fetchAdaptedStage1Outputs,
  generateAndFetchAdaptedStage1Outputs,
  stage1OutputsErrorMessage,
  stage1OutputsUnavailableDependencies,
} from "@/lib/stage1OutputsLive";
import type { Stage1ArtifactAvailability } from "@/lib/stageOutputReview";
import { stage1OutputsDemo } from "@/lib/stageOutputDemoFixtures";
import { FIRST_CONTACT_SLIDE_COUNT } from "@/lib/stageOutputArtifacts";
import { buildStageOutputHubItems, isStageOutputDemoMode } from "@/lib/stageOutputReview";
import { loadStageReviewContext } from "@/lib/stageOutputReviewLoad";
import type { StageOutputHubItem } from "@/lib/stageOutputReview";
import { dependencyLabel } from "@/lib/stage1ResearchView";

export function FirstContactMaterialsPanel({ opportunityId }: { opportunityId: string }) {
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
  const [verifiedPresentation, setVerifiedPresentation] =
    useState<VerifiedStagePresentation | null>(null);

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
          setHubItems(loaded.hubItems);
        }
      } catch {
        if (active) {
          setError("Meeting materials could not be loaded. Return to intake and try again.");
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
    void loadLiveStage1Outputs();
  }, [loadLiveStage1Outputs]);

  useEffect(() => {
    let active = true;
    async function loadPresentation() {
      if (
        !accessToken ||
        demoMode ||
        !adaptedOutputs ||
        isFirstContactPresentationDownloadBlocked(adaptedOutputs)
      ) {
        setVerifiedPresentation(null);
        return;
      }
      const verified = await resolveVerifiedStagePresentation(
        accessToken,
        opportunityId,
        "first_meeting_3_slide",
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

  const outputs = demoMode ? stage1OutputsDemo : adaptedOutputs?.panelOutputs ?? null;
  const liveDependencies = demoMode
    ? ["AGENDA_NOT_RUN", "PRESENTATION_NOT_RUN"]
    : stage1OutputsUnavailableDependencies(adaptedOutputs);
  const outputsNotGenerated =
    !demoMode &&
    (adaptedOutputs === null ||
      adaptedOutputs.envelopeStatus === "not_generated" ||
      adaptedOutputs.panelOutputs === null);

  return (
    <StageReviewLayout
      journeyStage="first_contact"
      currentStep="materials"
      opportunityId={opportunityId}
      clientName={clientName}
      opportunityName={opportunityName}
      kicker="First contact"
      title="Meeting materials"
      lead={`Review the first-meeting presentation (${FIRST_CONTACT_SLIDE_COUNT}-slide profile) and agenda before the client conversation.`}
      demoMode={demoMode}
      loading={loading}
      error={error}
      hubItems={hubItems}
      eligibilityLockCopy={eligibilityLockCopy}
    >
      {demoMode ? (
        <p className="stage-output-demo-banner" role="note">
          Demonstration data — sample BT-36 contract fixture. The approved profile uses{" "}
          {FIRST_CONTACT_SLIDE_COUNT} slides, not the 8-slide Figma reference.
        </p>
      ) : null}

      {!demoMode && outputsLoadError ? (
        <p className="form-error" role="alert">
          {outputsLoadError}
        </p>
      ) : null}

      <FirstMeetingPresentationPanel
        presentationRef={outputs?.presentation_ref ?? null}
        dependencies={outputs?.dependencies ?? liveDependencies}
        opportunityId={opportunityId}
        verifiedPresentation={verifiedPresentation}
        demoMode={demoMode}
      />

      {outputs ? (
        <MeetingAgendaPanel agenda={outputs.meeting_agenda} dependencies={outputs.dependencies} />
      ) : (
        <>
          <MeetingAgendaPanel
            agenda={{
              status: "unknown",
              origin: "UNKNOWN",
              items: [],
              source_refs: [],
            }}
            dependencies={liveDependencies}
          />
          {!demoMode && outputsNotGenerated ? (
            <section className="upload-panel stage-review-section">
              <div className="stage-review-unavailable">
                <strong>Meeting materials unavailable</strong>
                <p>{dependencyLabel(STAGE1_OUTPUTS_NOT_GENERATED)}</p>
              </div>
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
