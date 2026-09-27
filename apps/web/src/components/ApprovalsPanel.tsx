"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { displayNameFromEmail, SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/components/AuthProvider";
import { getOpportunity, listTranscripts } from "@/lib/api";
import {
  draftFromNotes,
  emptyPitchDraft,
  loadPitchDraft,
  loadReleaseDecision,
  saveReleaseDecision,
  type PitchDraft,
  type ReleaseDecision,
} from "@/lib/pitchDraft";
import { useRecentWork } from "@/components/useRecentWork";

function formatStamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ApprovalsPanel() {
  const params = useSearchParams();
  const requestedId = params.get("opportunityId")?.trim() || "";
  const { accessToken, session, employee } = useAuth();
  const { items, loading, email } = useRecentWork();
  const actor = displayNameFromEmail(email ?? session?.user.email ?? employee?.email);
  const opportunityId = requestedId || items[0]?.opportunityId || "";
  const work = items.find((item) => item.opportunityId === opportunityId) ?? items[0];
  const [draft, setDraft] = useState<PitchDraft>(emptyPitchDraft());
  const [transcriptCount, setTranscriptCount] = useState(0);
  const [decision, setDecision] = useState<ReleaseDecision>("pending");
  const [decidedAt, setDecidedAt] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken || !opportunityId) return;
      setDecision(loadReleaseDecision(opportunityId));
      try {
        const opportunity = await getOpportunity(accessToken, opportunityId);
        const stored = loadPitchDraft(opportunityId) ?? draftFromNotes(opportunity.additional_client_information?.notes);
        const files = await listTranscripts(accessToken, opportunityId);
        if (!cancelled) {
          setDraft(stored ?? emptyPitchDraft({
            client: opportunity.client_name,
            pitchTitle: opportunity.opportunity_name,
          }));
          setTranscriptCount(files.length);
        }
      } catch {
        if (!cancelled && work) {
          setDraft(emptyPitchDraft({ client: work.clientName, pitchTitle: work.opportunityName }));
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, opportunityId, work]);

  function decide(next: ReleaseDecision) {
    if (!opportunityId) return;
    saveReleaseDecision(opportunityId, next);
    setDecision(next);
    setDecidedAt(new Date().toISOString());
  }

  const client = draft.client || work?.clientName || "Client";
  const title = draft.pitchTitle || work?.opportunityName || "Pitch";
  const factualDone = Boolean(draft.summary.trim() || draft.businessNeed.trim());
  const sourcesDone = transcriptCount > 0;
  const budgetDiscussed = Boolean(draft.budget.trim()) && draft.budget.trim().toLowerCase() !== "not discussed";
  const filesReady = Boolean(work?.downloadPath);
  const submitted = draft.reviewedAt ? formatStamp(draft.reviewedAt) : "";
  const statusLabel = decision === "released"
    ? "Released as ready"
    : decision === "changes"
      ? "Changes requested"
      : "Awaiting Managing Partner approval";

  return (
    <div className="app-workspace">
      <SiteHeader signedInEmail={email} />
      <main className="app-shell app-workspace-body">
        {loading ? <p>Loading approvals...</p> : null}
        {!loading && !opportunityId ? (
          <section className="recent-empty">
            <h2>Nothing is waiting for release</h2>
            <p>Create a pitch, then return here to release the client-facing package.</p>
            <Link href="/" className="btn btn-primary">Start a new pitch</Link>
          </section>
        ) : null}
        {opportunityId ? (
          <>
            <p className="pitch-breadcrumb">Approvals / {client}</p>
            <h2 className="pitch-greet">Release client-facing material</h2>
            <div className="pitch-meta-row">
              <span className="pitch-status-line">{statusLabel}</span>
              <span className="pitch-subtle">
                {submitted ? `Submitted by ${draft.owner || actor} · ${submitted}` : `Owner ${draft.owner || actor}`}
              </span>
            </div>
            <div className="pitch-package-bar">
              <div>
                <div className="pitch-panel-label">Package</div>
                <strong>Follow-up email · Minutes of Meeting · {title}</strong>
              </div>
              <span className="pitch-subtle">Trace ID {opportunityId.slice(0, 8).toUpperCase()}</span>
            </div>
            <div className="pitch-approval-layout">
              <div>
                <div className="pitch-panel-label">Release checks</div>
                <div className="pitch-check-row">
                  <span>Sales factual review</span>
                  <span>{factualDone ? <><b>Complete</b> · {draft.owner || actor}</> : "Missing · Add the meeting summary"}</span>
                </div>
                <div className="pitch-check-row">
                  <span>Claims and sources</span>
                  <span>{sourcesDone ? <><b>Complete</b> · {transcriptCount} source{transcriptCount === 1 ? "" : "s"} attached</> : "Missing · Add a transcript"}</span>
                </div>
                <div className="pitch-check-row">
                  <span>Commercial content</span>
                  <span>{budgetDiscussed ? "Included · Budget was discussed" : "Not included · No rate-card data used"}</span>
                </div>
                <div className="pitch-check-row">
                  <span>Confidential information</span>
                  <span><b>Clear</b> · No masked content</span>
                </div>
                <div className="pitch-check-row">
                  <span>File formats</span>
                  <span>{filesReady ? <><b>Ready</b> · PPTX master + PDF</> : "Waiting · Create the pitch first"}</span>
                </div>
                <div className="pitch-panel-label">Documents to release</div>
                <div className="pitch-check-row">
                  <div><strong>Follow-up email</strong><div className="pitch-subtle">Short · editable draft</div></div>
                  <Link href={`/followup-review?opportunityId=${encodeURIComponent(opportunityId)}`}>Preview →</Link>
                </div>
                <div className="pitch-check-row">
                  <div><strong>{client} pitch</strong><div className="pitch-subtle">PPTX master · PDF send copy</div></div>
                  <Link href={`/deck-center?opportunityId=${encodeURIComponent(opportunityId)}`}>Preview →</Link>
                </div>
              </div>
              <aside className="pitch-decision">
                <div className="pitch-panel-label">Decision</div>
                <h3>
                  {decision === "released"
                    ? "This package is ready to send manually."
                    : decision === "changes"
                      ? "Changes were requested."
                      : "Everything required for release is available."}
                </h3>
                <p>Releasing does not send anything. It marks the package as ready for the sales owner to send manually.</p>
                <p className="pitch-footnote">
                  {decidedAt ? `${actor} · ${formatStamp(decidedAt)}. ` : ""}
                  Your name and timestamp stay on this decision.
                </p>
                <button type="button" className="btn btn-secondary pitch-block-btn" onClick={() => decide("changes")}>
                  Request changes
                </button>
                <button type="button" className="btn btn-primary pitch-block-btn" onClick={() => decide("released")} disabled={decision === "released"}>
                  Release as ready →
                </button>
                <p className="pitch-footnote">No automatic client sending</p>
              </aside>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
