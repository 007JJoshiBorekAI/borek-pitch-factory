"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { usePreviewJourney } from "@/components/PreviewJourneyProvider";
import { WorkflowArtifactTabs } from "@/components/WorkflowArtifactTabs";
import { ApiRequestError, downloadPresentationFile, fetchSlidePreviewBlob } from "@/lib/api";
import { DISCOVERY_PAGE_CATALOG } from "@/lib/discoveryFirst";
import { canDownloadDiscoveryPdf } from "@/lib/discoveryWorkspace";
import { generateAndAwaitFirstPitch, type FirstPitchResult } from "@/lib/ppt1Generation";
import { presentationPreview } from "@/lib/presentationPreview";
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
  const live = Boolean(accessToken) && !previewMode;
  const { getOpportunity, startPresentation, advancePresentation } = usePreviewJourney();
  const opportunity = getOpportunity(opportunityId);
  const presentation = opportunity?.presentation ?? {
    state: "waiting" as const,
    version_id: null,
    source_discovery_version_id: null,
    slide_count: 0,
  };
  const approved = Boolean(
    (opportunity?.approved_discovery?.document_state === "approved" &&
      canDownloadDiscoveryPdf(opportunity.approved_discovery)) ||
      opportunity?.discovery.document_state === "approved",
  );
  const [liveDeck, setLiveDeck] = useState<FirstPitchResult | null>(null);
  const [livePhase, setLivePhase] = useState<"idle" | "generating" | "ready" | "failed">("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewSlides = presentationPreview(opportunity);
  const liveReady = live && livePhase === "ready" && Boolean(liveDeck);
  const slides =
    liveReady ?
      DISCOVERY_PAGE_CATALOG.map((page) => ({
        id: page.id,
        label: page.label,
        title: page.label,
        body: "",
        state: "ready" as const,
      }))
    : previewSlides;
  const [selection, setSelection] = useState({ opportunityId, index: 0 });
  const selectedIndex = selection.opportunityId === opportunityId ? selection.index : 0;
  const selected = slides[selectedIndex];
  const selectedLabel = DISCOVERY_PAGE_CATALOG[selectedIndex]?.label ?? "Cover";
  const totalSlides = DISCOVERY_PAGE_CATALOG.length;
  const readyCount = slides.filter((slide) => slide.state === "ready").length;
  const previewDownloadable =
    !live && presentation.state === "ready" && readyCount === totalSlides && Boolean(presentation.version_id);
  const downloadable = previewDownloadable || liveReady;
  const pageNumber = String(selectedIndex + 1).padStart(2, "0");
  const phase = live ? (liveReady ? "ready" : livePhase) : presentation.state;

  useEffect(() => {
    if (live || presentation.state !== "generating") return;
    const timer = window.setTimeout(() => advancePresentation(opportunityId), 450);
    return () => window.clearTimeout(timer);
  }, [advancePresentation, live, opportunityId, presentation.slide_count, presentation.state]);

  useEffect(() => {
    if (!live || !accessToken || !liveDeck) return;
    let objectUrl = "";
    let cancelled = false;
    void fetchSlidePreviewBlob(
      accessToken,
      `/presentations/${liveDeck.presentationId}/preview/slides/0.png`,
    ).then((blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setPreviewUrl(objectUrl);
    }).catch(() => {
      if (!cancelled) setPreviewUrl(null);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [accessToken, live, liveDeck]);

  async function generate() {
    if (!live || !accessToken) {
      startPresentation(opportunityId);
      return;
    }
    setError(null);
    setLivePhase("generating");
    try {
      const result = await generateAndAwaitFirstPitch(accessToken, opportunityId);
      setLiveDeck(result);
      setLivePhase("ready");
    } catch (generationError) {
      setLivePhase("failed");
      setError(generationError instanceof ApiRequestError ? generationError.message : "PPT #1 could not be generated.");
    }
  }

  async function downloadLive(format: "pptx" | "pdf") {
    if (live && accessToken && liveDeck) {
      const blob = await downloadPresentationFile(
        accessToken,
        `/presentations/${liveDeck.presentationId}/download/${format}`,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ppt-1-${opportunityId}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }
    downloadFixture(opportunityId, presentation, format);
  }

  return (
    <section className="workflow-artifact-workspace artifact-preview-workspace presentation-document-workspace">
      <WorkflowArtifactTabs opportunityId={opportunityId} active="presentations" />
      <progress className="discovery-progress" max={totalSlides} value={readyCount} aria-label={`${readyCount} of ${totalSlides} presentation slides ready`} />
      <div id="artifact-panel-presentations" role="tabpanel" aria-labelledby="artifact-tab-presentations">
        <h1 className="sr-only">Pre-meeting presentation · PPT #1</h1>
        {error ? <p className="client-information-error" role="alert">{error}</p> : null}
        <div className="workflow-artifact-grid">
          <aside className="workflow-page-list" aria-label="Presentation slides">
            <div className="discovery-list-heading"><span>Slides</span><span>View only</span></div>
            <ol>
              {DISCOVERY_PAGE_CATALOG.map((page, index) => {
                const state = slides[index]?.state ?? "waiting";
                return (
                  <li key={page.id} className={index === selectedIndex ? "is-selected" : undefined}>
                    <button type="button" onClick={() => setSelection({ opportunityId, index })} aria-current={index === selectedIndex ? "page" : undefined}>
                      <span className={`discovery-thumbnail presentation-thumbnail is-${state}`} aria-hidden="true"><i /><i /><i /><i /></span>
                      <span className="discovery-page-label"><strong><span className="workflow-page-number">{String(index + 1).padStart(2, "0")}</span>{page.label}</strong><small className={`is-${state}`}>{state === "ready" ? "Ready" : state === "generating" ? "Generating" : state === "failed" ? "Failed" : "Waiting"}</small></span>
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
              {phase === "generating" && live ? (
                <div className="presentation-slide-canvas presentation-slide-state">
                  <strong>Generating PPT #1</strong>
                  <p>The approved Discovery version is being mapped to the locked slide layouts.</p>
                </div>
              ) : selected?.state === "ready" ? (
                <div className="presentation-slide-canvas">
                  {liveReady && selectedIndex === 0 && previewUrl ? (
                    <img src={previewUrl} alt="PPT #1 cover preview" className="presentation-live-preview" />
                  ) : (
                    <>
                      <p className="discovery-page-eyebrow">{opportunity?.client.values.company_name} · {selected.label}</p>
                      <h2>{selected.title}</h2>
                      <div className="presentation-slide-body">{selected.body.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
                    </>
                  )}
                  <footer>BOREK Solutions Group · {pageNumber}</footer>
                </div>
              ) : (
                <div className="presentation-slide-canvas presentation-slide-state">
                  <strong>{!approved ? "Discovery approval required" : selected?.state === "generating" ? "Generating this slide" : selected?.state === "failed" ? "Slide generation failed" : phase === "failed" ? "PPT #1 generation failed" : "Waiting for this slide"}</strong>
                  <p>{!approved ? "Approve all seven Discovery pages before generating PPT #1." : "Completed slides remain available in the slide list."}</p>
                </div>
              )}
              <p className="discovery-preview-caption">Local content preview from approved Discovery, not a rendered presentation artifact.</p>
              <div className="discovery-generation-card">
                <div role="status" aria-live="polite" aria-atomic="true">
                  <strong>{phase === "generating" ? `Generating slide ${String(Math.min(readyCount + 1, totalSlides)).padStart(2, "0")}` : phase === "failed" ? "PPT #1 generation failed" : downloadable ? "PPT #1 ready for review" : approved ? "Ready to generate PPT #1" : "Generation blocked"}</strong>
                  <p>{readyCount} of {totalSlides} slides ready</p>
                </div>
                {phase === "failed" || phase === "waiting" || phase === "idle" ? (
                  <button className="btn btn-primary" type="button" disabled={!approved} onClick={() => void generate()}>
                    {phase === "failed" ? "Retry PPT #1 generation" : "Generate PPT #1"}
                  </button>
                ) : null}
              </div>
              <footer className="discovery-download-card">
                <strong>{downloadable ? "All slides are ready for review." : "Downloads are available after all slides are ready."}</strong>
                <p>{live ? "Live sessions download generated PPTX and PDF files when ready." : "Real editable PPTX and PDF files require live integration. Preview manifests are text files only."}</p>
                <div className="discovery-version-actions">
                  <button className="btn btn-secondary" type="button" disabled={!downloadable} onClick={() => void downloadLive("pptx")}>Download PPTX{live ? "" : " preview manifest"}</button>
                  <button className="btn btn-secondary" type="button" disabled={!downloadable} onClick={() => void downloadLive("pdf")}>Download PDF{live ? "" : " preview manifest"}</button>
                </div>
                <small className="discovery-version-label">
                  Version: {liveDeck?.presentationVersionId ?? presentation.version_id ?? "Not generated"} · Source: {presentation.source_discovery_version_id ?? opportunity?.approved_discovery?.version_id ?? "Awaiting approval"}
                </small>
              </footer>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
