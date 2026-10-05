"use client";

import { useEffect } from "react";

import { usePreviewJourney } from "@/components/PreviewJourneyProvider";
import { WorkflowArtifactTabs } from "@/components/WorkflowArtifactTabs";

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
  const { getOpportunity, startPresentation, completePresentation } = usePreviewJourney();
  const opportunity = getOpportunity(opportunityId);
  const presentation = opportunity?.presentation ?? {
    state: "waiting" as const,
    version_id: null,
    source_discovery_version_id: null,
    slide_count: 0,
  };
  const approved = opportunity?.discovery.document_state === "approved";

  useEffect(() => {
    if (presentation.state !== "generating") return;
    const timer = window.setTimeout(() => completePresentation(opportunityId), 1400);
    return () => window.clearTimeout(timer);
  }, [completePresentation, opportunityId, presentation.state]);

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
            <span className={`workflow-state-badge is-${presentation.state}`}>
              {presentation.state === "ready" ? "Ready" : presentation.state === "generating" ? "Generating" : approved ? "Ready to generate" : "Blocked"}
            </span>
          </div>
          {presentation.state === "ready" ? (
            <>
              <div className="presentation-preview">
                <div className="presentation-preview-hero">
                  <span>{opportunity?.client.values.company_name}</span>
                  <strong>Discovery-led first meeting</strong>
                  <small>Source: {presentation.source_discovery_version_id}</small>
                </div>
                <ol>{SLIDES.map((slide, index) => <li key={slide}><span>{String(index + 1).padStart(2, "0")}</span>{slide}</li>)}</ol>
              </div>
              <p>{presentation.slide_count} slides · Version {presentation.version_id}</p>
              <div className="workflow-card-actions">
                <button className="btn btn-secondary" type="button" onClick={() => downloadFixture(opportunityId, "pptx")}>Download PPTX</button>
                <button className="btn btn-secondary" type="button" onClick={() => downloadFixture(opportunityId, "pdf")}>Download PDF</button>
              </div>
            </>
          ) : presentation.state === "generating" ? (
            <div className="presentation-generating" role="status"><span /><strong>Generating PPT #1</strong><p>The approved Discovery version is being mapped to the locked slide layouts.</p></div>
          ) : (
            <>
              <div className="workflow-slide-placeholder" aria-hidden="true" />
              <p>{approved ? "Generate PPT #1 from the exact approved Discovery version." : "Approve all seven Discovery pages before generating PPT #1."}</p>
              <button className="btn btn-primary" type="button" disabled={!approved} onClick={() => startPresentation(opportunityId)}>Generate PPT #1</button>
            </>
          )}
        </article>

      </div>
    </section>
  );
}
