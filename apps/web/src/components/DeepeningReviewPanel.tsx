"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { ActionItemsPanel } from "@/components/ActionItemsPanel";
import { AdjustedPresentationPanel } from "@/components/AdjustedPresentationPanel";
import { CallSummaryPanel } from "@/components/CallSummaryPanel";
import { DecisionsListPanel } from "@/components/DecisionsListPanel";
import { MinutesOfMeetingPanel } from "@/components/MinutesOfMeetingPanel";
import { OpenQuestionsPanel } from "@/components/OpenQuestionsPanel";
import { StageReviewLayout } from "@/components/StageReviewLayout";
import {
  resolveVerifiedStagePresentation,
  type VerifiedStagePresentation,
} from "@/lib/presentationStageVerification";
import { stage2OutputsDemo } from "@/lib/stageOutputDemoFixtures";
import { STAGE_OUTPUT_BACKEND_NOTE, isStageOutputDemoMode } from "@/lib/stageOutputReview";
import { loadStageReviewContext } from "@/lib/stageOutputReviewLoad";
import type { StageOutputHubItem } from "@/lib/stageOutputReview";
import type { Stage2Outputs } from "@/lib/stage2Contracts";

const LIVE_DEPENDENCIES = [
  "TRANSCRIPT_SUMMARY_UNAVAILABLE",
  "MEETING_FEEDBACK_UNAVAILABLE",
  "CALL_SUMMARY_NOT_RUN",
  "MOM_NOT_RUN",
  "PRESENTATION_NOT_RUN",
];

const EMPTY_STAGE2_OUTPUTS: Stage2Outputs = {
  schema_version: "1.0",
  opportunity_id: "",
  journey_stage: "deepening",
  prompt_version: "",
  transcript_summary_ref: {
    artifact_kind: "transcript_summary",
    schema_version: "1.0",
    transcript_id: "",
    conversation_id: "C0",
  },
  call_summary: { status: "unknown", origin: "UNKNOWN", text: null, source_refs: [] },
  minutes_of_meeting: {
    status: "unknown",
    origin: "UNKNOWN",
    sections: [],
    source_refs: [],
  },
  decisions: [],
  action_items: [],
  open_questions: [],
  presentation_ref: {
    status: "unknown",
    profile: "deepening_adjusted",
    presentation_id: null,
    presentation_version_id: null,
  },
  dependencies: LIVE_DEPENDENCIES,
};

export function DeepeningReviewPanel({ opportunityId }: { opportunityId: string }) {
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
          "deepening",
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
          setError("Post-meeting review could not be loaded. Return to intake and try again.");
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
        "deepening_adjusted",
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

  const outputs = demoMode ? stage2OutputsDemo : null;
  const live = EMPTY_STAGE2_OUTPUTS;

  return (
    <StageReviewLayout
      journeyStage="deepening"
      currentStep="review"
      opportunityId={opportunityId}
      clientName={clientName}
      opportunityName={opportunityName}
      kicker="Deepening"
      title="Post-meeting review"
      lead="Review the call summary, minutes of meeting, decisions, action items, and adjusted presentation after the first meeting."
      demoMode={demoMode}
      loading={loading}
      error={error}
      hubItems={hubItems}
      eligibilityLockCopy={eligibilityLockCopy}
    >
      {demoMode ? (
        <p className="stage-output-demo-banner" role="note">
          Demonstration data — sample BT-36 stage2_outputs fixture, not live meeting output.
        </p>
      ) : (
        <p className="upload-hint" role="note">
          {STAGE_OUTPUT_BACKEND_NOTE} Meeting feedback intake is not persisted — see MS-35 ticket
          for the required backend contract.
        </p>
      )}

      <CallSummaryPanel
        summary={outputs?.call_summary ?? live.call_summary}
        dependencies={outputs?.dependencies ?? LIVE_DEPENDENCIES}
      />
      <MinutesOfMeetingPanel
        mom={outputs?.minutes_of_meeting ?? live.minutes_of_meeting}
        dependencies={outputs?.dependencies ?? LIVE_DEPENDENCIES}
      />
      <DecisionsListPanel decisions={outputs?.decisions ?? live.decisions} />
      <ActionItemsPanel items={outputs?.action_items ?? live.action_items} />
      <OpenQuestionsPanel questions={outputs?.open_questions ?? live.open_questions} />
      <AdjustedPresentationPanel
        presentationRef={outputs?.presentation_ref ?? live.presentation_ref}
        dependencies={outputs?.dependencies ?? LIVE_DEPENDENCIES}
        opportunityId={opportunityId}
        verifiedPresentation={verifiedPresentation}
        demoMode={demoMode}
      />
    </StageReviewLayout>
  );
}
