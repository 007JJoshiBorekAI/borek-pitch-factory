"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { PitchGenerationView } from "@/components/PitchGenerationView";
import { RecoveryBanner } from "@/components/RecoveryBanner";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import {
  ApiRequestError,
  changePresentationSlideLayout,
  downloadPresentationFile,
  FRAMEWORK_JOB_TIMEOUT_MS,
  generatePresentation,
  getActiveJob,
  getDeckCenter,
  getJob,
  getLatestPresentation,
  getLatestPresentationPlan,
  getOpportunity,
  getPresentation,
  regeneratePresentationSlide,
  retryJob,
  waitForJob,
} from "@/lib/api";
import type { JobResponse } from "@/lib/api";
import {
  isDeckFileMissingError,
  isMissingPresentationError,
  isMissingPresentationPlanError,
  isPresentationNotReadyError,
} from "@/lib/apiErrors";
import { buildDownloadFilename, mapDeckSlides } from "@/lib/deckCenter";
import type { DeckCenterResponse, PresentationResponse } from "@/lib/deckTypes";
import { snapshotFromJob, type JobProgressSnapshot } from "@/lib/jobProgress";
import { extractSlidePreviewRows } from "@/lib/planPreview";
import type { PresentationPlanResponse } from "@/lib/planTypes";
import {
  buildPitchGenerationProgress,
  buildPitchSlideRows,
  formatPitchEyebrow,
  isPitchDownloadReady,
  pitchGenerationTitle,
  resolveStableSelectedSlideKey,
} from "@/lib/pitchGeneration";
import {
  generationProgressMessage,
  inspectActiveJob,
  stageGroupForPage,
} from "@/lib/jobReconnect";
import { startPipelineParallelLoad } from "@/lib/pipelineParallelLoad";
import { journeyStageForGenerate } from "@/lib/journeyStageSelection";
import { opportunityLabel } from "@/lib/pipelineContext";
import {
  followupReviewHref,
  shouldShowConcretisationEmailReviewLink,
} from "@/lib/stageEmailReview";
import { isStageOutputDemoMode } from "@/lib/stageOutputReview";
import { ARTIFACTS_PARTIAL_LABEL } from "@/lib/presentationReady";
import {
  jobFailureRecoveryNotice,
  recoveryActionHref,
  recoveryNoticeFromError,
  recoverySurfacePrecedence,
  retryingRecoveryNotice,
  runningRecoveryNotice,
} from "@/lib/recoveryUx";
import type { RecoveryNotice } from "@/lib/recoveryUx";

interface DeckCenterPanelProps {
  opportunityId: string;
  presentationId?: string;
  presentationVersionId?: string;
}

