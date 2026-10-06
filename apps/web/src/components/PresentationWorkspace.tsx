"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { usePreviewJourney } from "@/components/PreviewJourneyProvider";
import { WorkflowArtifactTabs } from "@/components/WorkflowArtifactTabs";
import { ApiRequestError, downloadPresentationFile, fetchSlidePreviewBlob } from "@/lib/api";
import { generateAndAwaitFirstPitch, type FirstPitchResult } from "@/lib/ppt1Generation";

interface PresentationWorkspaceProps {
  opportunityId: string;
}

const SLIDES = [
  "Cover",
  "Who we are",
  "Client context",
  "Opportunity",
  "Borek approach",
  "Pilot direction",
  "Next steps",
] as const;

function downloadFixture(opportunityId: string, format: "pptx" | "pdf") {
  const content = `Borek Pitch Factory preview artifact\nOpportunity: ${opportunityId}\nFormat: ${format.toUpperCase()}\n`;
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ppt-1-preview-${opportunityId}.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function PresentationWorkspace({ opportunityId }: PresentationWorkspaceProps) {
  const { accessToken, previewMode } = useAuth();
  const live = Boolean(accessToken) && !previewMode;
  const { getOpportunity, startPresentation, completePresentation } = usePreviewJourney();
  const opportunity = getOpportunity(opportunityId);
  const presentation = opportunity?.presentation ?? {
    state: "waiting" as const,
    version_id: null,
    source_discovery_version_id: null,
    slide_count: 0,
  };
  const approved = opportunity?.discovery.document_state === "approved";
  const [liveDeck, setLiveDeck] = useState<FirstPitchResult | null>(null);
  const [livePhase, setLivePhase] = useState<"idle" | "generating" | "ready" | "failed">("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const phase = live ? (liveDeck ? "ready" : livePhase) : presentation.state;
  const canGenerate = live || approved;

  useEffect(() => {
    if (live || presentation.state !== "generating") return;
    const timer = window.setTimeout(() => completePresentation(opportunityId), 1400);
    return () => window.clearTimeout(timer);
  }, [completePresentation, live, opportunityId, presentation.state]);

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
    if (!live || !accessToken || !liveDeck) {
      downloadFixture(opportunityId, format);
      return;
    }
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
  }

  return (
    <section className="workflow-artifact-workspace" aria-labelledby="presentations-title">
      <WorkflowArtifactTabs opportunityId={opportunityId} active="presentations" />
      <header className="workflow-section-header">
        <p>Pre-meeting presentation</p>
        <h1 id="presentations-title">PPT #1</h1>
        <span>Generated from the exact approved Discovery version for the first meeting.</span>
      </header>
      <div className="workflow-presentation-grid is-single">
        <article className="workflow-presentation-card is-primary">
          <div className="presentation-card-heading">
            <div><p>First meeting</p><h2>PPT #1</h2></div>
            <span className={`workflow-state-badge is-${phase === "idle" ? "waiting" : phase}`}>
              {phase === "ready" ? "Ready" : phase === "generating" ? "Generating" : phase === "failed" ? "Failed" : canGenerate ? "Ready to generate" : "Blocked"}
            </span>
          </div>
          {error ? <p className="client-information-error" role="alert">{error}</p> : null}
          {phase === "ready" ? (
            <>
              <div className="presentation-preview">
                <div className="presentation-preview-hero">
                  {previewUrl ? <img src={previewUrl} alt="PPT #1 cover preview" /> : <span>{opportunity?.client.values.company_name}</span>}
                  <strong>Discovery-led first meeting</strong>
                  <small>Source: {liveDeck?.presentationVersionId ?? presentation.source_discovery_version_id}</small>
                </div>
                <ol>{SLIDES.map((slide, index) => <li key={slide}><span>{String(index + 1).padStart(2, "0")}</span>{slide}</li>)}</ol>
              </div>
              <p>{liveDeck ? `Version ${liveDeck.presentationVersionId}` : `${presentation.slide_count} slides · Version ${presentation.version_id}`}</p>
              <div className="workflow-card-actions">
                <button className="btn btn-secondary" type="button" onClick={() => void downloadLive("pptx")}>Download PPTX</button>
                <button className="btn btn-secondary" type="button" onClick={() => void downloadLive("pdf")}>Download PDF</button>
              </div>
            </>
          ) : phase === "generating" ? (
            <div className="presentation-generating" role="status"><span /><strong>Generating PPT #1</strong><p>The approved Discovery version is being mapped to the locked slide layouts.</p></div>
          ) : (
            <>
              <div className="workflow-slide-placeholder" aria-hidden="true" />
              <p>{canGenerate ? "Generate PPT #1 from the exact approved Discovery version." : "Approve all seven Discovery pages before generating PPT #1."}</p>
              <button className="btn btn-primary" type="button" disabled={!canGenerate} onClick={() => void generate()}>Generate PPT #1</button>
            </>
          )}
        </article>

      </div>
    </section>
  );
}
