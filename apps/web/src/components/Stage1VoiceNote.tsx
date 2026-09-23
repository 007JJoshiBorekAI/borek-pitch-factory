"use client";

import React, { useRef, useState } from "react";

import { uploadStage1Voice } from "@/lib/api";
import { stage1VoiceErrorMessage } from "@/lib/apiErrors";
import { STAGE1_VOICE_ACCEPT, validateStage1VoiceFile } from "@/lib/stage1Intake";

interface Stage1VoiceNoteProps {
  accessToken: string;
  opportunityId: string;
  disabled?: boolean;
  onTranscriptReady?: (transcript: string) => void;
}

export function Stage1VoiceNote({
  accessToken,
  opportunityId,
  disabled = false,
  onTranscriptReady,
}: Stage1VoiceNoteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [transcriptPreview, setTranscriptPreview] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  async function handleFileSelected(file: File) {
    const validation = validateStage1VoiceFile(file);
    if (!validation.ok) {
      setNotice(validation.reason ?? "This recording could not be used.");
      return;
    }

    setBusy(true);
    setNotice(null);
    setSelectedFileName(file.name);

    try {
      const response = await uploadStage1Voice(accessToken, opportunityId, file);
      if (response.transcript) {
        setTranscriptPreview(response.transcript);
        onTranscriptReady?.(response.transcript);
        setNotice("Voice note transcribed. Review the preview below.");
      } else {
        setNotice("Recording received. Add a text description if you want more detail.");
      }
    } catch (error) {
      setNotice(stage1VoiceErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stage1-context-card stage1-voice-card">
      <div className="stage1-context-card-header">
        <strong>Add a voice note</strong>
        <span className="optional-label">Optional</span>
      </div>
      <p className="stage1-context-card-lead">Describe what you already know about the first conversation.</p>

      <div className="stage1-voice-actions">
        <input
          ref={inputRef}
          type="file"
          accept={STAGE1_VOICE_ACCEPT}
          className="sr-only"
          disabled={disabled || busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleFileSelected(file);
            }
            if (inputRef.current) {
              inputRef.current.value = "";
            }
          }}
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Uploading…" : "Upload recording"}
        </button>
        {selectedFileName ? (
          <span className="stage1-voice-file-name">{selectedFileName}</span>
        ) : (
          <span className="stage1-voice-file-hint">MP3, M4A, or WAV</span>
        )}
      </div>

      {notice ? (
        <p className="stage1-voice-notice" role="status">
          {notice}
        </p>
      ) : null}

      {transcriptPreview ? (
        <div className="stage1-voice-transcript" aria-live="polite">
          <strong>Transcript preview</strong>
          <p>{transcriptPreview}</p>
        </div>
      ) : null}
    </div>
  );
}
