"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { FollowupReviewView } from "@/components/FollowupReviewView";
import { StageReviewLayout } from "@/components/StageReviewLayout";
import type { JourneyStageName } from "@/lib/api";
import { updateOpportunity } from "@/lib/api";
import {
  emailDraftErrorMessage,
  fetchAdaptedEmailDraft,
  generateAdaptedEmailDraft,
  confirmAdaptedEmailDraft,
  applyPreferredEmailLength,
  hasLiveEmailDraft,
  panelDraftForAdaptedEmail,
} from "@/lib/emailDraftLive";
import type { EmailDraftLength } from "@/lib/journeyOutputsContracts";
import type { AdaptedEmailDraftReview } from "@/lib/stageOutputsApiAdapter";
import {
  canConfirmFollowupReview,
  emptyFollowupChecklist,
  emptyFollowupProjectStatics,
  validateFollowupProjectStatics,
  type FollowupChecklistId,
  type FollowupDraft,
  type FollowupProjectStatics,
} from "@/lib/followupReview";
import {
  demoEmailDraftForStage,
  demoFollowupProjectStatics,
  getStageEmailReviewContext,
} from "@/lib/stageEmailReview";
import { isStageOutputDemoMode } from "@/lib/stageOutputReview";
import { loadStageReviewContext } from "@/lib/stageOutputReviewLoad";
import type { StageOutputHubItem } from "@/lib/stageOutputReview";

