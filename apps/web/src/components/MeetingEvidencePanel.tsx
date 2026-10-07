"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { PostMeetingPhaseNav, usePostMeeting } from "@/components/PostMeetingShell";
import { apiFetch, uploadTranscript } from "@/lib/api";
import { generateAndAwaitPostMeetingPresentation } from "@/lib/ppt2Generation";
import { extractionIsCurrent, loadMeetingInputs, MeetingNotesConflict, postMeetingError, postMeetingPath, prepareMeetingEvidence, validateTranscript, workflowCompleted, type MeetingInputs, type PersonalNotes } from "@/lib/postMeeting";
import styles from "./post-meeting.module.css";

export function MeetingEvidencePanel({ opportunityId }: { opportunityId: string }) {
  const { accessToken, previewMode } = useAuth();
  const { workflow, refreshWorkflow, companyName } = usePostMeeting();
  const router = useRouter();
  const live = Boolean(accessToken) && !previewMode;
  const [inputs, setInputs] = useState<MeetingInputs | null>(null);
  const [notes, setNotes] = useState("");
  const [transcriptId, setTranscriptId] = useState("");
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [conflictingNotes, setConflictingNotes] = useState<PersonalNotes | null>(null);
  const loaded = useRef(false);
  const operation = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const notesInput = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => () => operation.current?.abort(), []);

  useEffect(() => {
    if (!live || !accessToken || loaded.current) return;
    const controller = new AbortController();
    setError(null);
    void loadMeetingInputs(accessToken, opportunityId, controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      loaded.current = true;
      setInputs(data); setNotes(data.notes.text ?? "");
      const latest = [...data.transcripts].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      setTranscriptId(latest?.id ?? "");
    }).catch((cause) => { if (!controller.signal.aborted) setError(postMeetingError(cause)); });
    return () => controller.abort();
  }, [accessToken, live, opportunityId, reload]);

  const meetingComplete = workflowCompleted(workflow, "first_meeting_completed");
  const finalized = Boolean(workflow?.finalization);
  const editingDisabled = Boolean(busy) || finalized || (!previewMode && (!live || !inputs || !workflow || !meetingComplete));
  const transcript = inputs?.transcripts.find((item) => item.id === transcriptId);
  const hasTranscript = previewMode ? Boolean(previewFile) : Boolean(transcript);
  const processed = Boolean(inputs && extractionIsCurrent(inputs.extraction, transcriptId, inputs.notes) && notes.trim() === (inputs.notes.text ?? ""));
  const generationReady = live && !editingDisabled && hasTranscript && Boolean(workflow?.documents.approved_discovery) && !conflictingNotes;
  const root = `/opportunities/${encodeURIComponent(opportunityId)}`;

  async function run(label: string, action: (token: string, signal: AbortSignal) => Promise<void>) {
    if (!accessToken || !live || operation.current) return;
    const controller = new AbortController();
    operation.current = controller; setBusy(label); setError(null);
    try { await action(accessToken, controller.signal); }
    catch (cause) {
      if (!controller.signal.aborted) {
        if (cause instanceof MeetingNotesConflict) setConflictingNotes(cause.savedNotes);
        setError(postMeetingError(cause));
      }
    } finally {
      if (operation.current === controller) operation.current = null;
      if (!controller.signal.aborted) { setBusy(""); refreshWorkflow(); }
    }
  }

  async function onTranscript(file: File) {
    if (editingDisabled) return;
    const invalid = validateTranscript(file);
    if (invalid) { setError(invalid); return; }
    if (previewMode) { setPreviewFile(file); setError(null); return; }
    await run("Uploading transcript", async (token, signal) => {
      const response = await uploadTranscript(token, opportunityId, file);
      signal.throwIfAborted();
      const transcripts = await apiFetch<MeetingInputs["transcripts"]>(postMeetingPath(opportunityId, "transcripts"), token, { signal, cache: "no-store" });
      signal.throwIfAborted();
      setInputs((value) => value ? { ...value, transcripts } : value); setTranscriptId(response.transcript.id);
    });
  }

  async function generateDocuments() {
    if (!inputs || !generationReady) return;
    await run("Preparing documents", async (token, signal) => {
      const prepared = await prepareMeetingEvidence(token, opportunityId, transcriptId, notes, inputs.notes, {
        signal, onProgress: setBusy,
        onInputs: (value) => { setInputs(value); setNotes(value.notes.text ?? ""); },
      });
      signal.throwIfAborted();
      setBusy("Generating documents");
      await generateAndAwaitPostMeetingPresentation(token, opportunityId, () => signal.throwIfAborted(), {
        regeneratePresentationId: prepared.workflow.documents.ppt2?.presentation_id,
      });
      if (!signal.aborted) router.push(`${root}/follow-up`);
    });
  }

  return <section aria-labelledby="meeting-title">
    <header className={styles.heading}><span className={styles.eyebrow}>Post-meeting</span><h1 id="meeting-title">Turn the meeting into the next pitch</h1><p>{companyName} · First meeting</p></header>
    <PostMeetingPhaseNav opportunityId={opportunityId} active="meeting" />
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {busy ? <p className={styles.notice} role="status">{busy}...</p> : null}
    {live && !inputs ? <div className={styles.notice}>{error ? <button className="btn btn-secondary" onClick={() => setReload((value) => value + 1)}>Retry loading</button> : <span role="status">Loading meeting inputs...</span>}</div> : null}
    {finalized ? <p className={styles.notice}>This package is finalized. Meeting inputs are read-only.</p> : null}
    <div className={`${styles.columns} ${styles.meetingColumns}`}>
      <article className={`${styles.card} ${styles.meetingCard}`}>
        <span className={styles.eyebrow}>Meeting input</span><h2>What happened in the meeting?</h2>
        <p className={styles.meetingIntro}>Upload the client meeting transcript. Add any extra context in the optional notes below.</p>
        <div className={styles.actions}>
          <button className="btn btn-secondary" disabled={editingDisabled} onClick={() => fileInput.current?.click()}>{hasTranscript ? "Replace transcript" : "Upload transcript"}</button>
          <button className="btn btn-secondary" disabled={editingDisabled} onClick={() => notesInput.current?.focus()}>Type notes</button>
          <input ref={fileInput} type="file" hidden accept=".txt,.vtt,.srt,.docx" aria-label="Meeting transcript" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void onTranscript(file); }} />
        </div>
        <div className={styles.transcriptCard} role="status">
          <span className={styles.transcriptIcon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M7 3h7l4 4v14H7V3Z" stroke="currentColor" strokeWidth="1.4" /><path d="M10 11h5m-5 4h5" stroke="currentColor" strokeWidth="1.4" /></svg></span>
          <div><strong>{previewMode ? previewFile?.name ?? "No transcript added" : transcript?.file_name ?? "No transcript added"}</strong><small>{previewMode && previewFile ? "Selected locally; not uploaded" : transcript ? processed ? "Transcript processed" : "Transcript uploaded" : "TXT, VTT, SRT or DOCX"}</small></div>
          {hasTranscript ? <span className={styles.transcriptBadge}>{previewMode ? "Preview" : processed ? "Ready" : "Uploaded"}</span> : null}
        </div>
        <label className={styles.notesField} htmlFor="personal-notes">Additional notes <span>(optional)</span>
          <textarea ref={notesInput} id="personal-notes" value={notes} maxLength={20000} disabled={editingDisabled} placeholder="Anything else you would like to add from the meeting?" onChange={(event) => setNotes(event.target.value)} />
        </label>
        <small>Leave blank if the transcript covers everything.</small>
        {conflictingNotes ? <div className={styles.source}><strong>Notes saved in another session</strong><p>{conflictingNotes.text || "No notes"}</p><div className={styles.actions}><button className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => { setInputs((value) => value ? { ...value, notes: conflictingNotes } : value); setNotes(conflictingNotes.text ?? ""); setConflictingNotes(null); setError(null); }}>Use saved notes</button><button className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => { setInputs((value) => value ? { ...value, notes: conflictingNotes } : value); setConflictingNotes(null); setError(null); }}>Keep my notes</button></div></div> : null}
      </article>
      <aside className={`${styles.summary} ${styles.meetingSummary}`} aria-labelledby="readiness-title">
        <span className={styles.eyebrow}>{companyName}</span><h2 id="readiness-title">{finalized ? "Documents finalized" : generationReady || (previewMode && hasTranscript) ? "Ready to generate" : hasTranscript ? "Meeting summary" : "Add your transcript"}</h2><small>First meeting</small>
        <ul><li><span>Meeting transcript</span><strong>{hasTranscript ? previewMode ? "Selected" : "Added" : "Required"}</strong></li><li><span>Additional notes</span><strong>{notes.trim() ? "Added" : "Optional"}</strong></li></ul>
        <button className="btn btn-primary" disabled={!generationReady} onClick={() => void generateDocuments()}>{busy ? "Preparing documents..." : "Generate documents"}</button>
        {previewMode ? <p><small>Layout preview only. Document generation requires a live session.</small></p> : !finalized && workflow && !workflow.documents.approved_discovery ? <p><small>An approved Discovery document is required before generation.</small></p> : null}
        {workflow?.documents.ppt2?.latest_ready_version_id ? <div className={styles.actions}><Link href={`${root}/post-meeting-presentation`}>View existing presentation</Link></div> : null}
      </aside>
    </div>
  </section>;
}
