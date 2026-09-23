import Link from "next/link";
import React from "react";

import type { Stage2PresentationRef } from "@/lib/stage2Contracts";
import type { VerifiedStagePresentation } from "@/lib/presentationStageVerification";
import { pipelineHref } from "@/lib/pipelineContext";
import { adjustedPresentationUnavailableMessage } from "@/lib/stage2OutputsView";

export function AdjustedPresentationPanel({
  presentationRef,
  dependencies = [],
  opportunityId,
  verifiedPresentation,
  demoMode,
}: {
  presentationRef: Stage2PresentationRef | null;
  dependencies?: string[];
  opportunityId: string;
  verifiedPresentation?: VerifiedStagePresentation | null;
  demoMode: boolean;
}) {
  const profile = presentationRef?.profile ?? "deepening_adjusted";
  const canOpenDeckCenter = Boolean(verifiedPresentation?.presentationId) && !demoMode;

  return (
    <section className="upload-panel stage-review-section">
      <h2>Adjusted presentation</h2>
      <p className="stage-review-profile-note">
        Profile: <code>{profile}</code>
      </p>

      {canOpenDeckCenter && verifiedPresentation ? (
        <>
          <p>
            A verified Deepening presentation is available for this opportunity. Open the
            authorized deck center to preview slides and download artifacts.
          </p>
          <Link
            href={`${pipelineHref("/deck-center", opportunityId)}&presentationId=${encodeURIComponent(verifiedPresentation.presentationId)}`}
            className="btn btn-primary"
          >
            Open adjusted presentation
          </Link>
        </>
      ) : (
        <div className="stage-review-unavailable">
          <strong>Adjusted presentation unavailable</strong>
          <p>
            {presentationRef
              ? adjustedPresentationUnavailableMessage(presentationRef.status, dependencies)
              : "Adjusted presentation has not been generated yet."}
          </p>
          {!demoMode ? (
            <p className="upload-hint">
              A deck link requires archive metadata confirming both this opportunity and the
              Deepening journey stage. First Contact or Concretisation decks are not linked here.
            </p>
          ) : null}
          {demoMode && presentationRef?.status === "generated" ? (
            <p className="upload-hint">
              Demonstration fixture IDs are not linked to live download or preview endpoints.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
