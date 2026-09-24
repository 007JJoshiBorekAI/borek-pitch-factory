"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { EmailDraftTemplateSection } from "@/components/EmailDraftTemplateSection";
import { SiteHeader } from "@/components/SiteHeader";
import { StageInputs, StageStepper } from "@/components/StageChrome";
import { useAuth } from "@/components/AuthProvider";
import { getOpportunity, listTranscripts, updateOpportunity, uploadTranscript, type TranscriptResponse } from "@/lib/api";
import {
  draftFromNotes,
  emptyPitchDraft,
  informationWithDraft,
  loadPitchDraft,
  savePitchDraft,
  sectionReady,
  type PitchDraft,
} from "@/lib/pitchDraft";
import { TRANSCRIPT_REQUIRED_MESSAGE, validateTranscriptFileName } from "@/lib/transcriptFormats";

export function FirstMeetingPanel() {
  const router = useRouter();
  const params = useSearchParams();
  const opportunityId = params.get("opportunityId")?.trim() || "";
  const { accessToken, session } = useAuth();
  const [draft, setDraft] = useState<PitchDraft | null>(null);
  const [clientName, setClientName] = useState("");
  const [transcripts, setTranscripts] = useState<TranscriptResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken || !opportunityId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const opportunity = await getOpportunity(accessToken, opportunityId);
        const stored = loadPitchDraft(opportunityId) ?? draftFromNotes(opportunity.additional_client_information?.notes);
        if (!cancelled) {
          setClientName(opportunity.client_name);
          setDraft(stored ?? emptyPitchDraft({
            client: opportunity.client_name,
            pitchTitle: opportunity.opportunity_name,
            service: opportunity.department,
          }));
          setTranscripts(await listTranscripts(accessToken, opportunityId));
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "The meeting could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, opportunityId]);

  function update(key: keyof PitchDraft, value: string) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  async function persist(next: PitchDraft) {
    if (!accessToken || !opportunityId) return;
    const opportunity = await getOpportunity(accessToken, opportunityId);
    savePitchDraft(opportunityId, next);
    await updateOpportunity(accessToken, opportunityId, {
      additional_client_information: informationWithDraft(opportunity.additional_client_information, next),
    });
  }

  async function handleContinue() {
    if (!draft) return;
    if (transcripts.length === 0) {
      setError(TRANSCRIPT_REQUIRED_MESSAGE);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = { ...draft, reviewedAt: new Date().toISOString() };
      await persist(next);
      router.push(`/opportunity?opportunityId=${encodeURIComponent(opportunityId)}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The meeting could not be saved.");
      setBusy(false);
    }
  }

  async function handleTranscript(file: File) {
    if (!accessToken || !opportunityId) return;
    const check = validateTranscriptFileName(file.name);
    if (!check.ok) {
      setError(check.reason ?? "That file cannot be used as a transcript.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await uploadTranscript(accessToken, opportunityId, file);
      setTranscripts(await listTranscripts(accessToken, opportunityId));
      setSavedNote("Transcript received");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "The transcript could not be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  const hasTranscript = transcripts.length > 0;
  const ready = draft ? sectionReady(draft) : { meeting: false, opportunity: false, stakeholders: false, nextSteps: false };
  const readyCount = Object.values(ready).filter(Boolean).length;

  return (
    <div className="app-workspace">
      <SiteHeader signedInEmail={session?.user.email} />
      <main className="app-shell app-workspace-body">
        {!opportunityId ? (
          <section className="recent-empty">
            <h2>Start with a client</h2>
            <p>Prepare a brief before opening the first meeting.</p>
            <Link href="/" className="btn btn-primary">Start a new pitch</Link>
          </section>
        ) : null}
        {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
        {loading ? <p>Loading the meeting...</p> : null}
        {draft && opportunityId ? (
          <>
            <p className="pitch-breadcrumb">
              <Link href="/clients">Clients</Link> / <span>{draft.client || clientName}</span> /{" "}
              <Link href={`/first-contact?opportunityId=${encodeURIComponent(opportunityId)}`}>Stage 1 brief</Link> /{" "}
              <span>{draft.service || "Opportunity"}</span>
            </p>
            <h2 className="pitch-greet">First meeting</h2>
            <p className="pitch-status-line">
              {hasTranscript ? "Transcript received · Review meeting notes" : "Transcript required before Stage 2"}
            </p>
            <p className="pitch-subtle pitch-lead">Upload the meeting transcript, then review and edit the captured notes.</p>
            <StageStepper activeIndex={1} />
            <div className="pitch-stage-cols">
              <StageInputs opportunityId={opportunityId} active="meeting" draftReady={ready} />
              <div>
                <h3 className="pitch-mid-title">First meeting</h3>
                <p className="pitch-subtle">Suggested from the transcript. Review and edit before continuing.</p>
                <div className="pitch-card-row">
                  <label className="pitch-info-card">
                    <span>Meeting date</span>
                    <input value={draft.meetingDate} onChange={(event) => update("meetingDate", event.target.value)} />
                  </label>
                  <label className="pitch-info-card">
                    <span>Meeting participants</span>
                    <input value={draft.participants} onChange={(event) => update("participants", event.target.value)} />
                  </label>
                </div>
                <label className="pitch-info-card">
                  <span>Meeting summary</span>
                  <textarea value={draft.summary} onChange={(event) => update("summary", event.target.value)} />
                </label>
                <div className="pitch-card-row">
                  <label className="pitch-info-card">
                    <span>Client needs / pain points</span>
                    <textarea value={draft.painPoints} onChange={(event) => update("painPoints", event.target.value)} />
                  </label>
                  <label className="pitch-info-card">
                    <span>Client requirements</span>
                    <textarea value={draft.requirements} onChange={(event) => update("requirements", event.target.value)} />
                  </label>
                </div>
                <label className="pitch-info-card">
                  <span>Questions / concerns raised</span>
                  <textarea value={draft.questions} onChange={(event) => update("questions", event.target.value)} />
                </label>
                <div className="pitch-split-actions">
                  <label className={`btn ${hasTranscript ? "btn-secondary" : "btn-primary"}`}>
                    {hasTranscript ? "Add another transcript" : "Upload transcript"}
                    <input type="file" hidden disabled={busy} onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleTranscript(file);
                      event.target.value = "";
                    }} />
                  </label>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy || !hasTranscript}
                    onClick={() => void handleContinue()}
                  >
                    {busy ? "Saving..." : "Continue to opportunity →"}
                  </button>
                </div>
                <p className="pitch-footnote">
                  {savedNote
                    || (hasTranscript
                      ? transcripts.map((item) => item.file_name).join(" · ")
                      : TRANSCRIPT_REQUIRED_MESSAGE)}
                </p>
                {hasTranscript ? (
                  <EmailDraftTemplateSection
                    accessToken={accessToken}
                    opportunityId={opportunityId}
                    mode={{ kind: "journey", journeyStage: "deepening" }}
                    title="Follow-up email"
                    description="Draft to send after the first meeting — short, medium, or extensive."
                    canGenerate={hasTranscript}
                    generateBlockedHint={TRANSCRIPT_REQUIRED_MESSAGE}
                  />
                ) : null}
              </div>
              <aside className="pitch-right-panel">
                <div className="pitch-panel-label">Create pitch</div>
                <h3>{readyCount} of 4 sections ready</h3>
                <div className="pitch-thin-bar"><span style={{ width: `${readyCount * 25}%` }} /></div>
                <p className="pitch-subtle">Complete Stage 2 before creating the next client presentation.</p>
                <div className="pitch-panel-label">Missing</div>
                {!hasTranscript ? <p>Meeting transcript</p> : null}
                {!draft.nextMeeting.trim() ? <p>Next meeting date</p> : null}
                {!draft.responsible.trim() ? <p>Responsible team member</p> : null}
                {hasTranscript && draft.nextMeeting.trim() && draft.responsible.trim() ? (
                  <p>Nothing required is missing.</p>
                ) : null}
                <button type="button" className="btn btn-secondary pitch-block-btn" disabled>
                  Create pitch →
                </button>
                <p className="pitch-footnote">Available when required information is reviewed.</p>
              </aside>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
