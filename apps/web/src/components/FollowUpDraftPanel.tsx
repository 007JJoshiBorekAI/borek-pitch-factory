"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { PostMeetingPhaseNav, usePostMeeting } from "@/components/PostMeetingShell";
import { generateEmailDraft } from "@/lib/api";
import { loadPostMeetingWorkflow, postMeetingError } from "@/lib/postMeeting";
import { canPreparePostMeetingEmail, loadPostMeetingEmail, parsePostMeetingEmail, type PostMeetingEmail } from "@/lib/postMeetingEmail";
import { downloadPostMeetingPresentation, loadExistingPostMeetingPresentation, type PostMeetingPresentation } from "@/lib/postMeetingPresentation";
import styles from "./post-meeting.module.css";

export function FollowUpDraftPanel({ opportunityId }: { opportunityId: string }) {
  const { accessToken, previewMode } = useAuth();
  const { workflow, companyName, contactPerson, refreshWorkflow } = usePostMeeting();
  const live = Boolean(accessToken) && !previewMode;
  const [draft, setDraft] = useState<PostMeetingEmail | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [phase, setPhase] = useState<"loading" | "ready" | "failed" | "generating">(live ? "loading" : "ready");
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [document, setDocument] = useState<PostMeetingPresentation | null>(null);
  const [documentPhase, setDocumentPhase] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [documentRetry, setDocumentRetry] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const downloadOperation = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const loaded = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const root = `/opportunities/${encodeURIComponent(opportunityId)}`;
  const eligible = canPreparePostMeetingEmail(workflow);
  const dirty = subject !== (draft?.subject ?? "") || body !== (draft?.body ?? "");
  const busy = phase === "loading" || phase === "generating";
  const presentationId = workflow?.documents.ppt2?.presentation_id;
  const presentationVersionId = workflow?.documents.ppt2?.latest_ready_version_id;
  const currentDocument = live && document?.presentationId === presentationId && document?.presentationVersionId === presentationVersionId ? document : null;

  useEffect(() => {
    const controller = new AbortController();
    downloadOperation.current?.abort(); downloadOperation.current = null;
    setDownloading(false); setDocument(null); setDocumentError(null);
    if (!live || !accessToken || !presentationId || !presentationVersionId) {
      setDocumentPhase("idle");
    } else {
      setDocumentPhase("loading");
      void loadExistingPostMeetingPresentation(accessToken, opportunityId, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        if (result.deck?.presentationId !== presentationId || result.deck.presentationVersionId !== presentationVersionId) {
          throw new Error("The presentation changed. Open Review to load the current version.");
        }
        setDocument(result.deck); setDocumentPhase("ready");
      }).catch((cause) => {
        if (!controller.signal.aborted) { setDocumentError(postMeetingError(cause)); setDocumentPhase("failed"); }
      });
    }
    return () => { controller.abort(); downloadOperation.current?.abort(); };
  }, [accessToken, live, opportunityId, presentationId, presentationVersionId, documentRetry]);

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

  async function downloadDocument() {
    if (!accessToken || !currentDocument?.downloads.pptx || downloadOperation.current) return;
    const controller = new AbortController();
    downloadOperation.current = controller; setDownloading(true); setDocumentError(null);
    try {
      const blob = await downloadPostMeetingPresentation(accessToken, opportunityId, currentDocument, "pptx", controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      try {
        const anchor = window.document.createElement("a");
        anchor.href = url;
        anchor.download = `ppt-2-${opportunityId}.pptx`;
        anchor.click();
      } finally { URL.revokeObjectURL(url); }
    } catch (cause) { if (!controller.signal.aborted) setDocumentError(postMeetingError(cause)); }
    finally {
      if (downloadOperation.current === controller) downloadOperation.current = null;
      if (!controller.signal.aborted) setDownloading(false);
    }
  }

  return <section aria-labelledby="follow-up-title">
    <header className={styles.heading}><span className={styles.eyebrow}>Post-meeting</span><h1 id="follow-up-title">Review follow-up package</h1><p>{companyName} · Documents and email for your next conversation</p></header>
    <PostMeetingPhaseNav opportunityId={opportunityId} active="review" />
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {busy ? <p className={styles.notice} role="status">{phase === "loading" ? "Loading saved email draft..." : "Preparing the email draft..."}</p> : null}
    <div className={`${styles.columns} ${styles.followUpColumns}`}>
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
        {!eligible ? <small><Link href={`${root}/review`}>Review and finalize the current documents</Link> before preparing the email.</small> : <small>The current email service uses meeting transcript context. Unified finalized-context generation remains an integration dependency.</small>}
      </article>
      <aside className={`${styles.card} ${styles.packageSidebar}`} aria-label="Follow-up package">
        <header>
          <h3 className={styles.packageLabel}>Updated client documents</h3>
          <div className={styles.packageDocument}>
            <strong>{currentDocument?.name || "Updated presentation"}</strong>
            <small>{currentDocument ? `${currentDocument.slides.length} slides · PPT #2 · Version ${currentDocument.versionNumber}` : documentPhase === "loading" ? "Loading presentation..." : documentPhase === "failed" ? "Presentation unavailable" : "No presentation generated yet"}</small>
            <div className={styles.packageDocumentActions}>
              <Link className="btn btn-secondary" href={`${root}/post-meeting-presentation`}>Review</Link>
              <button className="btn btn-primary" type="button" disabled={!currentDocument?.downloads.pptx || downloading} onClick={() => void downloadDocument()}>{downloading ? "Downloading..." : "Download"}</button>
            </div>
            {documentError ? <p className={styles.packageError} role="alert">{documentError}</p> : null}
            {documentError ? <button className="btn btn-secondary" type="button" disabled={downloading} onClick={() => { setDocumentRetry((value) => value + 1); refreshWorkflow(); }}>Retry document</button> : null}
          </div>
        </header>
        <section className={styles.packageChanges}>
          <h3 className={styles.packageLabel}>What changed</h3>
          <p>{currentDocument ? "Review the updated presentation for changes from the first meeting." : "Meeting updates will be available after the presentation is generated."}</p>
        </section>
        <section className={styles.packageAttachments}>
          <h3 className={styles.packageLabel}>Email attachments</h3>
          <ul aria-label="Approved email attachments"><li>No approved attachments available yet.</li></ul>
        </section>
        <footer className={styles.packageExport}>
          <span className={styles.packageLabel}>Email export</span>
          <h2>Not ready to export</h2>
          <p>Review the email and approved attachments before exporting your draft.</p>
          <button className="btn btn-primary" disabled aria-describedby="email-export-blocked">Export email draft</button>
          <small id="email-export-blocked">Export is unavailable until draft saving and approved attachments are connected.</small>
        </footer>
      </aside>
    </div>
  </section>;
}
