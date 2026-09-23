"use client";

import React, { useEffect, useState } from "react";

import { getMeetingFeedback, updateMeetingFeedback } from "@/lib/api";
import {
  isJourneyOutputsEndpointUnavailable,
  meetingFeedbackErrorMessage,
} from "@/lib/apiErrors";

export function MeetingFeedbackPanel({
  accessToken,
  opportunityId,
  disabled = false,
}: {
  accessToken: string | null;
  opportunityId: string | null;
  disabled?: boolean;
}) {
  const [draftText, setDraftText] = useState("");
  const [confirmedUpdatedAt, setConfirmedUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveConfirmed, setSaveConfirmed] = useState(false);
  const [endpointUnavailable, setEndpointUnavailable] = useState(false);

  const canEdit = Boolean(accessToken && opportunityId) && !disabled && !endpointUnavailable;
  const panelDisabled = disabled || loading || saving;

  useEffect(() => {
    setDraftText("");
    setConfirmedUpdatedAt(null);
    setLoadError(null);
    setSaveError(null);
    setSaveConfirmed(false);
    setEndpointUnavailable(false);

    if (!accessToken || !opportunityId) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    void getMeetingFeedback(accessToken, opportunityId)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setDraftText(response.text ?? "");
        setConfirmedUpdatedAt(response.updated_at);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        if (isJourneyOutputsEndpointUnavailable(error)) {
          setEndpointUnavailable(true);
        }
        setLoadError(meetingFeedbackErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, opportunityId]);

  async function handleSave() {
    if (!accessToken || !opportunityId || saving) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaveConfirmed(false);

    const textToSave = draftText.trim();

    try {
      const saved = await updateMeetingFeedback(accessToken, opportunityId, {
        text: textToSave.length > 0 ? textToSave : null,
      });
      setDraftText(saved.text ?? "");
      setConfirmedUpdatedAt(saved.updated_at);
      setSaveConfirmed(true);
    } catch (error) {
      setSaveError(meetingFeedbackErrorMessage(error));
      if (isJourneyOutputsEndpointUnavailable(error)) {
        setEndpointUnavailable(true);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="upload-panel meeting-feedback-panel" aria-labelledby="meeting-feedback-title">
      <header className="upload-panel-header">
        <div>
          <h2 id="meeting-feedback-title">Meeting feedback</h2>
          <p>
            Optional sales-rep learnings from the first client meeting. Saved separately from
            transcripts and never treated as transcript content.
          </p>
        </div>
      </header>

      {loadError ? <div className="alert alert-error">{loadError}</div> : null}
      {saveError ? <div className="alert alert-error">{saveError}</div> : null}
      {saveConfirmed ? (
        <p className="client-document-notice" role="status">
          Meeting feedback saved
          {confirmedUpdatedAt ? ` · ${new Date(confirmedUpdatedAt).toLocaleString()}` : ""}.
        </p>
      ) : null}

      {!canEdit && !endpointUnavailable ? (
        <p className="upload-hint">Create an opportunity above to record meeting feedback.</p>
      ) : null}

      {endpointUnavailable ? (
        <p className="upload-hint">
          Meeting feedback requires the BT-36 backend on this environment.
        </p>
      ) : (
        <>
          {loading ? <p className="journey-start-loading">Loading meeting feedback…</p> : null}
          <label className="meeting-feedback-field">
            <span className="sr-only">Meeting feedback</span>
            <textarea
              className="meeting-feedback-textarea"
              rows={6}
              value={draftText}
              disabled={panelDisabled || !canEdit}
              placeholder="What did you learn from the first meeting?"
              onChange={(event) => {
                setDraftText(event.target.value);
                setSaveConfirmed(false);
              }}
            />
          </label>
          <div className="stage-review-generate-row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={panelDisabled || !canEdit}
              onClick={() => void handleSave()}
            >
              {saving ? "Saving feedback…" : "Save meeting feedback"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
