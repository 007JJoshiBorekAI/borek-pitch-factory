import Link from "next/link";
import React from "react";

import type { PresentationRef } from "@/lib/stage1Contracts";
import type { VerifiedFirstMeetingPresentation } from "@/lib/firstMeetingPresentationReview";
import { pipelineHref } from "@/lib/pipelineContext";
import { FIRST_CONTACT_SLIDE_COUNT } from "@/lib/stageOutputArtifacts";
import { presentationUnavailableMessage } from "@/lib/stage1OutputsView";

export function FirstMeetingPresentationPanel({
  presentationRef,
  dependencies = [],
  opportunityId,
  verifiedPresentation,
  demoMode,
}: {
  presentationRef: PresentationRef | null;
  dependencies?: string[];
  opportunityId: string;
  verifiedPresentation?: VerifiedFirstMeetingPresentation | null;
  demoMode: boolean;
}) {
  const profile = presentationRef?.profile ?? "first_meeting_3_slide";
  const canOpenDeckCenter = Boolean(verifiedPresentation?.presentationId) && !demoMode;

  return (
    <section className="upload-panel stage-review-section">
      <h2>First-meeting presentation</h2>
      <p className="stage-review-profile-note">
        Profile: <code>{profile}</code> · {FIRST_CONTACT_SLIDE_COUNT} slides
      </p>

      {canOpenDeckCenter && verifiedPresentation ? (
        <>
          <p>
            A {verifiedPresentation.profile} presentation ({verifiedPresentation.slideCount}{" "}
            slides) is ready for this opportunity. Open the authorized deck center to preview
            slides and download artifacts.
          </p>
          <Link
            href={`${pipelineHref("/deck-center", opportunityId)}&presentationId=${encodeURIComponent(verifiedPresentation.presentationId)}`}
            className="btn btn-primary"
          >
            Open presentation review
          </Link>
        </>
      ) : (
        <div className="stage-review-unavailable">
          <strong>Presentation unavailable</strong>
          <p>
            {presentationRef
              ? presentationUnavailableMessage(presentationRef, dependencies)
              : "First-meeting presentation has not been generated yet."}
          </p>
          {!demoMode ? (
            <p className="upload-hint">
              Only a verified {profile} deck ({FIRST_CONTACT_SLIDE_COUNT} slides) can be linked
              here. Deepening or concretisation presentations are not shown on this page.
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
