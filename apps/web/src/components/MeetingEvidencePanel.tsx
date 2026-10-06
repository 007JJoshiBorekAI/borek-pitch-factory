"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import {
  ApiRequestError,
  generateMeetingExtraction,
  listAvailableUseCases,
  markFirstMeetingCompleted,
  regeneratePpt2,
  savePersonalNotes,
  saveSelectedUseCases,
  uploadTranscript,
  type AvailableUseCase,
} from "@/lib/api";
import {
  generateAndAwaitPostMeetingPresentation,
  type PostMeetingPresentationResult,
} from "@/lib/ppt2Generation";

interface MeetingEvidencePanelProps {
  opportunityId: string;
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError ? error.message : fallback;
}

export function MeetingEvidencePanel({ opportunityId }: MeetingEvidencePanelProps) {
  const { accessToken, previewMode } = useAuth();
  const live = Boolean(accessToken) && !previewMode;
  const [notes, setNotes] = useState("");
  const [transcriptId, setTranscriptId] = useState<string | null>(null);
  const [useCases, setUseCases] = useState<AvailableUseCase[]>([]);
  const [selectedUseCaseId, setSelectedUseCaseId] = useState("");
  const [ppt2, setPpt2] = useState<PostMeetingPresentationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!live || !accessToken) return;
    void listAvailableUseCases(accessToken, opportunityId)
      .then((payload) => setUseCases(payload.use_cases))
      .catch(() => setUseCases([]));
  }, [accessToken, live, opportunityId]);

  function requireSession(): string | null {
    if (live && accessToken) return accessToken;
    setError("Sign in to record meeting evidence for this opportunity.");
    return null;
  }

  async function completeFirstMeeting() {
    const token = requireSession();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await markFirstMeetingCompleted(token, opportunityId);
      setNotice("First meeting marked completed.");
    } catch (actionError) {
      setError(messageFrom(actionError, "The first meeting could not be marked completed."));
    } finally {
      setBusy(false);
    }
  }

  async function onTranscript(file: File) {
    const token = requireSession();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const uploaded = await uploadTranscript(token, opportunityId, file);
      setTranscriptId(uploaded.transcript.id);
      setNotice("Transcript stored separately from personal notes.");
    } catch (actionError) {
      setError(messageFrom(actionError, "The transcript could not be uploaded."));
    } finally {
      setBusy(false);
    }
  }

  async function onNotes(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = requireSession();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await savePersonalNotes(token, opportunityId, notes);
      setNotice("Personal notes saved.");
    } catch (actionError) {
      setError(messageFrom(actionError, "Personal notes could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  async function onExtract() {
    const token = requireSession();
    if (!token || !transcriptId) {
      if (!transcriptId) setError("Upload a transcript before generating the extraction.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await generateMeetingExtraction(token, opportunityId, transcriptId);
      setNotice("Meeting extraction completed.");
    } catch (actionError) {
      setError(messageFrom(actionError, "Meeting extraction could not be generated."));
    } finally {
      setBusy(false);
    }
  }

  async function onSelectUseCase() {
    const token = requireSession();
    if (!token || !selectedUseCaseId) return;
    setBusy(true);
    setError(null);
    try {
      await saveSelectedUseCases(token, opportunityId, [selectedUseCaseId]);
      setNotice("Selected use case saved.");
    } catch (actionError) {
      setError(messageFrom(actionError, "The selected use case could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  async function onGeneratePpt2() {
    const token = requireSession();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const result = await generateAndAwaitPostMeetingPresentation(token, opportunityId);
      setPpt2(result);
      setNotice("PPT #2 is ready.");
    } catch (actionError) {
      setError(messageFrom(actionError, "PPT #2 could not be generated."));
    } finally {
      setBusy(false);
    }
  }

  async function onRegeneratePpt2() {
    const token = requireSession();
    if (!token || !ppt2) return;
    setBusy(true);
    setError(null);
    try {
      const regenerated = await regeneratePpt2(token, opportunityId, ppt2.presentationId);
      setPpt2({
        presentationId: regenerated.presentation_id,
        presentationVersionId: regenerated.presentation_version_id || ppt2.presentationVersionId,
        jobId: regenerated.job_id,
      });
      setNotice("PPT #2 was regenerated on the same presentation.");
    } catch (actionError) {
      setError(messageFrom(actionError, "PPT #2 could not be regenerated."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="workflow-standard-page" aria-labelledby="meeting-title">
      <header className="workflow-section-header">
        <p>Post-meeting · {opportunityId}</p>
        <h1 id="meeting-title">Meeting Evidence</h1>
        <span>Transcript and personal notes are stored as separate sources.</span>
      </header>
      {error ? <p className="client-information-error" role="alert">{error}</p> : null}
      {notice ? <p className="client-information-notice" role="status">{notice}</p> : null}
      <div className="workflow-card-actions">
        <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void completeFirstMeeting()}>
          Mark first meeting completed
        </button>
      </div>
      <div className="workflow-source-grid">
        <article>
          <p className="workflow-panel-label">Transcript</p>
          <h2>Add meeting transcript</h2>
          <input
            aria-label="Transcript file"
            type="file"
            accept=".txt,.vtt,.docx"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onTranscript(file);
            }}
          />
          {transcriptId ? <span className="workflow-state-badge">Stored</span> : null}
        </article>
        <article>
          <p className="workflow-panel-label">Personal notes</p>
          <h2>Owner notes</h2>
          <form onSubmit={(event) => void onNotes(event)}>
            <textarea aria-label="Personal notes" placeholder="Add personal meeting notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
            <button className="btn btn-secondary" type="submit" disabled={busy}>Save notes</button>
          </form>
        </article>
      </div>
      <div className="workflow-card-actions">
        <button className="btn btn-secondary" type="button" disabled={busy || !transcriptId} onClick={() => void onExtract()}>
          Generate extraction
        </button>
      </div>
      <article>
        <p className="workflow-panel-label">Selected use case</p>
        <label>
          Approved use case
          <select aria-label="Selected use case" value={selectedUseCaseId} onChange={(event) => setSelectedUseCaseId(event.target.value)}>
            <option value="">Choose a use case</option>
            {useCases.map((useCase) => (
              <option key={useCase.fact_id} value={useCase.fact_id}>{useCase.statement || useCase.fact_id}</option>
            ))}
          </select>
        </label>
        <button className="btn btn-secondary" type="button" disabled={busy || !selectedUseCaseId} onClick={() => void onSelectUseCase()}>
          Save selected use case
        </button>
      </article>
      <article>
        <p className="workflow-panel-label">Post-meeting presentation</p>
        <h2>PPT #2</h2>
        <p>{ppt2 ? `Ready · ${ppt2.presentationId}` : "Generate PPT #2 from the frozen post-meeting context."}</p>
        <div className="workflow-card-actions">
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void onGeneratePpt2()}>
            Generate PPT #2
          </button>
          <button className="btn btn-secondary" type="button" disabled={busy || !ppt2} onClick={() => void onRegeneratePpt2()}>
            Regenerate PPT #2
          </button>
        </div>
      </article>
    </section>
  );
}
