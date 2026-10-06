"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { usePostMeeting } from "@/components/PostMeetingShell";
import { finalizeWorkflow, markOwnerReviewed } from "@/lib/api";
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
  const identity = version ? `${ppt2?.presentation_id}:${version}:${workflow?.documents.approved_discovery?.version_id}` : null;
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
    <p>PPT #2: {version ?? "No ready version"}</p><p>Discovery: {workflow?.documents.approved_discovery?.version_id ?? "Not approved"}</p>
    <Link href={`/opportunities/${encodeURIComponent(opportunityId)}/post-meeting-presentation`}>Open PPT #2 for review</Link>
    <p><small>Owner review: {reviewed ? "Recorded" : "Required"} · Final documents: {finalized ? "Finalized" : "Not finalized"}</small></p>
    <label className={styles.check}><input type="checkbox" disabled={disabled || !version} checked={Boolean(identity && confirmation === identity)} onChange={(event) => setConfirmation(event.target.checked ? identity : null)} /><span>I reviewed these document versions and approve them for the follow-up package.</span></label>
    <div className={styles.actions}><button className="btn btn-secondary" disabled={disabled || !identity || confirmation !== identity || reviewed} onClick={() => void act(false)}>Record owner review</button><button className="btn btn-primary" disabled={disabled || !identity || confirmation !== identity || !reviewed} onClick={() => void act(true)}>Finalize documents</button></div>
    <p><small>Finalizing documents does not save or export email edits. Atomic revision checks and email approval remain backend dependencies.</small></p>
  </section>;
}