export function DeckCenterPanel({
  opportunityId,
  presentationId: requestedPresentationId,
}: DeckCenterPanelProps) {
  const { accessToken, isAuthenticated, loading } = useAuth();
  const searchParams = useSearchParams();
  const demoMode = isStageOutputDemoMode(searchParams);
  const [presentation, setPresentation] = useState<PresentationResponse | null>(null);
  const [plan, setPlan] = useState<PresentationPlanResponse | null>(null);
  const [deck, setDeck] = useState<DeckCenterResponse | null>(null);
  const [opportunityName, setOpportunityName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [contentLoading, setContentLoading] = useState(true);
  const [jobPolling, setJobPolling] = useState(false);
  const [jobSnapshot, setJobSnapshot] = useState<JobProgressSnapshot | null>(null);
  const [notice, setNotice] = useState<RecoveryNotice | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [retryJobId, setRetryJobId] = useState<string | null>(null);
  const [selectedSlideKey, setSelectedSlideKey] = useState<string | null>(null);
  const [activeSlideJobSlideId, setActiveSlideJobSlideId] = useState<string | null>(null);
  const [pptxAvailable, setPptxAvailable] = useState(true);
  const [pdfAvailable, setPdfAvailable] = useState(true);
  const [partialArtifacts, setPartialArtifacts] = useState(false);
  const [recoveryTarget, setRecoveryTarget] = useState<"job" | "download-pptx" | "download-pdf">(
    "job",
  );

  const trackJob = useCallback((job: JobResponse) => {
    setJobSnapshot(snapshotFromJob(job));
  }, []);

  const plannedSlides = useMemo(
    () => (plan ? extractSlidePreviewRows(plan.plan_json) : []),
    [plan],
  );
  const slideTiles = useMemo(() => (deck ? mapDeckSlides(deck) : []), [deck]);
  const pitchSlides = useMemo(
    () =>
      buildPitchSlideRows({
        plannedSlides,
        deckTiles: slideTiles,
        regeneratingSlideId: activeSlideJobSlideId,
        jobSnapshot,
      }),
    [activeSlideJobSlideId, slideTiles, jobSnapshot, plannedSlides],
  );
  const pitchProgress = useMemo(
    () =>
      buildPitchGenerationProgress({
        slides: pitchSlides,
        jobSnapshot,
        pptxAvailable,
      }),
    [jobSnapshot, pitchSlides, pptxAvailable],
  );

  useEffect(() => {
    setSelectedSlideKey((current) => resolveStableSelectedSlideKey(pitchSlides, current));
  }, [pitchSlides]);

  const ready = Boolean(deck && presentation);
  const activeJourneyStage = journeyStageForGenerate(opportunityId);
  const showConcretisationEmailReview = shouldShowConcretisationEmailReviewLink(
    activeJourneyStage,
    ready,
  );
  const concretisationEmailReviewHref = followupReviewHref(
    opportunityId,
    "concretisation",
    demoMode,
  );
  const downloadEnabled = isPitchDownloadReady({
    slides: pitchSlides,
    pptxAvailable,
    busy,
  });

  const applyLatestPlan = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    try {
      const latest = await getLatestPresentationPlan(accessToken, opportunityId);
      setPlan(latest);
    } catch (loadError) {
      setPlan(null);
      if (!isMissingPresentationPlanError(loadError)) {
        throw loadError;
      }
    }
  }, [accessToken, opportunityId]);

  const loadDeck = useCallback(
    async (presentationId: string) => {
      if (!accessToken) {
        return;
      }
      try {
        const center = await getDeckCenter(accessToken, presentationId);
        setDeck(center);
        setPartialArtifacts(center.slides.length === 0);
        setPptxAvailable(Boolean(center.pptx_download_url));
        setPdfAvailable(Boolean(center.pdf_download_url));
      } catch (loadError) {
        setDeck(null);
        if (isPresentationNotReadyError(loadError)) {
          setPartialArtifacts(true);
          return;
        }
        throw loadError;
      }
    },
    [accessToken],
  );

  const applyLatestPresentation = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    await applyLatestPlan();
    try {
      const latest = requestedPresentationId
        ? await getPresentation(accessToken, requestedPresentationId)
        : await getLatestPresentation(accessToken, opportunityId);
      setPresentation(latest);
      await loadDeck(latest.id);
    } catch (loadError) {
      setPresentation(null);
      setDeck(null);
      if (
        !isMissingPresentationError(loadError) &&
        !isPresentationNotReadyError(loadError)
      ) {
        throw loadError;
      }
      if (isPresentationNotReadyError(loadError)) {
        setPartialArtifacts(true);
      }
    }
  }, [accessToken, applyLatestPlan, loadDeck, opportunityId, requestedPresentationId]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    let cancelled = false;
    void getOpportunity(accessToken, opportunityId)
      .then((opportunity) => {
        if (!cancelled) {
          setOpportunityName(opportunityLabel(opportunity));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOpportunityName(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, opportunityId]);

  useEffect(() => {
    if (loading || !accessToken) {
      return;
    }
    const token = accessToken;
    let cancelled = false;

    setContentLoading(true);
    setJobPolling(false);
    setJobSnapshot(null);
    setNotice(null);
    setInfo(null);
    setRetryJobId(null);
    setActiveSlideJobSlideId(null);

    const cancel = startPipelineParallelLoad(
      "deck",
      {
        onContentLoaded: () => {},
        onContentMissing: () => {
          setPresentation(null);
          setDeck(null);
        },
        onContentLoadFinished: () => {
          setContentLoading(false);
        },
        onContentLoadError: (message) => {
          setNotice(recoveryNoticeFromError(new Error(message), "deck"));
        },
        onJobPollingStart: (message, _stage, jobId) => {
          setJobPolling(true);
          setInfo(message);
          setNotice(runningRecoveryNotice("deck", jobId));
        },
        onJobStageUpdate: () => {},
        onJobSnapshot: setJobSnapshot,
        onJobPollingFinished: () => {
          setJobPolling(false);
          setInfo(null);
          setJobSnapshot(null);
          setNotice(null);
          setActiveSlideJobSlideId(null);
        },
        onJobFailed: (error, failedJobId) => {
          setNotice(recoveryNoticeFromError(error, "deck"));
          setRetryJobId(failedJobId);
          setActiveSlideJobSlideId(null);
        },
      },
      {
        loadContent: async () => {
          if (cancelled) {
            return;
          }
          await applyLatestPresentation();
        },
        isMissingError: isMissingPresentationError,
        getActiveJob: () => getActiveJob(token, opportunityId, stageGroupForPage("deck")),
        getJob: (jobId) => getJob(token, jobId),
      },
    );

    return () => {
      cancelled = true;
      cancel();
    };
  }, [accessToken, applyLatestPresentation, loading, opportunityId]);

  async function handleGenerateDeck() {
    if (!accessToken) {
      return;
    }
    setRecoveryTarget("job");
    setBusy(true);
    setNotice(null);
    setInfo(null);
    setRetryJobId(null);
    setActiveSlideJobSlideId(null);
    try {
      const generated = await generatePresentation(accessToken, opportunityId);
      setInfo(generationProgressMessage("deck", Boolean(generated.is_existing_job)));
      setNotice(runningRecoveryNotice("deck", generated.job_id));
      setJobPolling(true);
      await waitForJob(accessToken, generated.job_id, {
        timeoutMs: FRAMEWORK_JOB_TIMEOUT_MS,
        onProgress: trackJob,
      });
      setJobSnapshot(null);
      setNotice(null);
      await applyLatestPresentation();
      setInfo(null);
    } catch (generateError) {
      setInfo(null);
      setNotice(recoveryNoticeFromError(generateError, "deck"));
      if (generateError instanceof ApiRequestError && generateError.retryable && generateError.jobId) {
        setRetryJobId(generateError.jobId);
      }
    } finally {
      setBusy(false);
      setJobPolling(false);
      setActiveSlideJobSlideId(null);
    }
  }

  async function handleRetry() {
    if (!accessToken || !retryJobId) {
      return;
    }
    setJobSnapshot(null);
    setRecoveryTarget("job");
    setBusy(true);
    setNotice(retryingRecoveryNotice("deck", retryJobId));
    setInfo("Retrying generation from the last failed stage…");
    setActiveSlideJobSlideId(null);
    try {
      const queued = await retryJob(accessToken, retryJobId);
      setRetryJobId(null);
      setJobPolling(true);
      await waitForJob(accessToken, queued.job_id, {
        timeoutMs: FRAMEWORK_JOB_TIMEOUT_MS,
        onProgress: trackJob,
      });
      setJobSnapshot(null);
      setNotice(null);
      await applyLatestPresentation();
      setInfo(null);
    } catch (retryError) {
      setInfo(null);
      setNotice(recoveryNoticeFromError(retryError, "deck"));
      if (retryError instanceof ApiRequestError && retryError.retryable && retryError.jobId) {
        setRetryJobId(retryError.jobId);
      }
    } finally {
      setBusy(false);
      setJobPolling(false);
      setActiveSlideJobSlideId(null);
    }
  }

  async function handleReconnect() {
    if (!accessToken) {
      return;
    }
    setBusy(true);
    setInfo(null);
    setNotice(runningRecoveryNotice("deck"));
    let monitoringJob = false;
    try {
      const job = await getActiveJob(accessToken, opportunityId, stageGroupForPage("deck"));
      const decision = inspectActiveJob(job, "deck");
      if (decision.action === "failed") {
        setRetryJobId(decision.retryable ? decision.jobId : null);
        setNotice(jobFailureRecoveryNotice(decision.error, "deck", decision.jobId));
        return;
      }
      if (decision.action === "monitor") {
        monitoringJob = true;
        setNotice(runningRecoveryNotice("deck", decision.jobId));
        setJobPolling(true);
        await waitForJob(accessToken, decision.jobId, {
          timeoutMs: FRAMEWORK_JOB_TIMEOUT_MS,
          onProgress: trackJob,
        });
        setJobSnapshot(null);
      }
      await applyLatestPresentation();
      setNotice(null);
    } catch (reconnectError) {
      setNotice(recoveryNoticeFromError(reconnectError, "deck", { knownRunning: monitoringJob }));
      if (
        reconnectError instanceof ApiRequestError &&
        reconnectError.retryable &&
        reconnectError.jobId
      ) {
        setRetryJobId(reconnectError.jobId);
      }
    } finally {
      setBusy(false);
      setJobPolling(false);
      setActiveSlideJobSlideId(null);
    }
  }

  function handleRecoveryAction() {
    if (notice?.action?.kind === "GENERATE") {
      void handleGenerateDeck();
      return;
    }
    if (notice?.action?.kind === "RETRY") {
      void handleRetry();
      return;
    }
    if (
      notice?.action?.kind === "RECONNECT" ||
      notice?.action?.kind === "KEEP_CHECKING"
    ) {
      if (recoveryTarget === "download-pptx") {
        void handleDownload("pptx");
        return;
      }
      if (recoveryTarget === "download-pdf") {
        void handleDownload("pdf");
        return;
      }
      void handleReconnect();
    }
  }

  async function handleDownload(kind: "pptx" | "pdf" = "pptx") {
    if (!accessToken || !deck) {
      return;
    }
    setRecoveryTarget(kind === "pptx" ? "download-pptx" : "download-pdf");
    setBusy(true);
    setNotice(null);
    try {
      const path = kind === "pptx" ? deck.pptx_download_url : deck.pdf_download_url;
      const blob = await downloadPresentationFile(accessToken, path);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = buildDownloadFilename(deck.presentation_name, kind);
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      if (isDeckFileMissingError(downloadError)) {
        if (kind === "pptx") {
          setPptxAvailable(false);
        } else {
          setPdfAvailable(false);
        }
        setPartialArtifacts(true);
      }
      setNotice(
        recoveryNoticeFromError(downloadError, "deck", {
          connectionMessage: "The download was interrupted. Reconnect to try it again.",
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleRegenerateSlide(slideId: string) {
    if (!accessToken || !presentation) {
      return;
    }
    setRecoveryTarget("job");
    setBusy(true);
    setNotice(null);
    setActiveSlideJobSlideId(slideId);
    try {
      const queued = await regeneratePresentationSlide(accessToken, presentation.id, slideId);
      setInfo("Updating this slide…");
      setNotice(runningRecoveryNotice("deck", queued.job_id));
      setJobPolling(true);
      await waitForJob(accessToken, queued.job_id, {
        timeoutMs: FRAMEWORK_JOB_TIMEOUT_MS,
        onProgress: trackJob,
      });
      setJobSnapshot(null);
      await loadDeck(presentation.id);
      setNotice(null);
      setInfo(null);
    } catch (regenerateError) {
      setInfo(null);
      setNotice(recoveryNoticeFromError(regenerateError, "deck"));
    } finally {
      setBusy(false);
      setJobPolling(false);
      setActiveSlideJobSlideId(null);
    }
  }

  async function handleChangeLayout(slideId: string, layoutId: string) {
    if (!accessToken || !presentation) {
      return;
    }
    setRecoveryTarget("job");
    setBusy(true);
    setNotice(null);
    setActiveSlideJobSlideId(slideId);
    try {
      const queued = await changePresentationSlideLayout(
        accessToken,
        presentation.id,
        slideId,
        layoutId,
      );
      setInfo("Updating this slide layout…");
      setNotice(runningRecoveryNotice("deck", queued.job_id));
      setJobPolling(true);
      await waitForJob(accessToken, queued.job_id, {
        timeoutMs: FRAMEWORK_JOB_TIMEOUT_MS,
        onProgress: trackJob,
      });
      setJobSnapshot(null);
      await loadDeck(presentation.id);
      setNotice(null);
      setInfo(null);
    } catch (layoutError) {
      setInfo(null);
      setNotice(recoveryNoticeFromError(layoutError, "deck"));
    } finally {
      setBusy(false);
      setJobPolling(false);
      setActiveSlideJobSlideId(null);
    }
  }

  const progressSurfaceVisible = Boolean(jobPolling || jobSnapshot?.status === "FAILED");
  const surfacePrecedence = recoverySurfacePrecedence(notice, progressSurfaceVisible);
  const showWorkspace =
    pitchSlides.length > 0 || Boolean(presentation) || Boolean(plan) || jobPolling;
  const showBuildPrompt =
    !contentLoading &&
    !presentation &&
    !plan &&
    isAuthenticated &&
    !notice &&
    !jobPolling;

  return (
    <WorkspaceShell activeSection="pre-meeting">
      {!loading && isAuthenticated ? <span data-testid="auth-ready" hidden /> : null}

      {!loading && !isAuthenticated ? (
        <div className="upload-banner upload-banner-info app-shell app-workspace-body">
          <div>
            <strong>Authentication required</strong>
            <p>Sign in to preview and download this presentation.</p>
          </div>
          <div className="upload-banner-actions">
            <Link href="/login" className="btn btn-primary">
              Sign in
            </Link>
          </div>
        </div>
      ) : (
        <PitchGenerationView
          eyebrow={formatPitchEyebrow(opportunityName)}
          title={pitchGenerationTitle(pitchProgress.isComplete)}
          progress={pitchProgress}
          slides={pitchSlides}
          selectedSlideKey={selectedSlideKey}
          onSelectSlide={setSelectedSlideKey}
          accessToken={accessToken}
          busy={busy}
          downloadEnabled={downloadEnabled}
          onDownload={() => void handleDownload("pptx")}
          pdfDownloadEnabled={downloadEnabled && pdfAvailable}
          onDownloadPdf={() => void handleDownload("pdf")}
          onRegenerate={presentation && deck ? (slideId) => void handleRegenerateSlide(slideId) : undefined}
          onChangeLayout={presentation && deck ? (slideId, layoutId) => void handleChangeLayout(slideId, layoutId) : undefined}
          followUpReviewHref={showConcretisationEmailReview ? concretisationEmailReviewHref : null}
          showBuildPrompt={showBuildPrompt}
          onBuild={() => void handleGenerateDeck()}
          buildDisabled={busy || jobPolling || !isAuthenticated}
          loading={contentLoading && !showWorkspace}
          emptyMessage="After the slide plan is ready, build the presentation. The preview loads automatically when generation completes."
          recoveryBanner={
            notice && surfacePrecedence.showRecovery ? (
              <RecoveryBanner
                notice={
                  recoveryActionHref(notice, opportunityId)
                    ? {
                        ...notice,
                        action: {
                          ...notice.action!,
                          href: recoveryActionHref(notice, opportunityId),
                        },
                      }
                    : notice
                }
                busy={busy}
                onAction={handleRecoveryAction}
              />
            ) : null
          }
          infoBanner={
            info && surfacePrecedence.showSecondary ? (
              <div className="upload-banner upload-banner-success">{info}</div>
            ) : null
          }
          partialArtifactsBanner={
            partialArtifacts && ready && surfacePrecedence.showSecondary ? (
              <div className="upload-banner upload-banner-info">{ARTIFACTS_PARTIAL_LABEL}</div>
            ) : null
          }
        />
      )}
    </WorkspaceShell>
  );
}
