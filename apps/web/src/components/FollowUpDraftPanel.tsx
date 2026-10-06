"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { PostMeetingPhaseNav, usePostMeeting } from "@/components/PostMeetingShell";
import { OwnerCheckpointPanel } from "@/components/OwnerCheckpointPanel";
import { generateEmailDraft } from "@/lib/api";
import { loadPostMeetingWorkflow, postMeetingError } from "@/lib/postMeeting";
import { canPreparePostMeetingEmail, loadPostMeetingEmail, parsePostMeetingEmail, type PostMeetingEmail } from "@/lib/postMeetingEmail";
import styles from "./post-meeting.module.css";

export function FollowUpDraftPanel({ opportunityId }: { opportunityId: string }) {
  const { accessToken, previewMode } = useAuth();
  const { workflow, companyName, contactPerson } = usePostMeeting();
  const live = Boolean(accessToken) && !previewMode;
  const [draft, setDraft] = useState<PostMeetingEmail | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [phase, setPhase] = useState<"loading" | "ready" | "failed" | "generating">(live ? "loading" : "ready");
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const lock = useRef(false);
  const loaded = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const root = `/opportunities/${encodeURIComponent(opportunityId)}`;
  const eligible = canPreparePostMeetingEmail(workflow);
  const dirty = subject !== (draft?.subject ?? "") || body !== (draft?.body ?? "");
  const busy = phase === "loading" || phase === "generating";

  useEffect(() => {
    if (!accessToken || !live || loaded.current) return;
    const controller = new AbortController();
    setPhase("loading"); setError(null);
    void loadPostMeetingEmail(accessToken, opportunityId, controller.signal).then((value) => {
      if (controller.signal.aborted) return;
      loaded.current = true;
      setDraft(value); setSubject(value?.subject ?? ""); setBody(value?.body ?? ""); setPhase("ready");
    }).catch((cause) => { if (!controller.signal.aborted) { setError(postMeetingError(cause)); setPhase("failed"); } });
    return () => controller.abort();
  }, [accessToken, live, opportunityId, reload]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function createDraft() {
    if (!accessToken || !live || !eligible || !loaded.current || lock.current || dirty) return;
    lock.current = true; setPhase("generating"); setError(null);
    try {
      const latest = await loadPostMeetingWorkflow(accessToken, opportunityId);
      if (!alive.current) return;
      if (!canPreparePostMeetingEmail(latest)) throw new Error("The documents are no longer finalized. Return to owner review before preparing an email.");
      const next = parsePostMeetingEmail(await generateEmailDraft(accessToken, opportunityId, "deepening"), opportunityId);
      if (!next) throw new Error("No email draft was returned. Retry preparation.");
      if (alive.current) { setDraft(next); setSubject(next.subject); setBody(next.body); setPhase("ready"); }
    } catch (cause) { if (alive.current) { setError(postMeetingError(cause)); setPhase("failed"); } }
    finally { lock.current = false; }
  }

  return <section aria-labelledby="follow-up-title">
    <header className={styles.heading}><span className={styles.eyebrow}>Post-meeting</span><h1 id="follow-up-title">Review follow-up package</h1><p>{companyName} · Documents and email for your next conversation</p></header>
    <PostMeetingPhaseNav opportunityId={opportunityId} active="review" />
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {busy ? <p className={styles.notice} role="status">{phase === "loading" ? "Loading saved email draft..." : "Preparing the email draft..."}</p> : null}
    <div className={styles.columns}>
      <article className={`${styles.card} ${styles.email}`}>
        <div><span className={styles.eyebrow}>Follow-up email</span><h2>Review and edit your message</h2><small>To: {contactPerson || "No contact person recorded"}{companyName ? ` · ${companyName}` : ""}</small></div>
        <label htmlFor="follow-up-subject">Subject<input id="follow-up-subject" value={subject} disabled={busy || (live && !draft)} placeholder="Your follow-up subject" onChange={(event) => setSubject(event.target.value)} /></label>
        <label htmlFor="follow-up-body">Message<textarea id="follow-up-body" value={body} disabled={busy || (live && !draft)} placeholder="Prepare a draft after reviewing and finalizing the documents." onChange={(event) => setBody(event.target.value)} /></label>
        <p className={styles.notice} role="status">{dirty ? "Unsaved local edits. " : draft ? "Saved generated draft loaded. " : "No draft prepared yet. "}Email text saving and approved-attachment export are awaiting the backend contract. Edits on this page are not persisted and will be lost if you navigate away.</p>
        {draft ? <small>Draft {draft.id} · Updated {draft.updatedAt}</small> : null}
        <div className={styles.actions}>
          <button className="btn btn-primary" disabled={!live || !eligible || !loaded.current || busy || dirty} onClick={() => void createDraft()}>{draft ? "Regenerate email draft" : "Prepare email draft"}</button>
          {phase === "failed" ? <button className="btn btn-secondary" disabled={dirty || !live} onClick={() => { loaded.current = false; setReload((value) => value + 1); }}>Retry loading draft</button> : null}
          {dirty ? <button className="btn btn-secondary" onClick={() => { setSubject(draft?.subject ?? ""); setBody(draft?.body ?? ""); }}>Discard local edits</button> : null}
        </div>
        {!eligible ? <small>Review and finalize the current documents before preparing the email.</small> : <small>The current email service uses meeting transcript context. Unified finalized-context generation remains an integration dependency.</small>}
      </article>
      <aside className={styles.stack}>
        <article className={styles.card}>
          <span className={styles.eyebrow}>Updated client documents</span><h2>Post-meeting presentation</h2>
          <div className={styles.source}><strong>PPT #2</strong><small>{workflow?.documents.ppt2?.latest_ready_version_id ? `Version ${workflow.documents.ppt2.latest_ready_version_id}` : "No ready version reported"}</small><div className={styles.actions}><Link className="btn btn-secondary" href={`${root}/post-meeting-presentation`}>Review / download</Link></div></div>
          <h3>What changed</h3><p>The second presentation uses approved Discovery and meeting evidence. Review the generated slides to verify the changes; no change summary has been supplied.</p>
          <h3>Email attachments</h3><p><small>Only approved, current versions can be attached. The API has not supplied an approved attachment manifest; no files are selected for export.</small></p>
          {(["Discovery PDF", "PPT #1", "PPT #2"] as const).map((label) => <label className={styles.check} key={label}><input type="checkbox" disabled checked={false} readOnly /><span>{label}<small>Awaiting approved attachment eligibility</small></span></label>)}
          <h3>Export package</h3><p>The application exports a reviewed draft. It never sends email.</p><button className="btn btn-primary" disabled aria-describedby="email-export-blocked">Export reviewed draft</button><p id="email-export-blocked"><small>Blocked until the email save, approved-attachment and export contracts are available.</small></p>
        </article>
        <OwnerCheckpointPanel opportunityId={opportunityId} compact />
      </aside>
    </div>
  </section>;
}
