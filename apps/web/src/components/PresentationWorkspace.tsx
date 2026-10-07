"use client";

import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { usePreviewJourney } from "@/components/PreviewJourneyProvider";
import { WorkflowArtifactTabs } from "@/components/WorkflowArtifactTabs";
import { FirstMeetingHandoff } from "@/components/FirstMeetingHandoff";
import { DISCOVERY_PAGE_CATALOG } from "@/lib/discoveryFirst";
import { canDownloadDiscoveryPdf } from "@/lib/discoveryWorkspace";
import { generateAndAwaitFirstPitch } from "@/lib/ppt1Generation";
import { presentationPreview } from "@/lib/presentationPreview";
import {
  downloadLivePresentation, livePresentationError, loadExistingFirstPitch,
  loadLivePresentation, requestLiveSlidePreview,
  type LivePresentation, type LivePreviewState,
} from "@/lib/presentationLive";
import type { PreviewPresentation } from "@/lib/previewJourney";

interface PresentationWorkspaceProps {
  opportunityId: string;
}

function downloadFixture(opportunityId: string, presentation: PreviewPresentation, format: "pptx" | "pdf") {
  const content = `Preview manifest only; not a generated presentation.\nOpportunity: ${opportunityId}\nVersion: ${presentation.version_id}\nApproved Discovery: ${presentation.source_discovery_version_id}\nRequested format: ${format.toUpperCase()}\n`;
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ppt-1-${format}-preview-manifest-${opportunityId}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function PresentationWorkspace({ opportunityId }: PresentationWorkspaceProps) {
  const { accessToken, previewMode } = useAuth();
  return <PresentationSession key={`${opportunityId}:${previewMode ? "fixture" : accessToken ?? "signed-out"}`}
    opportunityId={opportunityId} accessToken={accessToken} live={!previewMode} />;
}

function PresentationSession({ opportunityId, accessToken, live }: PresentationWorkspaceProps & {
  accessToken: string | null; live: boolean;
}) {
  const { getOpportunity, startPresentation, advancePresentation } = usePreviewJourney();
  const opportunity = getOpportunity(opportunityId);
  const presentation = opportunity?.presentation ?? {
    state: "waiting" as const,
    version_id: null,
    source_discovery_version_id: null,
    slide_count: 0,
  };
  const fixtureApproved = Boolean(
    (opportunity?.approved_discovery?.document_state === "approved" &&
      canDownloadDiscoveryPdf(opportunity.approved_discovery)) ||
      opportunity?.discovery.document_state === "approved",
  );
  const [liveDeck, setLiveDeck] = useState<LivePresentation | null>(null);
  const [livePhase, setLivePhase] = useState<"loading" | "load-failed" | "idle" | "generating" | "ready" | "failed">("loading");
  const [approvedSourceId, setApprovedSourceId] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [preview, setPreview] = useState<{ key: string; value: LivePreviewState } | null>(null);
  const [previewStates, setPreviewStates] = useState<Record<string, "ready" | "generating" | "failed">>({});
  const operation = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const approved = live ? Boolean(approvedSourceId) : fixtureApproved;
  const staleSource = !live && Boolean(presentation.source_discovery_version_id &&
    opportunity?.approved_discovery && presentation.source_discovery_version_id !== opportunity.approved_discovery.version_id);
  const previewSlides = presentationPreview(opportunity);
  const liveReady = live && livePhase === "ready" && Boolean(liveDeck);
  const deckKey = liveDeck ? `${liveDeck.presentationId}:${liveDeck.presentationVersionId}` : "";
  const slides = live ? (liveDeck?.slides ?? []).map((slide) => ({
    ...slide, title: slide.label, body: "",
    state: previewStates[`${deckKey}:${slide.index}`] ?? (slide.previewPath ? "waiting" as const : "failed" as const),
  })) : DISCOVERY_PAGE_CATALOG.map((page, index) => previewSlides[index] ?? {
    ...page, title: page.label, body: "", state: "waiting" as const,
  });
  const [selection, setSelection] = useState({ opportunityId, index: 0 });
  const selectedIndex = selection.opportunityId === opportunityId && selection.index < slides.length ? selection.index : 0;
  const selected = slides[selectedIndex];
  const selectedLiveSlide = liveDeck?.slides[selectedIndex];
  const previewKey = `${deckKey}:${selectedLiveSlide?.index}:${previewAttempt}`;
  const previewState = preview?.key === previewKey ? preview.value : { state: "loading" as const };
  const selectedLabel = selected?.label ?? "No slides";
  const totalSlides = slides.length;
  const readyCount = slides.filter((slide) => slide.state === "ready").length;
  const previewDownloadable =
    !live && presentation.state === "ready" && readyCount === totalSlides && Boolean(presentation.version_id);
  const downloadable = previewDownloadable || liveReady;
  const pageNumber = String((live ? selectedLiveSlide?.index ?? 0 : selectedIndex) + 1).padStart(2, "0");
  const phase = live ? (liveReady ? "ready" : livePhase) : presentation.state;

  useEffect(() => {
    if (live || presentation.state !== "generating") return;
    const timer = window.setTimeout(() => advancePresentation(opportunityId), 450);
    return () => window.clearTimeout(timer);
  }, [advancePresentation, live, opportunityId, presentation.slide_count, presentation.state]);

  useEffect(() => {
    if (!live) return;
    const controller = new AbortController();
    operation.current?.abort();
    operation.current = controller;
    setLivePhase("loading");
    setPreview(null);
    setError(null);
    if (!accessToken) {
      setLivePhase("load-failed");
      setError("Sign in to load PPT #1.");
    } else {
      void loadExistingFirstPitch(accessToken, opportunityId, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        setLiveDeck(result.deck);
        setPreviewStates({});
        setApprovedSourceId(result.approvedSourceId);
        setLivePhase(result.loadError ? "load-failed" : result.deck ? "ready" : result.status === "failed" ? "failed" : "idle");
        if (result.loadError) {
          setError(result.loadError);
        } else if (!result.deck && result.status !== "missing") {
          setError(`PPT #1 status: ${result.status}. No ready version is available. Generate to resume, or reload the deck.`);
        }
      }).catch((loadError) => {
        if (controller.signal.aborted) return;
        setLivePhase("load-failed");
        setError(livePresentationError(loadError));
      });
    }
    return () => {
      controller.abort();
      operation.current?.abort();
    };
  }, [accessToken, live, opportunityId, refresh]);

  useEffect(() => {
    if (!liveReady || !accessToken || !liveDeck || !selectedLiveSlide) return;
    const request = requestLiveSlidePreview(accessToken, opportunityId, liveDeck, selectedLiveSlide, (value) => {
      setPreview({ key: previewKey, value });
      setPreviewStates((states) => ({ ...states, [`${deckKey}:${selectedLiveSlide.index}`]: value.state === "loading" ? "generating" : value.state }));
    });
    return () => {
      request.cancel();
      setPreviewStates((states) => {
        const key = `${deckKey}:${selectedLiveSlide.index}`;
        if (states[key] !== "generating") return states;
        const next = { ...states };
        delete next[key];
        return next;
      });
    };
  }, [accessToken, deckKey, liveDeck, liveReady, opportunityId, previewKey, selectedLiveSlide]);

  async function generate() {
    if (!live) {
      startPresentation(opportunityId);
      return;
    }
    if (!accessToken || livePhase === "generating") return;
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setError(null);
    setLiveDeck(null);
    setPreview(null);
    setPreviewStates({});
    setLivePhase("generating");
    try {
      const result = await generateAndAwaitFirstPitch(accessToken, opportunityId);
      if (controller.signal.aborted) return;
      const deck = await loadLivePresentation(accessToken, opportunityId, result, controller.signal);
      if (controller.signal.aborted) return;
      setLiveDeck(deck);
      setLivePhase("ready");
    } catch (generationError) {
      if (controller.signal.aborted) return;
      setLivePhase("failed");
      setError(livePresentationError(generationError));
    }
  }

  async function downloadLive(format: "pptx" | "pdf") {
    if (live) {
      if (!accessToken || !liveDeck || !liveReady) return;
      const signal = operation.current?.signal;
      setError(null);
      try {
        const blob = await downloadLivePresentation(accessToken, opportunityId, liveDeck, format, signal);
        if (signal?.aborted) return;
        const url = URL.createObjectURL(blob);
        try {
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = `ppt-1-${opportunityId}.${format}`;
          anchor.click();
        } finally { URL.revokeObjectURL(url); }
      } catch (downloadError) {
        if (!signal?.aborted) setError(livePresentationError(downloadError));
      }
      return;
    }
    downloadFixture(opportunityId, presentation, format);
  }

  return (
    <section className="workflow-artifact-workspace artifact-preview-workspace presentation-document-workspace">
      <WorkflowArtifactTabs opportunityId={opportunityId} active="presentations" />
      <progress className="discovery-progress" max={totalSlides || 1} value={readyCount} aria-label={`${readyCount} of ${totalSlides} presentation ${live ? "previews loaded" : "slides ready"}`} />
      <div id="artifact-panel-presentations" role="tabpanel" aria-labelledby="artifact-tab-presentations">
        <h1 className="sr-only">Pre-meeting presentation · PPT #1</h1>
        {error ? <p className="client-information-error" role="alert">{error}</p> : null}
        <div className="workflow-artifact-grid">
          <aside className="workflow-page-list" aria-label="Presentation slides">
            <div className="discovery-list-heading"><span>Slides</span><span>View only</span></div>
            <ol>
              {slides.map((page, index) => {
                const state = page.state;
                return (
                  <li key={page.id} className={index === selectedIndex ? "is-selected" : undefined}>
                    <button type="button" onClick={() => setSelection({ opportunityId, index })} aria-current={index === selectedIndex ? "page" : undefined}>
                      <span className={`discovery-thumbnail presentation-thumbnail is-${state}`} aria-hidden="true"><i /><i /><i /><i /></span>
                      <span className="discovery-page-label"><strong><span className="workflow-page-number">{String((live ? liveDeck?.slides[index].index ?? index : index) + 1).padStart(2, "0")}</span>{page.label}</strong><small className={`is-${state}`}>{state === "ready" ? "Ready" : state === "generating" ? live ? "Loading preview" : "Generating" : state === "failed" ? live ? "Preview unavailable" : "Failed" : live ? "Preview not loaded" : "Waiting"}</small></span>
                      <span className={`discovery-status-mark is-${state}`} aria-hidden="true">{state === "ready" ? <svg viewBox="0 0 16 16" fill="none"><path d="m4 8 3 3 5-6" stroke="currentColor" strokeWidth="1.5" /></svg> : state === "failed" ? "!" : <i />}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </aside>
          <article className="workflow-preview-panel">
            <div className="discovery-page-toolbar"><p className="workflow-panel-label">Slide {pageNumber} · {selectedLabel}</p><span className="presentation-view-only">PPT #1 · View only</span></div>
            <div className="discovery-preview-content">
              {live ? (
                <div className="presentation-slide-canvas presentation-slide-state">
                  {liveReady && selectedLiveSlide ? previewState.state === "ready" ? (
                    <img key={previewKey} src={previewState.url} alt={`PPT #1 slide ${pageNumber}: ${selectedLabel}`} className="presentation-live-preview"
                      style={{ width: "100%", maxWidth: "100%", height: "auto", objectFit: "contain" }}
                      onError={() => {
                        setPreview((current) => current?.key === previewKey ? { key: previewKey, value: { state: "failed", message: "This slide image could not be displayed. Retry the preview." } } : current);
                        setPreviewStates((states) => ({ ...states, [`${deckKey}:${selectedLiveSlide.index}`]: "failed" }));
                      }} />
                  ) : (
                    <>
                      <strong>{previewState.state === "loading" ? "Loading slide preview" : "Slide preview unavailable"}</strong>
                      <p role="status">{previewState.state === "failed" ? previewState.message : "Fetching the selected slide image securely."}</p>
                      {previewState.state === "failed" ? <button className="btn btn-secondary" type="button" onClick={() => selectedLiveSlide.previewPath ? setPreviewAttempt((value) => value + 1) : setRefresh((value) => value + 1)}>Retry preview</button> : null}
                    </>
                  ) : (
                    <>
                      <strong>{phase === "generating" ? "Generating PPT #1" : phase === "loading" ? "Loading existing PPT #1" : phase === "load-failed" ? "PPT #1 could not be loaded" : phase === "failed" ? "PPT #1 generation failed" : liveReady ? "No slides returned" : !approved ? "Discovery approval required" : "No ready PPT #1 yet"}</strong>
                      <p>{phase === "generating" ? "The approved Discovery version is being mapped to the locked slide layouts." : "Live previews require rendered slide images from the backend. No fixture content is shown in a live session."}</p>
                    </>
                  )}
                </div>
              ) : selected?.state === "ready" ? (
                <div className="presentation-slide-canvas">
                  <p className="discovery-page-eyebrow">{[opportunity?.client.values.company_name, selected.label].filter(Boolean).join(" · ")}</p>
                  <h2>{selected.title}</h2>
                  <div className="presentation-slide-body">{selected.body.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
                  <footer>BOREK Solutions Group · {pageNumber}</footer>
                </div>
              ) : (
                <div className="presentation-slide-canvas presentation-slide-state">
                  <strong>{!approved ? "Discovery approval required" : selected?.state === "generating" ? "Generating this slide" : selected?.state === "failed" ? "Slide generation failed" : phase === "failed" ? "PPT #1 generation failed" : "Waiting for this slide"}</strong>
                  <p>{!approved ? "Approve all seven Discovery pages before generating PPT #1." : "Completed slides remain available in the slide list."}</p>
                </div>
              )}
              <p className="discovery-preview-caption">{live ? "Live rendered previews. The API serves only the latest deck, previews and downloads; it cannot pin historical versions. Version changes detected during requests are rejected." : "Local content preview from approved Discovery, not a rendered presentation artifact."}</p>
              {staleSource ? <p className="discovery-preview-caption">A newer approved source ({opportunity?.approved_discovery?.version_id}) is available. This deck remains based on {presentation.source_discovery_version_id} until you explicitly regenerate.</p> : null}
              {!live && presentation.state === "ready" && previewSlides.length === 0 ? <p role="alert">The saved source snapshot is unavailable. Regenerate from approved Discovery to restore the preview.</p> : null}
              <div className="discovery-generation-card">
                <div role="status" aria-live="polite" aria-atomic="true">
                  <strong>{phase === "generating" ? live ? "Generating PPT #1" : `Generating slide ${String(Math.min(readyCount + 1, totalSlides)).padStart(2, "0")}` : phase === "loading" ? "Loading PPT #1" : phase === "load-failed" ? "PPT #1 load failed" : phase === "failed" ? "PPT #1 generation failed" : downloadable ? "PPT #1 ready for review" : approved ? "Ready to generate PPT #1" : "Generation blocked"}</strong>
                  <p>{readyCount} of {totalSlides} {live ? "slide previews loaded" : "slides ready"}</p>
                </div>
                {phase === "failed" || phase === "waiting" || phase === "idle" || (phase === "load-failed" && approved) || (!live && phase === "ready") ? (
                  <button className="btn btn-primary" type="button" disabled={!approved} onClick={() => void generate()}>
                    {phase === "failed" ? "Retry PPT #1 generation" : phase === "ready" ? "Regenerate PPT #1 from approved Discovery" : "Generate PPT #1"}
                  </button>
                ) : null}
                {live && phase !== "generating" ? <button className="btn btn-secondary" type="button" disabled={phase === "loading" || !accessToken} onClick={() => setRefresh((value) => value + 1)}>Reload deck</button> : null}
              </div>
              <footer className="discovery-download-card">
                <strong>{downloadable ? live ? "Generated deck available; slide previews load individually." : "All slides are ready for review." : "Downloads are available after all slides are ready."}</strong>
                <p>{live ? "Live sessions download generated PPTX and PDF files when ready." : "Real editable PPTX and PDF files require live integration. Preview manifests are text files only."}</p>
                <div className="discovery-version-actions">
                  <button className="btn btn-secondary" type="button" disabled={!downloadable} onClick={() => void downloadLive("pptx")}>Download PPTX{live ? "" : " preview manifest"}</button>
                  <button className="btn btn-secondary" type="button" disabled={!downloadable} onClick={() => void downloadLive("pdf")}>Download PDF{live ? "" : " preview manifest"}</button>
                </div>
                <small className="discovery-version-label">
                  Version: {live ? liveDeck?.presentationVersionId ?? "Not loaded" : presentation.version_id ?? "Not generated"} · Source: {live ? "Not exposed by the deck API" : presentation.source_discovery_version_id ?? "Awaiting generation"}
                  {live ? ` · Latest approved Discovery: ${approvedSourceId ?? "Not available"}` : null}
                </small>
              </footer>
              <FirstMeetingHandoff opportunityId={opportunityId} ppt1Ready={liveReady} />
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
