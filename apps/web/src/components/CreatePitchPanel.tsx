"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { SiteHeader } from "@/components/SiteHeader";
import { StageStepper } from "@/components/StageChrome";
import { useAuth } from "@/components/AuthProvider";
import { generateFramework, getOpportunity, listTranscripts } from "@/lib/api";
import { saveSelectedJourneyStage } from "@/lib/journeyStageSelection";
import { TRANSCRIPT_REQUIRED_MESSAGE } from "@/lib/transcriptFormats";
import { draftFromNotes, emptyPitchDraft, loadPitchDraft, savePitchDraft, type PitchDraft } from "@/lib/pitchDraft";

const INCLUDES = [
  "Client context and meeting synthesis",
  "Needs, pain points and requirements",
  "Proposed Borek solution",
  "Relevant services",
  "Scope, timeline and next step",
];

export function CreatePitchPanel() {
  const router = useRouter();
  const params = useSearchParams();
  const opportunityId = params.get("opportunityId")?.trim() || "";
  const { accessToken, session } = useAuth();
  const [draft, setDraft] = useState<PitchDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
          }));
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "The pitch context could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, opportunityId]);

  async function handleCreate() {
    if (!accessToken || !opportunityId || !draft) return;
    if (!hasTranscript) {
      setError(TRANSCRIPT_REQUIRED_MESSAGE);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      savePitchDraft(opportunityId, draft);
      saveSelectedJourneyStage("deepening", opportunityId);
      const generated = await generateFramework(accessToken, opportunityId);
      const next = new URLSearchParams({ opportunityId });
      if (generated.job_id) {
        next.set("frameworkJobId", generated.job_id);
      }
      router.push(`/meeting-preparation?${next.toString()}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "The pitch could not be created. Add a transcript on the first meeting, then try again.");
      setBusy(false);
    }
  }

  const budget = draft?.budget.trim() || "Not discussed";

  return (
    <div className="app-workspace">
      <SiteHeader signedInEmail={session?.user.email} />
      <main className="app-shell app-workspace-body">
        {!opportunityId ? (
          <section className="recent-empty">
            <h2>Complete Stage 2 first</h2>
            <Link href="/" className="btn btn-primary">Start a new pitch</Link>
          </section>
        ) : null}
        {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
        {loading ? <p>Loading the pitch...</p> : null}
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
              <Link href="/clients">Clients</Link> / <span>{draft.client}</span> / <span>Stage 2</span>
            </p>
            <div className="pitch-greet-row">
              <div>
                <h2 className="pitch-greet">Create pitch from Stage 2</h2>
                <p className="pitch-status-line">Stage 2 complete · fields carried forward</p>
                <p className="pitch-subtle">Review the inherited client context, then create the next presentation.</p>
              </div>
              <Link className="btn btn-secondary" href={`/opportunity?opportunityId=${encodeURIComponent(opportunityId)}`}>
                Back to insights
              </Link>
            </div>
            <StageStepper activeIndex={3} />
            <div className="pitch-info-banner">
              <div className="pitch-panel-label">Fields carried forward</div>
              <p>Linked to this client. Edit the source in Stage 2 — the same fields are used here.</p>
            </div>
            <div className="pitch-create-cols">
              <div>
                <div className="pitch-form-eyebrow">Client conversation</div>
                <div className="pitch-read-grid">
                  <div><span>Client</span><p>{draft.client}</p></div>
                  <div><span>Meeting summary</span><p>{draft.summary || "Not captured"}</p></div>
                  <div><span>Business need</span><p>{draft.businessNeed || "Not captured"}</p></div>
                  <div><span>Pain points</span><p>{draft.painPoints || "Not captured"}</p></div>
                </div>
                <p><span className="pitch-field-label">Requirements</span>{draft.requirements || "Not captured"}</p>
                <div className="pitch-form-eyebrow">Proposed engagement</div>
                <div className="pitch-read-grid">
                  <div><span>Proposed solution</span><p>{draft.proposedSolution || draft.service || "Not captured"}</p></div>
                  <div><span>Relevant Borek services</span><p>{draft.borekServices || draft.service || "Not captured"}</p></div>
                  <div><span>Estimated scope</span><p>{draft.scope || "Not captured"}</p></div>
                  <div><span>Expected timeline</span><p>{draft.timeline || "Not captured"}</p></div>
                  <div><span>Estimated budget</span><p>{budget}</p></div>
                </div>
                <div className="pitch-form-eyebrow">Stakeholders and next step</div>
                <div className="pitch-read-grid">
                  <div><span>Stakeholders</span><p>{draft.stakeholders || draft.decisionMakers || "Not captured"}</p></div>
                  <div><span>Primary point of contact</span><p>{draft.primaryContact || "Not captured"}</p></div>
                  <div><span>Next meeting</span><p>{draft.nextMeeting || "Not captured"}</p></div>
                </div>
                <p className="pitch-footnote">Every source edit and pitch generation is recorded in Activity.</p>
              </div>
              <aside className="pitch-right-panel">
                <div className="pitch-panel-label">Create the next pitch</div>
                <h3>{draft.pitchTitle || "Client pitch"}</h3>
                <p className="pitch-subtle">Built from the reviewed Stage 2 context.</p>
                <label className="pitch-info-card">
                  <span>Language</span>
                  <select
                    value={draft.language}
                    onChange={(event) => {
                      const next = { ...draft, language: event.target.value };
                      setDraft(next);
                      savePitchDraft(opportunityId, next);
                    }}
                  >
                    <option>English</option>
                    <option>Deutsch</option>
                  </select>
                </label>
                <p><span className="pitch-field-label">Editable master</span> PPTX</p>
                <div className="pitch-panel-label">Presentation will include</div>
                <ul className="pitch-include-list">
                  {INCLUDES.map((item) => <li key={item}>{item}</li>)}
                </ul>
                {budget === "Not discussed" ? (
                  <p className="pitch-note">Budget was not discussed. Pricing stays excluded unless you add it in Stage 2.</p>
                ) : null}
                <button type="button" className="btn btn-primary pitch-block-btn" disabled={busy || !hasTranscript} onClick={() => void handleCreate()}>
                  {busy ? "Creating..." : "Create pitch →"}
                </button>
                <p className="pitch-footnote">Creates an editable draft. Nothing is sent automatically.</p>
                <p><strong>Managing Partner approval is required before any client-facing file becomes ready to send.</strong></p>
              </aside>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
