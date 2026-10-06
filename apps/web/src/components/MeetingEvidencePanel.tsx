"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { PostMeetingPhaseNav, usePostMeeting } from "@/components/PostMeetingShell";
import { apiFetch, generateMeetingExtraction, savePersonalNotes, saveSelectedUseCases, uploadTranscript } from "@/lib/api";
import { generateAndAwaitPostMeetingPresentation } from "@/lib/ppt2Generation";
import { EXTRACTION_FIELDS, extractionIsCurrent, loadMeetingInputs, loadPostMeetingWorkflow, meetingEvidenceKey, parseMeetingExtraction, postMeetingError, postMeetingPath, validateTranscript, workflowCompleted, type MeetingInputs, type PersonalNotes, type SavedUseCases } from "@/lib/postMeeting";
import styles from "./post-meeting.module.css";

export function MeetingEvidencePanel({ opportunityId }: { opportunityId: string }) {
  const { accessToken, previewMode } = useAuth();
  const { workflow, refreshWorkflow, companyName } = usePostMeeting();
  const router = useRouter();
  const live = Boolean(accessToken) && !previewMode;
  const [inputs, setInputs] = useState<MeetingInputs | null>(null);
  const [notes, setNotes] = useState("");
  const [transcriptId, setTranscriptId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [conflictingNotes, setConflictingNotes] = useState<PersonalNotes | null>(null);
  const loaded = useRef(false);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    if (!live || !accessToken || loaded.current) return;
    const controller = new AbortController();
    setError(null);
    void loadMeetingInputs(accessToken, opportunityId, controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      loaded.current = true;
      setInputs(data); setNotes(data.notes.text ?? ""); setSelectedIds(data.selected.use_case_ids);
      setTranscriptId(data.extraction?.transcript_id ?? data.transcripts[0]?.id ?? "");
      setConfirmed(false);
    }).catch((cause) => { if (!controller.signal.aborted) setError(postMeetingError(cause)); });
    return () => controller.abort();
  }, [accessToken, live, opportunityId, reload]);

  const meetingComplete = workflowCompleted(workflow, "first_meeting_completed");
  const finalized = Boolean(workflow?.finalization);
  const disabled = Boolean(busy) || !live || !inputs || !workflow || finalized;
  const notesDirty = notes !== (inputs?.notes.text ?? "");
  const selectionDirty = JSON.stringify(selectedIds) !== JSON.stringify(inputs?.selected.use_case_ids ?? []);
  const currentExtraction = Boolean(inputs && extractionIsCurrent(inputs.extraction, transcriptId, inputs.notes) && !notesDirty);
  const unresolved = inputs?.selected.use_cases.some((item) => item.status === "unresolved") ?? false;
  const generationReady = meetingComplete && currentExtraction && !selectionDirty && confirmed && !unresolved && Boolean(workflow?.documents.approved_discovery);
  const root = `/opportunities/${encodeURIComponent(opportunityId)}`;

  async function run(label: string, action: (token: string) => Promise<void>) {
    if (!accessToken || !live || lock.current) return;
    lock.current = true; setBusy(label); setError(null); setNotice(null);
    try { await action(accessToken); }
    catch (cause) { if (alive.current) setError(postMeetingError(cause)); }
    finally { lock.current = false; if (alive.current) { setBusy(""); refreshWorkflow(); } }
  }

  async function onTranscript(file: File) {
    if (disabled || !meetingComplete) return;
    const invalid = validateTranscript(file);
    if (invalid) { setError(invalid); return; }
    await run("Uploading transcript", async (token) => {
      const response = await uploadTranscript(token, opportunityId, file);
      if (!alive.current) return;
      const transcripts = await apiFetch<MeetingInputs["transcripts"]>(postMeetingPath(opportunityId, "transcripts"), token, { cache: "no-store" });
      if (!alive.current) return;
      setInputs((value) => value ? { ...value, transcripts } : value);
      setTranscriptId(response.transcript.id); setConfirmed(false);
      setNotice("Transcript uploaded. Run extraction to process this source.");
    });
  }

  async function onNotes() {
    if (disabled || !meetingComplete || !notesDirty || conflictingNotes) return;
    await run("Saving personal notes", async (token) => {
      const current = await apiFetch<PersonalNotes>(postMeetingPath(opportunityId, "personal-notes"), token, { cache: "no-store" });
      if (!alive.current) return;
      if (current.updated_at !== inputs?.notes.updated_at) {
        if (alive.current) setConflictingNotes(current);
        throw new Error("Personal notes changed in another session. Your text is retained; compare it with the saved notes below.");
      }
      await savePersonalNotes(token, opportunityId, notes);
      const saved = await apiFetch<PersonalNotes>(postMeetingPath(opportunityId, "personal-notes"), token, { cache: "no-store" });
      if (!alive.current) return;
      setInputs((value) => value ? { ...value, notes: saved } : value); setNotes(saved.text ?? ""); setConfirmed(false); setConflictingNotes(null);
      setNotice("Personal notes saved separately. Refresh extraction before generating documents.");
    });
  }

  async function generateDocuments() {
    if (!inputs || !generationReady || disabled) return;
    await run("Generating PPT #2", async (token) => {
      const [latest, currentWorkflow] = await Promise.all([loadMeetingInputs(token, opportunityId), loadPostMeetingWorkflow(token, opportunityId)]);
      if (!alive.current) return;
      if (meetingEvidenceKey(latest) !== meetingEvidenceKey(inputs) ||
          currentWorkflow.documents.approved_discovery?.version_id !== workflow?.documents.approved_discovery?.version_id) {
        setInputs(latest); setNotes(latest.notes.text ?? ""); setSelectedIds(latest.selected.use_case_ids);
        setTranscriptId(latest.extraction?.transcript_id ?? ""); setConfirmed(false);
        throw new Error("The meeting evidence or approved Discovery changed. Current evidence has been loaded; review it and confirm again.");
      }
      if (!workflowCompleted(currentWorkflow, "first_meeting_completed") || currentWorkflow.finalization) throw new Error("The workflow is no longer eligible for meeting generation. Reload the status before continuing.");
      await generateAndAwaitPostMeetingPresentation(token, opportunityId, undefined, {
        regeneratePresentationId: currentWorkflow.documents.ppt2?.presentation_id,
      });
      if (alive.current) router.push(`${root}/post-meeting-presentation`);
    });
  }

  return <section aria-labelledby="meeting-title">
    <header className={styles.heading}><span className={styles.eyebrow}>Post-meeting</span><h1 id="meeting-title">Turn the meeting into the next pitch</h1><p>{companyName} · First meeting</p></header>
    <PostMeetingPhaseNav opportunityId={opportunityId} active="meeting" />
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {notice || busy ? <p className={styles.notice} role="status">{busy ? `${busy}...` : notice}</p> : null}
    {live && !inputs ? <div className={styles.notice}>{error ? <button className="btn btn-secondary" onClick={() => setReload((value) => value + 1)}>Retry meeting inputs</button> : <span role="status">Loading saved meeting inputs...</span>}</div> : null}
    {finalized ? <p className={styles.notice}>This package is finalized. Meeting inputs are read-only.</p> : null}
    <div className={styles.columns}>
      <div className={styles.stack}>
        <article className={styles.card}>
          <span className={styles.eyebrow}>Meeting input</span><h2>What happened in the meeting?</h2>
          <p>Keep the transcript and your personal observations separate. Attachment choices are reviewed with the follow-up package.</p>
          <p><small>{meetingComplete ? "First meeting completed. Add your meeting evidence below." : "Refreshing the first-meeting checkpoint..."}</small></p>
          <div className={styles.actions}><a className="btn btn-secondary" href="#personal-notes">Type notes</a></div>
          <label>Upload transcript<input type="file" accept=".txt,.vtt,.srt,.docx" disabled={disabled || !meetingComplete} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void onTranscript(file); }} /></label>
          <small>Text transcripts only: TXT, VTT, SRT, or DOCX. No audio recording.</small>
          {inputs?.transcripts.length ? <div className={styles.source}><label>Transcript source<select value={transcriptId} disabled={Boolean(busy) || finalized} onChange={(event) => { setTranscriptId(event.target.value); setConfirmed(false); }}>{inputs.transcripts.map((item) => <option key={item.id} value={item.id}>{item.file_name}</option>)}</select></label><small>{currentExtraction ? "Extraction ready for this source" : "Uploaded; extraction required"}</small></div> : <p className={styles.source}>No transcript added yet.</p>}
          <form onSubmit={(event) => { event.preventDefault(); void onNotes(); }}>
            <label htmlFor="personal-notes">Personal meeting notes<textarea id="personal-notes" value={notes} maxLength={20000} disabled={Boolean(busy) || finalized || (live && (!inputs || !meetingComplete))} placeholder="What changed? Capture your observations, priorities and agreed next steps." onChange={(event) => { setNotes(event.target.value); setConfirmed(false); }} /></label>
            <small>{notesDirty ? "Unsaved changes" : inputs?.notes.updated_at ? "Saved notes loaded" : "No saved notes"} · {notes.length}/20,000 characters</small>
            <div className={styles.actions}><button className="btn btn-secondary" type="submit" disabled={disabled || !meetingComplete || !notesDirty || Boolean(conflictingNotes)}>Save personal notes</button></div>
          </form>
          {conflictingNotes ? <div className={styles.source}><strong>Saved notes from the other session</strong><p>{conflictingNotes.text || "No notes"}</p><div className={styles.actions}><button className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => { setInputs((value) => value ? { ...value, notes: conflictingNotes } : value); setNotes(conflictingNotes.text ?? ""); setConflictingNotes(null); setConfirmed(false); setError(null); }}>Use saved notes</button><button className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => { setInputs((value) => value ? { ...value, notes: conflictingNotes } : value); setConflictingNotes(null); setConfirmed(false); setError(null); }}>Keep my text for the next save</button></div></div> : null}
        </article>
        <article className={styles.card}>
          <span className={styles.eyebrow}>Meeting insights</span><h2>Review the extraction</h2>
          <p>{currentExtraction ? "Ready for review. These insights came from the selected transcript and saved notes." : inputs?.extraction ? "The source or notes changed. Refresh extraction before generating PPT #2." : "Extract requirements, decisions and follow-ups from your saved meeting evidence."}</p>
          <button className="btn btn-secondary" disabled={disabled || !meetingComplete || !transcriptId || notesDirty} onClick={() => void run("Processing meeting extraction", async (token) => {
            const extraction = parseMeetingExtraction(await generateMeetingExtraction(token, opportunityId, transcriptId));
            if (!extraction) throw new Error("Extraction has not completed. Retry before generating documents.");
            if (!alive.current) return;
            setInputs((value) => value ? { ...value, extraction } : value); setConfirmed(false); setNotice("Meeting extraction returned. Review each category below.");
          })}>{inputs?.extraction ? "Refresh extraction" : "Extract meeting insights"}</button>
          {notesDirty ? <p><small>Save personal notes first. Extraction only uses saved sources.</small></p> : null}
          <div className={styles.extraction}>{EXTRACTION_FIELDS.map(([key, label]) => <section key={key}><h3>{label}</h3>{inputs?.extraction?.[key].length ? <ul>{inputs.extraction[key].map((text, index) => <li key={index}>{text}</li>)}</ul> : <small>{inputs?.extraction ? "None reported" : "Awaiting extraction"}</small>}</section>)}</div>
        </article>
        <article className={styles.card}>
          <span className={styles.eyebrow}>Existing use cases</span><h2>Select supporting examples</h2>
          <p>Select existing content without rewriting it. Selections are saved in the order you choose them.</p>
          {inputs?.available.length ? inputs.available.map((item) => <label className={styles.check} key={item.fact_id}><input type="checkbox" disabled={disabled || !meetingComplete} checked={selectedIds.includes(item.fact_id)} onChange={(event) => { setSelectedIds((ids) => event.target.checked ? [...ids, item.fact_id] : ids.filter((id) => id !== item.fact_id)); setConfirmed(false); }} /><span><strong>{item.title ?? item.fact_id}</strong><small>{item.statement ?? "No summary supplied"}</small><small>{item.service_key ?? "Unclassified"} · Source version {item.document_version}</small></span></label>) : <p className={styles.source}>No attachable use cases are available.</p>}
          {unresolved ? <p className={styles.error}>Some saved selections are no longer available. Remove them and save the updated selection.</p> : null}
          <ol>{selectedIds.map((id) => <li key={id}>{inputs?.available.find((item) => item.fact_id === id)?.title ?? id} <button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => { setSelectedIds((ids) => ids.filter((value) => value !== id)); setConfirmed(false); }}>Remove</button></li>)}</ol>
          <button className="btn btn-secondary" disabled={disabled || !meetingComplete || !selectionDirty} onClick={() => void run("Saving use-case selection", async (token) => {
            const current = await apiFetch<SavedUseCases>(postMeetingPath(opportunityId, "selected-use-cases"), token, { cache: "no-store" });
            if (!alive.current) return;
            if (JSON.stringify(current) !== JSON.stringify(inputs?.selected)) {
              if (alive.current) { setInputs((value) => value ? { ...value, selected: current } : value); setConfirmed(false); }
              throw new Error("Saved use cases changed in another session. Your selection is retained. Review the current saved content below before saving again.");
            }
            const selected = await saveSelectedUseCases(token, opportunityId, selectedIds) as unknown as SavedUseCases;
            if (!Array.isArray(selected.use_case_ids) || !Array.isArray(selected.use_cases)) throw new Error("The saved selection could not be verified. Reload before generating.");
            if (!alive.current) return;
            setInputs((value) => value ? { ...value, selected } : value); setSelectedIds(selected.use_case_ids); setConfirmed(false); setNotice("Use-case selection saved.");
          })}>Save selection</button>
          {inputs?.selected.use_cases.filter((item) => item.payload).map((item) => <details className={styles.source} key={item.fact_id}><summary>Saved source content: {item.fact_id} · Version {item.document_version}</summary><pre className={styles.payload}>{JSON.stringify(item.payload, null, 2)}</pre></details>)}
          <p><small>The current API stores fact IDs, not pinned body-version IDs. Immutable use-case lineage remains a backend dependency.</small></p>
        </article>
      </div>
      <aside className={styles.summary} aria-labelledby="readiness-title">
        <span className={styles.eyebrow}>{companyName}</span><h2 id="readiness-title">{generationReady ? "Ready to generate" : "Prepare your documents"}</h2><small>First meeting · PPT #2</small>
        <ul><li><span>First meeting</span><strong>{meetingComplete ? "Completed" : "Not confirmed"}</strong></li><li><span>Transcript insights</span><strong>{currentExtraction ? "Ready" : "Required"}</strong></li><li><span>Personal notes</span><strong>{notesDirty ? "Unsaved" : inputs?.notes.text ? "Saved" : "Not added"}</strong></li><li><span>Approved Discovery</span><strong>{workflow?.documents.approved_discovery ? "Available" : "Required"}</strong></li><li><span>Use cases</span><strong>{selectionDirty ? "Unsaved" : `${inputs?.selected.use_case_ids.length ?? 0} saved`}</strong></li></ul>
        <label className={styles.check}><input type="checkbox" checked={confirmed} disabled={disabled || !currentExtraction || selectionDirty || unresolved} onChange={(event) => setConfirmed(event.target.checked)} /><span>I reviewed the extracted insights and saved use-case selection for PPT #2.</span></label>
        <button className="btn btn-primary" disabled={disabled || !generationReady} onClick={() => void generateDocuments()}>{workflow?.documents.ppt2 ? "Regenerate PPT #2" : "Generate documents"}</button>
        {workflow?.documents.ppt2?.latest_ready_version_id ? <div className={styles.actions}><Link href={`${root}/post-meeting-presentation`}>Review existing PPT #2</Link></div> : null}
        <p><small>{finalized ? "Finalized outputs remain available for review." : "Save and review meeting inputs before generation. PPT #1 remains a separate artifact."}</small></p>
        <div className={styles.actions}><Link href={`${root}/follow-up`}>Review follow-up package</Link></div>
      </aside>
    </div>
  </section>;
}
