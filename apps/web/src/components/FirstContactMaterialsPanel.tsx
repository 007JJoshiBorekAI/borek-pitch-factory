"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { StageReviewLayout } from "@/components/StageReviewLayout";
import {
  demoFirstMeetingDeckProfile,
  demoFirstMeetingSlideCount,
  demoMeetingAgenda,
} from "@/lib/stageOutputDemoContent";
import { FIRST_CONTACT_SLIDE_COUNT } from "@/lib/stageOutputArtifacts";
import { STAGE_OUTPUT_BACKEND_NOTE, isStageOutputDemoMode } from "@/lib/stageOutputReview";
import { loadStageReviewContext } from "@/lib/stageOutputReviewLoad";
import type { StageOutputHubItem } from "@/lib/stageOutputReview";

function UnavailableReviewState({ message }: { message: string }) {
  return (
    <div className="stage-review-unavailable">
      <strong>Meeting materials not available yet</strong>
      <p>{message}</p>
    </div>
  );
}

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
        setHubItems(loaded.hubItems);
        setEligibilityLockCopy(loaded.eligibilityLockCopy);
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
        <>
          <p className="stage-output-demo-banner" role="note">
            Demonstration data — sample BT-36 contract fixture. The approved profile uses{" "}
            {FIRST_CONTACT_SLIDE_COUNT} slides, not the 8-slide Figma reference.
          </p>
          <section className="upload-panel stage-review-section">
            <h2>First-meeting presentation</h2>
            <p className="stage-review-profile-note">
              Profile: <code>{demoFirstMeetingDeckProfile()}</code> ·{" "}
              {demoFirstMeetingSlideCount()} slides
            </p>
            <p className="upload-hint">
              Preview and download will connect to the presentation API in a later MS-35 phase.
              No download URL is shown in this foundation pass.
            </p>
          </section>
          <section className="upload-panel stage-review-section">
            <h2>First-meeting agenda</h2>
            <ol className="stage-review-agenda-list">
              {demoMeetingAgenda().map((item) => (
                <li key={item.topic}>
                  <strong>{item.topic}</strong>
                  <span>{item.duration} min</span>
                  {item.notes ? <p>{item.notes}</p> : null}
                </li>
              ))}
            </ol>
          </section>
        </>
      ) : (
        <UnavailableReviewState message={STAGE_OUTPUT_BACKEND_NOTE} />
      )}
    </StageReviewLayout>
  );
}
