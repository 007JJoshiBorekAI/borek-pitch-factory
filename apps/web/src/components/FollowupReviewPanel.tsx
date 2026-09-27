"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { FollowUpEmailView } from "@/components/FollowUpEmailView";
import { WorkspaceShell } from "@/components/WorkspaceShell";
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
  const [contextLoading, setContextLoading] = useState(true);
  const [contextError, setContextError] = useState<string | null>(null);

  const [statics, setStatics] = useState<FollowupProjectStatics>(emptyFollowupProjectStatics);
  const [staticsSaved, setStaticsSaved] = useState(false);
  const [draft, setDraft] = useState<FollowupDraft | null>(null);
  const [adaptedEmail, setAdaptedEmail] = useState<AdaptedEmailDraftReview | null>(null);
  const [selectedLength, setSelectedLength] = useState<EmailDraftLength>("medium");
  const [checklist, setChecklist] = useState(emptyFollowupChecklist);
  const [acknowledgedFlags, setAcknowledgedFlags] = useState<Set<string>>(new Set());
  const [bodyEdited, setBodyEdited] = useState(false);
  const initialDraftBodyRef = useRef<string | null>(null);
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
      initialDraftBodyRef.current = applied.panelDraft?.body ?? null;
      setBodyEdited(false);
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
      setBodyEdited(false);
      initialDraftBodyRef.current = null;

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
        const savedStatics = loaded.opportunity.followup_statics;
        if (demoMode) {
          const demoStatics = savedStatics ?? demoFollowupProjectStatics();
          setStatics(demoStatics);
          setStaticsSaved(true);
          const demoDraft = demoEmailDraftForStage(journeyStage, demoStatics);
          setDraft(demoDraft);
          initialDraftBodyRef.current = demoDraft.body;
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
    setBodyEdited(false);
    initialDraftBodyRef.current = null;
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
        const demoDraft = demoEmailDraftForStage(journeyStage, saved.followup_statics);
        setDraft(demoDraft);
        initialDraftBodyRef.current = demoDraft.body;
        setBodyEdited(false);
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
    setBodyEdited(value.body !== initialDraftBodyRef.current);
    setChecklist(emptyFollowupChecklist());
    setAcknowledgedFlags(new Set());
    setInfo(null);
  }

  function handleLengthChange(length: EmailDraftLength) {
    if (!adaptedEmail?.lengths) {
      return;
    }
    setSelectedLength(length);
    const nextDraft = panelDraftForAdaptedEmail(adaptedEmail, length);
    setDraft(nextDraft);
    initialDraftBodyRef.current = nextDraft?.body ?? null;
    setBodyEdited(false);
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

  const serverConfirmed = Boolean(!demoMode && adaptedEmail?.serverConfirmed);
  const draftNotGenerated =
    !demoMode && staticsSaved && !draft && !generatingDraft && !contextLoading;
  const combinedError = contextError ?? error ?? emailLoadError;
  const showReview = !authLoading && accessToken;
  const liveDraftReadOnly = !demoMode && Boolean(adaptedEmail?.draftId);
  const panelBusy = busy || generatingDraft || confirmingDraft;

  return (
    <WorkspaceShell activeSection="post-meeting">
      {!authLoading && accessToken ? <span data-testid="auth-ready" hidden /> : null}

      {!showReview ? (
        authLoading ? null : (
          <div className="upload-banner upload-banner-info app-shell app-workspace-body">
            <div>
              <strong>Authentication required</strong>
              <p>Sign in to review this follow-up email.</p>
            </div>
            <div className="upload-banner-actions">
              <Link href="/login" className="btn btn-primary">
                Sign in
              </Link>
            </div>
          </div>
        )
      ) : (
        <FollowUpEmailView
          opportunityId={opportunityId}
          clientName={clientName || opportunityName || null}
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
          bodyEdited={bodyEdited}
          checklist={checklist}
          acknowledgedFlags={acknowledgedFlags}
          busy={panelBusy}
          generatingDraft={generatingDraft}
          confirmingDraft={confirmingDraft}
          loading={authLoading || contextLoading}
          error={combinedError}
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
    </WorkspaceShell>
  );
}
