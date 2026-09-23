"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { FirstMeetingPresentationPanel } from "@/components/FirstMeetingPresentationPanel";
import { MeetingAgendaPanel } from "@/components/MeetingAgendaPanel";
import { StageReviewLayout } from "@/components/StageReviewLayout";
import {
  resolveVerifiedStagePresentation,
  type VerifiedStagePresentation,
} from "@/lib/presentationStageVerification";
import { stage1OutputsDemo } from "@/lib/stageOutputDemoFixtures";
import { FIRST_CONTACT_SLIDE_COUNT } from "@/lib/stageOutputArtifacts";
import { isStageOutputDemoMode } from "@/lib/stageOutputReview";
import { loadStageReviewContext } from "@/lib/stageOutputReviewLoad";
import type { StageOutputHubItem } from "@/lib/stageOutputReview";

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
  const [verifiedPresentation, setVerifiedPresentation] =
    useState<VerifiedStagePresentation | null>(null);

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

  useEffect(() => {
    let active = true;
    async function loadPresentation() {
      if (!accessToken || demoMode) {
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
  }, [accessToken, demoMode, opportunityId]);

  const outputs = demoMode ? stage1OutputsDemo : null;
  const liveDependencies = ["AGENDA_NOT_RUN", "PRESENTATION_NOT_RUN"];

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
        <MeetingAgendaPanel
          agenda={{
            status: "unknown",
            origin: "AI_INFERENCE",
            items: [],
            source_refs: [],
          }}
          dependencies={liveDependencies}
        />
      )}
    </StageReviewLayout>
  );
}
