"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { usePostMeeting } from "@/components/PostMeetingShell";
import { apiFetch, finalizeWorkflow, markOwnerReviewed } from "@/lib/api";
import { postMeetingDeckLabel } from "@/lib/masterPresentationV2";
import { loadPostMeetingWorkflow, postMeetingError, workflowCompleted } from "@/lib/postMeeting";
import styles from "./post-meeting.module.css";

export function OwnerCheckpointPanel({ opportunityId, compact = false }: { opportunityId: string; compact?: boolean }) {
  const { accessToken, previewMode } = useAuth();
  const { workflow, refreshWorkflow } = usePostMeeting();
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const ppt2 = workflow?.documents.ppt2;
  const version = ppt2?.latest_ready_version_id;
  const product = postMeetingDeckLabel(ppt2?.product_version);
  const identity = version ? `${ppt2?.presentation_id}:${version}:${workflow?.documents.approved_discovery?.version_id}` : null;
  // The revision number of the ready version, for display. The ids stay what every request uses.
  const [revision, setRevision] = useState<{ version: string; number: number } | null>(null);
  const presentationId = ppt2?.presentation_id;
  useEffect(() => {
    if (!accessToken || previewMode || !presentationId || !version) return;
    const controller = new AbortController();
    void apiFetch<Array<{ presentation_version_id: string; version_number: number }>>(`/presentations/${encodeURIComponent(presentationId)}/versions`, accessToken, { signal: controller.signal, cache: "no-store" })
      .then((rows) => {
        const row = rows.find((item) => item.presentation_version_id === version);
        if (!controller.signal.aborted && row) setRevision({ version, number: row.version_number });
      })
      .catch(() => { /* the label falls back to "ready version" */ });
    return () => controller.abort();
  }, [accessToken, previewMode, presentationId, version]);
  const discovery = workflow?.documents.approved_discovery;
  const deckLabel = !version ? "no ready version" : revision?.version === version ? `revision ${revision.number}, ready` : "ready version";
  const reviewed = workflowCompleted(workflow, "owner_review");
  const finalized = workflowCompleted(workflow, "finalized") && Boolean(workflow?.finalization);
  const disabled = busy || !accessToken || previewMode || !workflow || finalized;

  async function act(finalize: boolean) {
    if (!accessToken || disabled || lock.current || !identity || confirmation !== identity) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      const latest = await loadPostMeetingWorkflow(accessToken, opportunityId);
      if (!alive.current) return;
      const current = latest.documents.ppt2;
      if (`${current?.presentation_id}:${current?.latest_ready_version_id}:${latest.documents.approved_discovery?.version_id}` !== identity) {
        throw new Error("The document versions changed. Reload and review the current package.");
      }
      if (finalize) await finalizeWorkflow(accessToken, opportunityId);
      else await markOwnerReviewed(accessToken, opportunityId);
    } catch (cause) { if (alive.current) setError(postMeetingError(cause)); }
    finally { lock.current = false; if (alive.current) { setBusy(false); setConfirmation(null); refreshWorkflow(); } }
  }

  return <section className={styles.card} aria-label="Owner checkpoints">
    <span className={styles.eyebrow}>Owner checkpoint</span>{compact ? <h2>Review &amp; finalize</h2> : <h1>Review the final documents</h1>}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {busy ? <p role="status">Saving checkpoint...</p> : null}
    <p data-testid="checkpoint-presentation" title={version ? `Version id ${version}` : undefined}><strong>{product}</strong> · {deckLabel}</p>
    <p data-testid="checkpoint-discovery" title={discovery ? `Version id ${discovery.version_id}` : undefined}><strong>Discovery analysis</strong> · {discovery ? `approved version ${discovery.version_number}` : "not approved"}</p>
    {compact ? null : <Link href={`/opportunities/${encodeURIComponent(opportunityId)}/post-meeting-presentation`}>Open {product} for review</Link>}
    {ppt2?.product_version === "V2" ? <p><small>This is the owner review of the presentation itself. It is separate from confirming the meeting findings, and it applies to exactly this version: a newer version has to be reviewed again.</small></p> : null}
    <p><small>Owner review: {reviewed ? "Recorded" : "Required"} · Final documents: {finalized ? "Finalized" : "Not finalized"}</small></p>
    <label className={styles.check}><input type="checkbox" disabled={disabled || !version} checked={Boolean(identity && confirmation === identity)} onChange={(event) => setConfirmation(event.target.checked ? identity : null)} /><span>I reviewed these document versions and approve them for the follow-up package.</span></label>
    <div className={styles.actions}><button className="btn btn-secondary" disabled={disabled || !identity || confirmation !== identity || reviewed} onClick={() => void act(false)}>Record owner review</button><button className="btn btn-primary" disabled={disabled || !identity || confirmation !== identity || !reviewed} onClick={() => void act(true)}>Finalize documents</button></div>
    {finalized
      ? <div className={styles.nextStep} data-testid="finalized-next-step" role="status">
        <div><strong>The documents are finalized.</strong><p>Next: prepare the follow-up email from this reviewed package. Nothing is sent automatically.</p></div>
        <Link className="btn btn-primary" data-testid="continue-to-follow-up" href={`/opportunities/${encodeURIComponent(opportunityId)}/follow-up`}>Continue to the follow-up email</Link>
      </div>
      : <p><small>After finalizing you continue to the follow-up email. The email is reviewed and confirmed separately; finalizing sends nothing.</small></p>}
  </section>;
}
