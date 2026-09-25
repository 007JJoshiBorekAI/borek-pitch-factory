"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  ClientDocumentUploadPanel,
  countProcessedClientDocuments,
} from "@/components/ClientDocumentUploadPanel";
import { FileUploadQueue } from "@/components/FileUploadQueue";
import { MeetingFeedbackPanel } from "@/components/MeetingFeedbackPanel";
import { listTranscripts, type ClientDocument, type OpportunityResponse, type TranscriptResponse } from "@/lib/api";
import {
  buildReadinessState,
  createNotesTranscriptFile,
  defaultPostMeetingInputMode,
  formatClientContext,
  formatReadinessMeetingContext,
  hasProcessedTranscript,
  hasProcessingTranscript,
  isJamieAvailable,
  jamieUnavailableMessage,
  POST_MEETING_INPUT_MODES,
  primaryTranscriptLabel,
  primaryTranscriptMeta,
  type PostMeetingInputMode,
} from "@/lib/postMeetingIntake";
import { createQueueItem, type TranscriptQueueItem } from "@/lib/uploadQueue";

interface PostMeetingIntakeViewProps {
  disabled?: boolean;
  accessToken: string | null;
  opportunity: OpportunityResponse | null;
  opportunityId: string | null;
  queueItems: TranscriptQueueItem[];
  uploadSummary: string | null;
  canUpload: boolean;
  onQueueItemsChange: (items: TranscriptQueueItem[]) => void;
  onUploadBatch: (items: TranscriptQueueItem[]) => Promise<void>;
  onNavigateToReview: (opportunityId: string) => void;
}

