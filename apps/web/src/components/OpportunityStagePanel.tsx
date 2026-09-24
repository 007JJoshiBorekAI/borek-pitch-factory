"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { EmailDraftTemplateSection } from "@/components/EmailDraftTemplateSection";
import { SiteHeader } from "@/components/SiteHeader";
import { StageInputs, StageStepper } from "@/components/StageChrome";
import { useAuth } from "@/components/AuthProvider";
import { getOpportunity, listTranscripts, updateOpportunity } from "@/lib/api";
import { TRANSCRIPT_REQUIRED_MESSAGE } from "@/lib/transcriptFormats";
import {
  draftFromNotes,
  emptyPitchDraft,
  informationWithDraft,
  loadPitchDraft,
  savePitchDraft,
  sectionReady,
  type PitchDraft,
} from "@/lib/pitchDraft";

export function OpportunityStagePanel() {
  const router = useRouter();
  const params = useSearchParams();
  const opportunityId = params.get("opportunityId")?.trim() || "";
  const { accessToken, session } = useAuth();
  const [draft, setDraft] = useState<PitchDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [hasTranscript, setHasTranscript] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken || !opportunityId) {
        setLoading(false);
        return;
      }
      try {
        const opportunity = await getOpportunity(accessToken, opportunityId);
        const transcriptList = await listTranscripts(accessToken, opportunityId);
        const stored = loadPitchDraft(opportunityId) ?? draftFromNotes(opportunity.additional_client_information?.notes);
        if (!cancelled) {
          setHasTranscript(transcriptList.length > 0);
          setDraft(stored ?? emptyPitchDraft({
            client: opportunity.client_name,
            pitchTitle: opportunity.opportunity_name,
            service: opportunity.department,
            businessNeed: opportunity.opportunity_name,
          }));
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "The opportunity could not be loaded.");
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
    setSaved(false);
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  async function persist(next: PitchDraft) {
    if (!accessToken || !opportunityId) return;
    const opportunity = await getOpportunity(accessToken, opportunityId);
    savePitchDraft(opportunityId, next);
    await updateOpportunity(accessToken, opportunityId, {
      additional_client_information: informationWithDraft(opportunity.additional_client_information, next),
    });
    setSaved(true);
  }

  async function handleSave() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      await persist(draft);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The draft could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function handleComplete() {
    if (!draft) return;
    if (!hasTranscript) {
      setError(TRANSCRIPT_REQUIRED_MESSAGE);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await persist(draft);
      router.push(`/create-pitch?opportunityId=${encodeURIComponent(opportunityId)}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Stage 2 could not be completed.");
      setBusy(false);
    }
  }

  const ready = draft ? sectionReady(draft) : { meeting: false, opportunity: false, stakeholders: false, nextSteps: false };

  return (
    <div className="app-workspace">
      <SiteHeader signedInEmail={session?.user.email} />
      <main className="app-shell app-workspace-body">
        {!opportunityId ? (
          <section className="recent-empty">
            <h2>No meeting is open</h2>
            <Link href="/" className="btn btn-primary">Start a new pitch</Link>
          </section>
        ) : null}
        {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
        {loading ? <p>Loading the opportunity...</p> : null}
        {!loading && opportunityId && !hasTranscript ? (
          <section className="recent-empty">
            <h2>Transcript required</h2>
            <p>{TRANSCRIPT_REQUIRED_MESSAGE}</p>
            <Link
              href={`/first-meeting?opportunityId=${encodeURIComponent(opportunityId)}`}
              className="btn btn-primary"
            >
              Go to first meeting
            </Link>
          </section>
        ) : null}
        {draft && opportunityId && hasTranscript ? (
          <>
            <p className="pitch-breadcrumb">
              <Link href="/clients">Clients</Link> / <span>{draft.client}</span> / <span>{draft.service || "Opportunity"}</span>
            </p>
            <h2 className="pitch-greet">Complete Stage 2</h2>
            <p className="pitch-status-line">First meeting reviewed · Opportunity details from the brief</p>
            <p className="pitch-subtle pitch-lead">Confirm the opportunity, stakeholders and next steps before creating the pitch.</p>
            <StageStepper activeIndex={2} />
            <div className="pitch-stage-cols">
              <StageInputs opportunityId={opportunityId} active="opportunity" draftReady={ready} />
              <div>
                <h3 className="pitch-mid-title">Opportunity understanding</h3>
                <p className="pitch-subtle">Confirm the commercial understanding that should shape the next pitch.</p>
                <label className="pitch-info-card"><span>Business opportunity</span><textarea value={draft.businessOpportunity} onChange={(event) => update("businessOpportunity", event.target.value)} /></label>
                <label className="pitch-info-card"><span>Proposed solution</span><textarea value={draft.proposedSolution} onChange={(event) => update("proposedSolution", event.target.value)} /></label>
                <label className="pitch-info-card"><span>Relevant Borek services</span><textarea value={draft.borekServices} onChange={(event) => update("borekServices", event.target.value)} /></label>
                <div className="pitch-card-row">
                  <label className="pitch-info-card"><span>Estimated scope</span><input value={draft.scope} onChange={(event) => update("scope", event.target.value)} /></label>
                  <label className="pitch-info-card"><span>Expected timeline</span><input value={draft.timeline} onChange={(event) => update("timeline", event.target.value)} /></label>
                </div>
                <label className="pitch-info-card"><span>Estimated budget · if discussed</span><input value={draft.budget} placeholder="Not discussed" onChange={(event) => update("budget", event.target.value)} /></label>
                <div className="pitch-split-actions">
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void handleSave()}>Save draft</button>
                  <a className="btn btn-primary" href="#stakeholders">Review stakeholders →</a>
                </div>
                <p className="pitch-footnote">{saved ? "Saved · changes stay on this pitch." : "Suggested values remain editable."}</p>
              </div>
              <aside className="pitch-right-panel" id="stakeholders">
                <div className="pitch-panel-label">Stakeholders</div>
                <label className="pitch-info-card"><span>Decision makers</span><input value={draft.decisionMakers} onChange={(event) => update("decisionMakers", event.target.value)} /></label>
                <label className="pitch-info-card"><span>Key stakeholders</span><textarea value={draft.stakeholders} onChange={(event) => update("stakeholders", event.target.value)} /></label>
                <label className="pitch-info-card"><span>Primary point of contact</span><input value={draft.primaryContact} onChange={(event) => update("primaryContact", event.target.value)} /></label>
                <div id="next-steps">
                  <div className="pitch-panel-label">Next steps</div>
                  <label className="pitch-info-card"><span>Next steps</span><textarea value={draft.nextSteps} onChange={(event) => update("nextSteps", event.target.value)} /></label>
                  <label className="pitch-info-card"><span>Next meeting date</span><input value={draft.nextMeeting} onChange={(event) => update("nextMeeting", event.target.value)} /></label>
                  <label className="pitch-info-card"><span>Action items</span><textarea value={draft.actionItems} onChange={(event) => update("actionItems", event.target.value)} /></label>
                  <label className="pitch-info-card"><span>Responsible team member</span><input value={draft.responsible} onChange={(event) => update("responsible", event.target.value)} /></label>
                </div>
                <EmailDraftTemplateSection
                  accessToken={accessToken}
                  opportunityId={opportunityId}
                  mode={{ kind: "journey", journeyStage: "deepening" }}
                  title="Follow-up email"
                  description="Review the post-meeting draft before completing Stage 2."
                  canGenerate={hasTranscript}
                  generateBlockedHint={TRANSCRIPT_REQUIRED_MESSAGE}
                />
                <button type="button" className="btn btn-primary pitch-block-btn" disabled={busy} onClick={() => void handleComplete()}>
                  {busy ? "Saving..." : "Complete Stage 2 →"}
                </button>
                <p className="pitch-status-line">Next: create the client pitch</p>
              </aside>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