export function FollowupReviewPanel({
  opportunityId,
  journeyStage,
}: {
  opportunityId: string;
  journeyStage: JourneyStageName;
}) {
  const { accessToken, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const demoMode = isStageOutputDemoMode(searchParams);
  const stageContext = useMemo(
    () => getStageEmailReviewContext(journeyStage, demoMode),
    [journeyStage, demoMode],
  );

  const [clientName, setClientName] = useState("");
  const [opportunityName, setOpportunityName] = useState("");
  const [hubItems, setHubItems] = useState<StageOutputHubItem[]>([]);
  const [eligibilityLockCopy, setEligibilityLockCopy] = useState<string | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [contextError, setContextError] = useState<string | null>(null);

  const [statics, setStatics] = useState<FollowupProjectStatics>(emptyFollowupProjectStatics);
  const [staticsSaved, setStaticsSaved] = useState(false);
  const [draft, setDraft] = useState<FollowupDraft | null>(null);
  const [adaptedEmail, setAdaptedEmail] = useState<AdaptedEmailDraftReview | null>(null);
  const [selectedLength, setSelectedLength] = useState<EmailDraftLength>("medium");
  const [checklist, setChecklist] = useState(emptyFollowupChecklist);
  const [acknowledgedFlags, setAcknowledgedFlags] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [confirmingDraft, setConfirmingDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailLoadError, setEmailLoadError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const applyAdaptedEmail = useCallback(
    (adapted: AdaptedEmailDraftReview, length?: EmailDraftLength) => {
      const nextLength = length ?? adapted.selectedLength ?? "medium";
      const applied = applyPreferredEmailLength(adapted, nextLength);
      setAdaptedEmail(applied);
      setSelectedLength(nextLength);
      setDraft(applied.panelDraft);
      setChecklist(emptyFollowupChecklist());
      setAcknowledgedFlags(new Set());
    },
    [],
  );

  const loadLiveEmailDraft = useCallback(
    async (preferredLength?: EmailDraftLength) => {
      if (!accessToken || demoMode) {
        setAdaptedEmail(null);
        setEmailLoadError(null);
        return;
      }
      try {
        const adapted = await fetchAdaptedEmailDraft(
          accessToken,
          opportunityId,
          journeyStage,
          preferredLength,
        );
        setEmailLoadError(null);
        if (hasLiveEmailDraft(adapted)) {
          applyAdaptedEmail(adapted, preferredLength);
        } else {
          setAdaptedEmail(adapted);
          setDraft(null);
        }
      } catch (loadError) {
        setAdaptedEmail(null);
        setDraft(null);
        setEmailLoadError(emailDraftErrorMessage(loadError));
      }
    },
    [accessToken, applyAdaptedEmail, demoMode, journeyStage, opportunityId],
  );

  useEffect(() => {
    let active = true;
    async function load() {
      if (!accessToken) {
        return;
      }
      setContextLoading(true);
      setContextError(null);
      setError(null);
      setInfo(null);
      setEmailLoadError(null);
      setDraft(null);
      setAdaptedEmail(null);
      setChecklist(emptyFollowupChecklist());
      setAcknowledgedFlags(new Set());

      try {
        const loaded = await loadStageReviewContext(
          accessToken,
          opportunityId,
          journeyStage,
          demoMode,
        );
        if (!active) {
          return;
        }

        setClientName(loaded.opportunity.client_name);
        setOpportunityName(loaded.opportunity.opportunity_name);
        setHubItems(loaded.hubItems);
        setEligibilityLockCopy(loaded.eligibilityLockCopy);

        const savedStatics = loaded.opportunity.followup_statics;
        if (demoMode) {
          const demoStatics = savedStatics ?? demoFollowupProjectStatics();
          setStatics(demoStatics);
          setStaticsSaved(true);
          setDraft(demoEmailDraftForStage(journeyStage, demoStatics));
        } else if (savedStatics) {
          setStatics(savedStatics);
          setStaticsSaved(true);
        } else {
          setStatics(emptyFollowupProjectStatics());
          setStaticsSaved(false);
        }
      } catch {
        if (active) {
          setContextError("This opportunity's email review context could not be loaded.");
        }
      } finally {
        if (active) {
          setContextLoading(false);
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [accessToken, demoMode, journeyStage, opportunityId]);

  useEffect(() => {
    if (!accessToken || demoMode || contextLoading || !staticsSaved) {
      return;
    }
    void loadLiveEmailDraft();
  }, [accessToken, contextLoading, demoMode, loadLiveEmailDraft, staticsSaved]);

  function handleStaticsChange(value: FollowupProjectStatics) {
    setStatics(value);
    setStaticsSaved(false);
    setInfo(null);
    setDraft(null);
    setAdaptedEmail(null);
    setChecklist(emptyFollowupChecklist());
    setAcknowledgedFlags(new Set());
  }

  async function handleSaveStatics() {
    if (!accessToken) {
      return;
    }
    const validation = validateFollowupProjectStatics(statics);
    if (validation.length) {
      setError(validation[0]);
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const saved = await updateOpportunity(accessToken, opportunityId, { followup_statics: statics });
      if (!saved.followup_statics) {
        throw new Error("Missing saved project statics");
      }
      setStatics(saved.followup_statics);
      setStaticsSaved(true);
      setChecklist(emptyFollowupChecklist());
      setAcknowledgedFlags(new Set());

      if (demoMode) {
        setDraft(demoEmailDraftForStage(journeyStage, saved.followup_statics));
        setInfo(stageContext.staticsSavedInfoDemo);
      } else {
        setDraft(null);
        setAdaptedEmail(null);
        setInfo(stageContext.staticsSavedInfoLive);
        await loadLiveEmailDraft();
      }
    } catch {
      setError("Project email settings could not be saved. Check the values and try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleFlagChange(flag: string, checked: boolean) {
    setAcknowledgedFlags((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(flag);
      } else {
        next.delete(flag);
      }
      return next;
    });
  }

  function handleDraftChange(value: FollowupDraft) {
    if (!demoMode) {
      return;
    }
    setDraft(value);
    setChecklist(emptyFollowupChecklist());
    setAcknowledgedFlags(new Set());
    setInfo(null);
  }

  function handleLengthChange(length: EmailDraftLength) {
    if (!adaptedEmail?.lengths) {
      return;
    }
    setSelectedLength(length);
    setDraft(panelDraftForAdaptedEmail(adaptedEmail, length));
    setChecklist(emptyFollowupChecklist());
    setAcknowledgedFlags(new Set());
    setInfo(null);
  }

  async function handleGenerateDraft() {
    if (!accessToken || demoMode || generatingDraft) {
      return;
    }
    setGeneratingDraft(true);
    setError(null);
    setInfo(null);
    try {
      const adapted = await generateAdaptedEmailDraft(
        accessToken,
        opportunityId,
        journeyStage,
        selectedLength,
      );
      setEmailLoadError(null);
      if (!hasLiveEmailDraft(adapted)) {
        setAdaptedEmail(adapted);
        setDraft(null);
        setError("The server returned no email draft after generation.");
        return;
      }
      applyAdaptedEmail(adapted);
      setInfo("Email draft generated. Choose a length and confirm review when ready.");
    } catch (generateError) {
      setError(emailDraftErrorMessage(generateError));
    } finally {
      setGeneratingDraft(false);
    }
  }

  async function handleConfirm() {
    if (!canConfirmFollowupReview(draft, statics, checklist, acknowledgedFlags, staticsSaved)) {
      return;
    }

    if (demoMode) {
      setDraft((current) => (current ? { ...current, status: "reviewed" } : current));
      setInfo(stageContext.confirmReviewedMessage);
      return;
    }

    if (!accessToken || !adaptedEmail?.draftId || confirmingDraft) {
      return;
    }

    setConfirmingDraft(true);
    setError(null);
    setInfo(null);
    try {
      const confirmed = await confirmAdaptedEmailDraft(
        accessToken,
        opportunityId,
        adaptedEmail.draftId,
        selectedLength,
      );
      applyAdaptedEmail(confirmed, selectedLength);
      setInfo(stageContext.confirmReviewedMessageLive);
    } catch (confirmError) {
      setError(emailDraftErrorMessage(confirmError));
    } finally {
      setConfirmingDraft(false);
    }
  }

  const canConfirm = canConfirmFollowupReview(
    draft,
    statics,
    checklist,
    acknowledgedFlags,
    staticsSaved,
  );
  const serverConfirmed = Boolean(!demoMode && adaptedEmail?.serverConfirmed);
  const draftNotGenerated =
    !demoMode && staticsSaved && !draft && !generatingDraft && !contextLoading;
  const combinedError = contextError ?? error ?? emailLoadError;
  const showReview = !authLoading && accessToken;
  const liveDraftReadOnly = !demoMode && Boolean(adaptedEmail?.draftId);
  const panelBusy = busy || generatingDraft || confirmingDraft;

  return (
    <StageReviewLayout
      journeyStage={journeyStage}
      currentStep="email"
      opportunityId={opportunityId}
      clientName={clientName || "Client"}
      opportunityName={opportunityName || "Opportunity"}
      kicker={stageContext.kicker}
      title={stageContext.title}
      lead={stageContext.lead}
      demoMode={demoMode}
      loading={authLoading || contextLoading}
      error={combinedError}
      hubItems={hubItems}
      eligibilityLockCopy={eligibilityLockCopy}
    >
      {!showReview ? (
        authLoading ? null : (
          <p className="alert alert-info">Sign in to review this email.</p>
        )
      ) : (
        <FollowupReviewView
          stageContext={stageContext}
          demoMode={demoMode}
          statics={statics}
          staticsSaved={staticsSaved}
          draft={draft}
          draftNotGenerated={draftNotGenerated}
          draftUnavailable={false}
          selectedLength={selectedLength}
          liveDraftReadOnly={liveDraftReadOnly}
          serverConfirmed={serverConfirmed}
          checklist={checklist}
          acknowledgedFlags={acknowledgedFlags}
          canConfirm={canConfirm}
          busy={panelBusy}
          generatingDraft={generatingDraft}
          confirmingDraft={confirmingDraft}
          error={null}
          info={info}
          onStaticsChange={handleStaticsChange}
          onSaveStatics={() => void handleSaveStatics()}
          onDraftChange={handleDraftChange}
          onLengthChange={handleLengthChange}
          onGenerateDraft={() => void handleGenerateDraft()}
          onChecklistChange={(id: FollowupChecklistId, checked: boolean) =>
            setChecklist((current) => ({ ...current, [id]: checked }))
          }
          onFlagChange={handleFlagChange}
          onConfirm={() => void handleConfirm()}
        />
      )}
    </StageReviewLayout>
  );
}
