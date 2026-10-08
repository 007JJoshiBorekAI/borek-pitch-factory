"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { PostMeetingPhaseNav, usePostMeeting } from "@/components/PostMeetingShell";
import { generateMeetingExtraction, listAvailableUseCases, saveSelectedUseCases, uploadTranscript, type AvailableUseCase } from "@/lib/api";
import { generateAndAwaitPostMeetingPresentation } from "@/lib/ppt2Generation";
import {
  blockerText, confirmMeetingReview, excludedFromConfirmation, EXTRACTION_FIELDS, FINDING_SOURCE_LABEL, findingsState,
  loadPostMeetingReview, MeetingNotesConflict, postMeetingError, prepareMeetingEvidence, reviewHeadline,
  savePersonalNotesChecked, staleReasonText, validateTranscript, workflowCompleted,
  type ExtractionCategory, type PersonalNotes, type PostMeetingReview,
} from "@/lib/postMeeting";
import styles from "./post-meeting.module.css";

type Excluded = Partial<Record<ExtractionCategory, string[]>>;

const when = (value: string | null) => value ? new Date(value).toLocaleString() : "";
const sameExcluded = (a: Excluded, b: Excluded) => EXTRACTION_FIELDS.every(([key]) =>
  [...(a[key] ?? [])].sort().join("\n") === [...(b[key] ?? [])].sort().join("\n"));

