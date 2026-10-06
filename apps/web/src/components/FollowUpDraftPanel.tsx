"use client";

import { useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { ApiRequestError, generateEmailDraft } from "@/lib/api";

interface FollowUpDraftPanelProps {
  opportunityId: string;
}

export function FollowUpDraftPanel({ opportunityId }: FollowUpDraftPanelProps) {
  const { accessToken, previewMode } = useAuth();
  const live = Boolean(accessToken) && !previewMode;
  const [subject, setSubject] = useState("Waiting for finalized context");
  const [body, setBody] = useState("The editable email draft will appear after owner review.");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createDraft() {
    if (!live || !accessToken) {
      setError("Sign in to prepare the follow-up email draft.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const draft = await generateEmailDraft(accessToken, opportunityId, "deepening");
      const draftRecord = draft.draft;
      const lengths = draftRecord && typeof draftRecord === "object"
        ? (draftRecord as { lengths?: Record<string, { subject?: string; body?: string }> }).lengths
        : undefined;
      const medium = lengths?.medium;
      if (typeof medium?.subject === "string") setSubject(medium.subject);
      if (typeof medium?.body === "string") setBody(medium.body);
    } catch (actionError) {
      setError(actionError instanceof ApiRequestError ? actionError.message : "The email draft could not be prepared.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="workflow-standard-page" aria-labelledby="follow-up-title">
      <header className="workflow-section-header">
        <p>Export package · {opportunityId}</p>
        <h1 id="follow-up-title">Follow-up Email</h1>
        <span>Review and export the draft. The application never sends email.</span>
      </header>
      {error ? <p className="client-information-error" role="alert">{error}</p> : null}
      <div className="workflow-email-preview">
        <label>
          Subject
          <input type="text" value={subject} readOnly />
        </label>
        <label>
          Body
          <textarea value={body} readOnly />
        </label>
      </div>
      <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void createDraft()}>
        Prepare email draft
      </button>
    </section>
  );
}