export function PostMeetingIntakeView({
  disabled = false,
  accessToken,
  opportunity,
  opportunityId,
  queueItems,
  uploadSummary,
  canUpload,
  onQueueItemsChange,
  onUploadBatch,
  onNavigateToReview,
}: PostMeetingIntakeViewProps) {
  const documentUploadRef = useRef<(() => void) | null>(null);
  const [inputMode, setInputMode] = useState<PostMeetingInputMode>(defaultPostMeetingInputMode());
  const [remoteTranscripts, setRemoteTranscripts] = useState<TranscriptResponse[]>([]);
  const [clientDocuments, setClientDocuments] = useState<ClientDocument[]>([]);
  const [feedbackText, setFeedbackText] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesBusy, setNotesBusy] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [notesNotice, setNotesNotice] = useState<string | null>(null);
  const [additionalOpen, setAdditionalOpen] = useState(false);
  const [continueBusy, setContinueBusy] = useState(false);
  const [continueError, setContinueError] = useState<string | null>(null);

  const panelDisabled = disabled || notesBusy || continueBusy;
  const transcriptReady = hasProcessedTranscript(queueItems, remoteTranscripts);
  const transcriptProcessing = hasProcessingTranscript(queueItems, remoteTranscripts);

  useEffect(() => {
    if (!accessToken || !opportunityId) {
      setRemoteTranscripts([]);
      return;
    }

    let cancelled = false;
    void listTranscripts(accessToken, opportunityId)
      .then((rows) => {
        if (!cancelled) {
          setRemoteTranscripts(rows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRemoteTranscripts([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, opportunityId, queueItems]);

  const readiness = useMemo(
    () =>
      buildReadinessState({
        mode: inputMode,
        queueItems,
        remoteTranscripts,
        feedbackText,
        clientDocuments,
        busy: continueBusy || notesBusy,
      }),
    [
      clientDocuments,
      continueBusy,
      feedbackText,
      inputMode,
      notesBusy,
      queueItems,
      remoteTranscripts,
    ],
  );

  async function handleNotesUpload() {
    if (!opportunity || !canUpload) {
      setNotesError("Create or open an opportunity before uploading typed notes.");
      return;
    }
    const trimmed = notesDraft.trim();
    if (!trimmed) {
      setNotesError("Type meeting notes before uploading.");
      return;
    }

    setNotesBusy(true);
    setNotesError(null);
    setNotesNotice(null);
    try {
      const file = createNotesTranscriptFile(opportunity.client_name, trimmed);
      const item = createQueueItem(file);
      onQueueItemsChange([...queueItems, item]);
      await onUploadBatch([item]);
      setNotesNotice("Typed notes uploaded as a transcript file.");
      setInputMode("upload");
    } catch (error) {
      setNotesError(error instanceof Error ? error.message : "Could not upload typed notes.");
    } finally {
      setNotesBusy(false);
    }
  }

  async function handleContinue() {
    if (!opportunityId || !readiness.canContinue || continueBusy) {
      return;
    }
    setContinueBusy(true);
    setContinueError(null);
    try {
      onNavigateToReview(opportunityId);
    } catch (error) {
      setContinueError(error instanceof Error ? error.message : "Could not continue to review.");
    } finally {
      setContinueBusy(false);
    }
  }

  function renderInputModeTabs() {
    return (
      <div className="post-meeting-mode-tabs" role="tablist" aria-label="Meeting input source">
        {POST_MEETING_INPUT_MODES.map((mode) => {
          const active = inputMode === mode.id;
          const jamieDisabled = mode.id === "jamie" && !isJamieAvailable();
          return (
            <button
              key={mode.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`post-meeting-mode-tab${active ? " is-active" : ""}${
                jamieDisabled ? " is-disabled" : ""
              }`}
              disabled={panelDisabled || jamieDisabled}
              onClick={() => {
                if (!jamieDisabled) {
                  setInputMode(mode.id);
                }
              }}
            >
              {mode.label}
            </button>
          );
        })}
      </div>
    );
  }

  function renderSourcePanel() {
    if (inputMode === "jamie") {
      return (
        <div className="post-meeting-source-panel post-meeting-source-unavailable" role="tabpanel">
          <p>{jamieUnavailableMessage()}</p>
        </div>
      );
    }

    if (inputMode === "notes") {
      return (
        <div className="post-meeting-source-panel" role="tabpanel">
          <textarea
            className="post-meeting-notes-input"
            rows={6}
            value={notesDraft}
            disabled={panelDisabled}
            placeholder="Type what happened in the meeting…"
            onChange={(event) => {
              setNotesDraft(event.target.value);
              setNotesError(null);
              setNotesNotice(null);
            }}
          />
          <p className="post-meeting-inline-hint">
            Typed notes are uploaded as a plain-text transcript file using the existing transcript
            pipeline.
          </p>
          {notesError ? (
            <p className="post-meeting-form-error" role="alert">
              {notesError}
            </p>
          ) : null}
          {notesNotice ? (
            <p className="post-meeting-inline-notice" role="status">
              {notesNotice}
            </p>
          ) : null}
          <div className="post-meeting-upload-actions">
            <button
              type="button"
              className="post-meeting-primary-inline-button"
              disabled={panelDisabled || !canUpload}
              onClick={() => void handleNotesUpload()}
            >
              {notesBusy ? "Uploading notes…" : "Upload typed notes"}
            </button>
          </div>
          {transcriptReady ? (
            <div className="post-meeting-transcript-tile" aria-live="polite">
              <div className="post-meeting-transcript-icon" aria-hidden="true">
                ✓
              </div>
              <div className="post-meeting-transcript-copy">
                <strong>{primaryTranscriptLabel(opportunity, queueItems, remoteTranscripts)}</strong>
                <span>{primaryTranscriptMeta(queueItems, remoteTranscripts)}</span>
              </div>
              <span className="post-meeting-status-badge post-meeting-status-ready">READY</span>
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <div className="post-meeting-source-panel" role="tabpanel">
        <FileUploadQueue
          items={queueItems}
          uploadDisabled={!canUpload || panelDisabled}
          variant="compact"
          transcriptTitle={primaryTranscriptLabel(opportunity, queueItems, remoteTranscripts)}
          transcriptMeta={primaryTranscriptMeta(queueItems, remoteTranscripts)}
          transcriptReady={transcriptReady}
          transcriptProcessing={transcriptProcessing}
          onItemsChange={onQueueItemsChange}
          onUpload={onUploadBatch}
        />
        {uploadSummary ? (
          <p className="post-meeting-inline-notice" role="status">
            {uploadSummary}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="post-meeting-page">
      <header className="post-meeting-header">
        <p className="post-meeting-eyebrow">POST-MEETING</p>
        <h1 className="post-meeting-title">Add the meeting</h1>
        <p className="post-meeting-context">{formatClientContext(opportunity)}</p>
      </header>

      <div className="post-meeting-flow" aria-label="Post-meeting workflow">
        <div className="post-meeting-flow-step post-meeting-flow-step-active">
          <span className="post-meeting-flow-marker">1</span>
          <span>Meeting input</span>
        </div>
        <span className="post-meeting-flow-connector" aria-hidden="true" />
        <div className="post-meeting-flow-step post-meeting-flow-step-future">
          <span className="post-meeting-flow-marker">2</span>
          <span>Generate + review</span>
        </div>
      </div>

      <div className="post-meeting-columns">
        <section className="post-meeting-main-card" aria-labelledby="post-meeting-input-title">
          <p className="post-meeting-card-kicker">MEETING INPUT</p>
          <h2 id="post-meeting-input-title">What happened in the meeting?</h2>

          {renderInputModeTabs()}
          {renderSourcePanel()}

          <MeetingFeedbackPanel
            accessToken={accessToken}
            opportunityId={opportunityId}
            disabled={panelDisabled}
            variant="embedded"
            onFeedbackChange={(text) => setFeedbackText(text)}
          />

          <div className="post-meeting-additional-block">
            <p className="post-meeting-field-kicker">ADDITIONAL INFORMATION</p>

            <ClientDocumentUploadPanel
              accessToken={accessToken}
              opportunityId={opportunityId}
              disabled={panelDisabled}
              variant="compact"
              uploadTriggerRef={documentUploadRef}
              onDocumentsChange={setClientDocuments}
            />

            <details
              className="post-meeting-other-info"
              open={additionalOpen}
              onToggle={(event) => setAdditionalOpen((event.currentTarget as HTMLDetailsElement).open)}
            >
              <summary>Other meeting information</summary>
              <div className="post-meeting-other-info-body">
                <p className="post-meeting-inline-hint">
                  Add optional client documents such as spreadsheets, briefs, or background material.
                </p>
                <button
                  type="button"
                  className="post-meeting-primary-inline-button"
                  disabled={panelDisabled || !opportunityId}
                  onClick={() => documentUploadRef.current?.()}
                >
                  Add client document
                </button>
              </div>
            </details>
          </div>
        </section>

        <aside className="post-meeting-aside" aria-labelledby="post-meeting-aside-title">
          <p className="post-meeting-aside-kicker">{opportunity?.client_name ?? "CLIENT"}</p>
          <h2 id="post-meeting-aside-title">
            {readiness.canContinue ? "Ready to generate" : "Complete meeting input"}
          </h2>
          <p className="post-meeting-aside-context">
            {formatReadinessMeetingContext(opportunity)}
          </p>
          <hr className="post-meeting-aside-divider" />

          <ul className="post-meeting-readiness-list">
            <li className={readiness.meetingSourceReady ? "is-complete" : ""}>
              <span className="post-meeting-readiness-marker" aria-hidden="true">
                {readiness.meetingSourceReady ? "✓" : ""}
              </span>
              <span className="post-meeting-readiness-label">{readiness.meetingSourceLabel}</span>
              <span className="post-meeting-readiness-status">{readiness.meetingSourceStatus}</span>
            </li>
            <li className={readiness.feedbackAdded ? "is-complete" : ""}>
              <span className="post-meeting-readiness-marker" aria-hidden="true">
                {readiness.feedbackAdded ? "✓" : ""}
              </span>
              <span className="post-meeting-readiness-label">Meeting feedback</span>
              <span className="post-meeting-readiness-status">
                {readiness.feedbackAdded ? "Added" : "Optional"}
              </span>
            </li>
            <li className={readiness.documentAdded ? "is-complete" : ""}>
              <span className="post-meeting-readiness-marker" aria-hidden="true">
                {readiness.documentAdded ? "✓" : ""}
              </span>
              <span className="post-meeting-readiness-label">Client document</span>
              <span className="post-meeting-readiness-status">
                {readiness.documentAdded ? "Added" : "Optional"}
              </span>
            </li>
          </ul>

          {readiness.continueBlockedReason ? (
            <p className="post-meeting-inline-hint">{readiness.continueBlockedReason}</p>
          ) : null}
          {continueError ? (
            <p className="post-meeting-form-error" role="alert">
              {continueError}
            </p>
          ) : null}

          <button
            type="button"
            className="post-meeting-generate-button"
            disabled={panelDisabled || !readiness.canContinue}
            onClick={() => void handleContinue()}
          >
            {continueBusy ? "Continuing…" : readiness.ctaLabel}
          </button>
          <p className="post-meeting-time-hint">{readiness.ctaHelperText}</p>
          <p className="post-meeting-time-hint">Usually ready in under a minute</p>
        </aside>
      </div>
    </div>
  );
}

export { countProcessedClientDocuments };