export function MeetingEvidencePanel({ opportunityId }: { opportunityId: string }) {
  const { accessToken, previewMode } = useAuth();
  const { workflow, refreshWorkflow, companyName } = usePostMeeting();
  const router = useRouter();
  const live = Boolean(accessToken) && !previewMode;
  const [review, setReview] = useState<PostMeetingReview | null>(null);
  const [notes, setNotes] = useState("");
  const [transcriptId, setTranscriptId] = useState("");
  const [excluded, setExcluded] = useState<Excluded>({});
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [conflictingNotes, setConflictingNotes] = useState<PersonalNotes | null>(null);
  const [available, setAvailable] = useState<AvailableUseCase[] | null>(null);
  const [useCaseDraft, setUseCaseDraft] = useState<string[] | null>(null);
  const loaded = useRef(false);
  const operation = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  useEffect(() => () => operation.current?.abort(), []);

  /** Shows what the server holds. Typed notes and the transcript choice survive a refresh. */
  const apply = useCallback((value: PostMeetingReview, initial = false) => {
    setReview(value);
    // Earlier exclusions stay unticked when a confirmation goes out of date; they count once confirmed again.
    setExcluded(excludedFromConfirmation(value));
    setTranscriptId((current) => {
      if (!initial && value.transcripts.some((item) => item.id === current)) return current;
      const analysed = value.transcripts.find((item) => item.analysed);
      const latest = [...value.transcripts].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];
      return (analysed ?? latest)?.id ?? "";
    });
    if (initial) setNotes(value.personal_notes.text ?? "");
  }, []);

  useEffect(() => {
    if (!live || !accessToken || loaded.current) return;
    const controller = new AbortController();
    setError(null);
    void loadPostMeetingReview(accessToken, opportunityId, controller.signal).then((value) => {
      if (controller.signal.aborted) return;
      loaded.current = true;
      apply(value, true);
    }).catch((cause) => { if (!controller.signal.aborted) setError(postMeetingError(cause)); });
    return () => controller.abort();
  }, [accessToken, apply, live, opportunityId, reload]);

  const baseline: PersonalNotes = { text: review?.personal_notes.text ?? null, updated_at: review?.personal_notes.updated_at ?? null };
  const notesDirty = Boolean(review) && notes.trim() !== (baseline.text ?? "");
  const finalized = Boolean(review?.finalized ?? workflow?.finalization);
  const editingDisabled = Boolean(busy) || finalized || (!previewMode && (!live || !review));
  const transcript = review?.transcripts.find((item) => item.id === transcriptId);
  const state = review ? findingsState(review, transcriptId, notesDirty) : "no-transcript";
  const storedExcluded = review && review.confirmation.status === "current" ? excludedFromConfirmation(review) : {};
  const selectionChanged = review?.confirmation.status === "current" && !sameExcluded(excluded, storedExcluded);
  const confirmedCurrent = review?.confirmation.status === "current" && !selectionChanged && state === "current";
  const root = `/opportunities/${encodeURIComponent(opportunityId)}`;

  // Typed notes exist only in this tab until they are saved.
  useEffect(() => {
    if (!notesDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [notesDirty]);

  async function run(label: string, action: (token: string, signal: AbortSignal) => Promise<void>) {
    if (!accessToken || !live || operation.current) return;
    const controller = new AbortController();
    operation.current = controller; setBusy(label); setError(null); setSaved(null);
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

  const refresh = async (token: string, signal: AbortSignal) => {
    const value = await loadPostMeetingReview(token, opportunityId, signal);
    if (!signal.aborted) apply(value);
    return value;
  };

  async function onTranscript(file: File) {
    if (editingDisabled) return;
    const invalid = validateTranscript(file);
    if (invalid) { setError(invalid); return; }
    if (previewMode) { setPreviewFile(file); setError(null); return; }
    await run("Uploading transcript", async (token, signal) => {
      const response = await uploadTranscript(token, opportunityId, file);
      signal.throwIfAborted();
      await refresh(token, signal);
      setTranscriptId(response.transcript.id);
      setSaved(`${file.name} uploaded.`);
    });
  }

  async function saveNotes() {
    if (!review || !notesDirty) return;
    await run("Saving notes", async (token, signal) => {
      const stored = await savePersonalNotesChecked(token, opportunityId, notes, baseline, signal);
      setNotes(stored.text ?? "");
      await refresh(token, signal);
      setSaved("Notes saved.");
    });
  }

  async function analyse() {
    if (!review || !transcriptId || notesDirty) return;
    await run("Analysing meeting", async (token, signal) => {
      await generateMeetingExtraction(token, opportunityId, transcriptId);
      signal.throwIfAborted();
      await refresh(token, signal);
      setSaved("Meeting analysed. Review the findings below.");
    });
  }

  async function confirm() {
    if (!review || state !== "current") return;
    await run("Confirming findings", async (token, signal) => {
      apply(await confirmMeetingReview(token, opportunityId, review, excluded, signal));
      setSaved("Meeting information confirmed.");
    });
  }

  async function openUseCases() {
    if (available || !accessToken || !live) return;
    try { setAvailable((await listAvailableUseCases(accessToken, opportunityId)).use_cases); }
    catch (cause) { setError(postMeetingError(cause)); }
  }

  async function saveUseCases() {
    if (!useCaseDraft) return;
    await run("Saving use cases", async (token, signal) => {
      await saveSelectedUseCases(token, opportunityId, useCaseDraft);
      signal.throwIfAborted();
      await refresh(token, signal);
      setUseCaseDraft(null);
      setSaved("Use cases saved.");
    });
  }

  // Previous document flow (standalone PPT #2). Not part of the Master Presentation V2 path.
  async function generateDocuments() {
    if (!review || !transcript || notesDirty) return;
    await run("Preparing documents", async (token, signal) => {
      const prepared = await prepareMeetingEvidence(token, opportunityId, transcriptId, notes, baseline, { signal, onProgress: setBusy });
      signal.throwIfAborted();
      setBusy("Generating documents");
      await generateAndAwaitPostMeetingPresentation(token, opportunityId, () => signal.throwIfAborted(), {
        regeneratePresentationId: prepared.workflow.documents.ppt2?.presentation_id,
      });
      if (!signal.aborted) router.push(`${root}/follow-up`);
    });
  }

  function toggle(category: ExtractionCategory, text: string) {
    setExcluded((current) => {
      const items = current[category] ?? [];
      return { ...current, [category]: items.includes(text) ? items.filter((item) => item !== text) : [...items, text] };
    });
  }

  const selectedIds = useCaseDraft ?? review?.selected_use_cases.use_case_ids ?? [];
  const findingsMessage = {
    "no-transcript": "Upload a transcript to analyse the meeting.",
    "not-analysed": "The meeting has not been analysed yet.",
    "other-transcript": `These findings come from ${review?.extraction.transcript_file_name ?? "a transcript that was removed"}, not from the transcript selected above. Analyse the selected transcript to replace them.`,
    "notes-unsaved": "You have unsaved notes. Save them, then analyse again so the findings include them.",
    stale: "These findings are out of date.",
    current: "Findings match the selected transcript and the saved notes.",
  }[state];
  const adoptNotes = (value: PersonalNotes, keepTyped: boolean) => {
    setReview((current) => current ? { ...current, personal_notes: { status: value.text ? "available" : "missing", text: value.text, updated_at: value.updated_at } } : current);
    if (!keepTyped) setNotes(value.text ?? "");
    setConflictingNotes(null); setError(null);
  };

  return <section aria-labelledby="meeting-title">
    <header className={styles.heading}><span className={styles.eyebrow}>Post-meeting</span><h1 id="meeting-title">Turn the meeting into the next pitch</h1><p>{companyName} · First meeting</p></header>
    <PostMeetingPhaseNav opportunityId={opportunityId} active="meeting" />
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {busy ? <p className={styles.notice} role="status">{busy}...</p> : saved ? <p className={styles.notice} role="status">{saved}</p> : null}
    {live && !review ? <div className={styles.notice}>{error ? <button className="btn btn-secondary" onClick={() => setReload((value) => value + 1)}>Retry loading</button> : <span role="status">Loading meeting inputs...</span>}</div> : null}
    {finalized ? <p className={styles.notice}>This package is finalized. Meeting inputs are read-only.</p> : null}
    {review?.execution_mode === "fixture" ? <p className={styles.notice} data-testid="fixture-notice">Test mode: this environment analyses meetings with a rule-based extractor that only picks up lines such as “Requirement: …” or “Decision: …”. No AI model is called.</p> : null}
    <div className={`${styles.columns} ${styles.meetingColumns}`}>
      <div className={styles.stack}>
        <article className={`${styles.card} ${styles.meetingCard}`} aria-labelledby="transcript-title">
          <span className={styles.eyebrow}>Source 1 · Transcript</span><h2 id="transcript-title">What was said in the meeting?</h2>
          <p className={styles.meetingIntro}>Upload the transcript of the first client meeting. If you upload more than one, choose the one to analyse.</p>
          <div className={styles.actions}>
            <button className="btn btn-secondary" disabled={editingDisabled} onClick={() => fileInput.current?.click()}>{review?.transcripts.length || previewFile ? "Upload another transcript" : "Upload transcript"}</button>
            <small>TXT, VTT, SRT or DOCX</small>
            <input ref={fileInput} type="file" hidden accept=".txt,.vtt,.srt,.docx" aria-label="Meeting transcript" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void onTranscript(file); }} />
          </div>
          {previewMode ? <div className={styles.transcriptCard} role="status"><div><strong>{previewFile?.name ?? "No transcript added"}</strong><small>{previewFile ? "Selected locally; not uploaded" : "Layout preview only"}</small></div></div> : null}
          {live && review && !review.transcripts.length ? <div className={styles.transcriptCard} role="status"><div><strong>No transcript added</strong><small>Nothing can be analysed until a transcript is uploaded.</small></div></div> : null}
          {live && review?.transcripts.length ? <ul className={styles.transcriptList} data-testid="transcript-list">{review.transcripts.map((item) => <li key={item.id}>
            <label className={styles.check}>
              <input type="radio" name="transcript" checked={item.id === transcriptId} disabled={editingDisabled} onChange={() => setTranscriptId(item.id)} />
              <span><strong>{item.file_name}</strong><small>Uploaded {when(item.created_at)} · {item.turn_count} speaker turns{item.analysed ? " · analysed" : ""}</small></span>
            </label>
          </li>)}</ul> : null}
        </article>

        <article className={styles.card} aria-labelledby="notes-title">
          <span className={styles.eyebrow}>Source 2 · Personal notes</span><h2 id="notes-title">Your own observations</h2>
          <p className={styles.meetingIntro}>Optional. Notes are your view of the meeting. They are stored separately from the transcript and are never treated as something the client said.</p>
          <label className={styles.notesField} htmlFor="personal-notes">Personal notes <span>(optional)</span>
            <textarea id="personal-notes" value={notes} maxLength={20000} disabled={editingDisabled} placeholder="Anything you noticed that the transcript does not show?" onChange={(event) => { setNotes(event.target.value); setSaved(null); }} />
          </label>
          <div className={styles.actions}>
            <button className="btn btn-secondary" disabled={editingDisabled || !notesDirty || Boolean(conflictingNotes)} onClick={() => void saveNotes()}>Save notes</button>
            <small role="status" data-testid="notes-status">{notesDirty ? "Unsaved changes" : baseline.text ? `Saved ${when(baseline.updated_at)}` : "No notes saved"}</small>
          </div>
          {conflictingNotes ? <div className={styles.source}><strong>Notes saved in another session</strong><p>{conflictingNotes.text || "No notes"}</p><div className={styles.actions}>
            <button className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => adoptNotes(conflictingNotes, false)}>Use saved notes</button>
            <button className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => adoptNotes(conflictingNotes, true)}>Keep my notes</button>
          </div></div> : null}
        </article>

        {live && review ? <article className={styles.card} aria-labelledby="findings-title" data-testid="meeting-findings">
          <span className={styles.eyebrow}>Analysis · Interpretation of the sources</span><h2 id="findings-title">Meeting findings</h2>
          <p className={styles.meetingIntro}>The analysis reads the selected transcript and your saved notes and sorts what it finds into seven categories. Each finding names its source. Findings are an interpretation until you confirm them.</p>
          <p className={state === "current" ? styles.notice : styles.error} role="status" data-testid="findings-status">{findingsMessage}{state === "stale" ? ` ${review.extraction.stale_reasons.map(staleReasonText).join(" ")}` : ""}</p>
          <div className={styles.actions}>
            <button className="btn btn-primary" disabled={editingDisabled || !transcript || notesDirty} onClick={() => void analyse()}>{review.extraction.status === "missing" ? "Analyse meeting" : "Analyse again"}</button>
            {review.extraction.generated_at ? <small>Last analysed {when(review.extraction.generated_at)}{review.extraction.execution_mode === "fixture" ? " · rule-based test extractor" : review.extraction.execution_mode === "live" ? " · AI model" : ""}</small> : null}
          </div>
          {review.extraction.status !== "missing" ? <div className={styles.extraction}>{EXTRACTION_FIELDS.map(([key, label]) => <section key={key} aria-label={label}>
            <h3>{label}</h3>
            {review.extraction.categories[key].length ? <ul className={styles.findings}>{review.extraction.categories[key].map((item) => {
              const out = (excluded[key] ?? []).includes(item.text);
              return <li key={item.text} className={out ? styles.findingExcluded : undefined}>
                <label className={styles.check}>
                  <input type="checkbox" checked={!out} disabled={editingDisabled || state !== "current"} onChange={() => toggle(key, item.text)} aria-label={`Include: ${item.text}`} />
                  <span>{item.text}<small>{FINDING_SOURCE_LABEL[item.source]}{out ? " · excluded" : ""}</small></span>
                </label>
              </li>;
            })}</ul> : <p><small>Nothing captured. Not mentioned in the transcript or the notes.</small></p>}
          </section>)}</div> : null}
        </article> : null}

        {live && review ? <article className={styles.card} aria-labelledby="use-cases-title">
          <span className={styles.eyebrow}>Source 3 · Borek use cases</span><h2 id="use-cases-title">Selected Borek use cases</h2>
          {review.selected_use_cases.use_cases.length ? <ul className={styles.findings}>{review.selected_use_cases.use_cases.map((item) => <li key={item.fact_id}>{item.statement ?? item.fact_id}{item.status !== "resolved" ? <small> · no longer available</small> : null}</li>)}</ul> : <p><small>No use case selected. This is optional.</small></p>}
          <details onToggle={(event) => { if ((event.target as HTMLDetailsElement).open) void openUseCases(); }}>
            <summary>Change selection</summary>
            {!available ? <p role="status"><small>Loading approved use cases...</small></p> : !available.length ? <p><small>No approved use cases are available.</small></p> : <>
              {available.map((item) => <label key={item.fact_id} className={styles.check}>
                <input type="checkbox" checked={selectedIds.includes(item.fact_id)} disabled={editingDisabled} onChange={() => setUseCaseDraft(selectedIds.includes(item.fact_id) ? selectedIds.filter((id) => id !== item.fact_id) : [...selectedIds, item.fact_id])} />
                <span>{item.statement ?? item.fact_id}</span>
              </label>)}
              <div className={styles.actions}><button className="btn btn-secondary" disabled={editingDisabled || !useCaseDraft} onClick={() => void saveUseCases()}>Save use cases</button></div>
            </>}
          </details>
        </article> : null}
      </div>

      <aside className={`${styles.summary} ${styles.meetingSummary}`} aria-labelledby="readiness-title" data-testid="meeting-readiness">
        <span className={styles.eyebrow}>{companyName}</span>
        <h2 id="readiness-title">{previewMode ? "Layout preview" : review ? selectionChanged ? "Confirm your changes" : reviewHeadline(review) : "Loading"}</h2><small>First meeting</small>
        {live && review ? <>
          <ul>
            <li><span>Approved Discovery</span><strong>{review.approved_discovery.status === "available" ? `Version ${review.approved_discovery.version_number}` : "Missing"}</strong></li>
            <li><span>Master Presentation V1</span><strong>{review.master_presentation.status === "ready" ? "Ready" : review.master_presentation.status === "legacy" ? "Earlier deck format" : "Missing"}</strong></li>
            <li><span>Transcript</span><strong>{transcript ? "Selected" : "Required"}</strong></li>
            <li><span>Personal notes</span><strong>{notesDirty ? "Unsaved" : baseline.text ? "Saved" : "None"}</strong></li>
            <li><span>Meeting findings</span><strong>{{ "no-transcript": "Not analysed", "not-analysed": "Not analysed", "other-transcript": "Other transcript", "notes-unsaved": "Out of date", stale: "Out of date", current: `${review.extraction.item_count} found` }[state]}</strong></li>
            <li data-testid="findings-confirmation"><span>Meeting findings confirmed</span><strong>{confirmedCurrent ? `Yes · ${review.confirmation.confirmed_count} included` : review.confirmation.status === "none" ? "Not yet" : "Out of date"}</strong></li>
            <li data-testid="presentation-owner-review"><span>Presentation owner review</span><strong>{workflowCompleted(workflow, "owner_review") ? "Completed" : "Pending · after V2"}</strong></li>
          </ul>
          {review.confirmation.status === "stale" ? <p><small>{review.confirmation.stale_reasons.map(staleReasonText).join(" ")}</small></p> : null}
          <button className="btn btn-primary" disabled={editingDisabled || state !== "current" || confirmedCurrent} onClick={() => void confirm()}>{busy === "Confirming findings" ? "Confirming..." : confirmedCurrent ? "Meeting information confirmed" : "Confirm meeting information"}</button>
          {confirmedCurrent ? <p><small>Confirmed {when(review.confirmation.confirmed_at)}: {review.confirmation.confirmed_count} findings included{review.confirmation.excluded_count ? `, ${review.confirmation.excluded_count} excluded` : ""}.</small></p> : <p><small>Untick any finding that is wrong or should not be used. Confirming records the remaining findings as checked by you.</small></p>}
          <p><small>Confirming the meeting findings is not the owner review of the presentation. That review is a separate, later step: it happens once Master Presentation V2 exists.</small></p>
          {review.readiness.ready_for_v2 && confirmedCurrent ? <p className={styles.notice} data-testid="v2-ready">Everything Master Presentation V2 needs is in place. V2 will be a new version of the same presentation as V1. Generating V2 is not available yet.</p>
            : <div data-testid="v2-blockers"><small>Still needed before Master Presentation V2:</small><ul>{(selectionChanged ? ["MEETING_REVIEW_NOT_CONFIRMED"] : review.readiness.blockers).map((code) => <li key={code}><span>{blockerText(code)}</span></li>)}</ul></div>}
          <details>
            <summary><small>Previous document flow</small></summary>
            <p><small>Generates the earlier standalone PPT #2 and follow-up documents. It is separate from Master Presentation V2 and does not use your confirmation.</small></p>
            <button className="btn btn-secondary" disabled={editingDisabled || !transcript || notesDirty || !workflow?.documents.approved_discovery || Boolean(conflictingNotes)} onClick={() => void generateDocuments()}>Generate documents</button>
            {workflow?.documents.ppt2?.latest_ready_version_id ? <div className={styles.actions}><Link href={`${root}/post-meeting-presentation`}>View existing presentation</Link></div> : null}
          </details>
        </> : previewMode ? <p><small>Layout preview only. Uploading, analysing and confirming require a live session.</small></p> : null}
      </aside>
    </div>
  </section>;
}
