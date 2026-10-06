"use client";

import { useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { ApiRequestError, finalizeWorkflow, markOwnerReviewed } from "@/lib/api";

interface OwnerCheckpointPanelProps {
  opportunityId: string;
}

export function OwnerCheckpointPanel({ opportunityId }: OwnerCheckpointPanelProps) {
  const { accessToken, previewMode } = useAuth();
  const live = Boolean(accessToken) && !previewMode;
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [finalized, setFinalized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function review() {
    if (!live || !accessToken) {
      setError("Sign in to record owner review.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await markOwnerReviewed(accessToken, opportunityId);
      setReviewed(true);
    } catch (actionError) {
      setError(actionError instanceof ApiRequestError ? actionError.message : "Owner review could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  async function finalize() {
    if (!live || !accessToken) {
      setError("Sign in to finalize this opportunity.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const status = await finalizeWorkflow(accessToken, opportunityId);
      setFinalized(status.current_status === "finalized");
    } catch (actionError) {
      setError(actionError instanceof ApiRequestError ? actionError.message : "Finalization could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="workflow-standard-page" aria-labelledby="review-title">
      <header className="workflow-section-header">
        <p>Owner checkpoint · {opportunityId}</p>
        <h1 id="review-title">Owner Review</h1>
        <span>Review PPT #2, then finalize the exact ready version.</span>
      </header>
      {error ? <p className="client-information-error" role="alert">{error}</p> : null}
      <div className="workflow-review-list">
        <div><span>PPT #2 presentation</span><strong>{reviewed ? "Reviewed" : "Waiting"}</strong></div>
        <div><span>Final documents</span><strong>{finalized ? "Finalized" : "Waiting"}</strong></div>
      </div>
      <div className="workflow-card-actions">
        <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void review()}>
          Mark owner reviewed
        </button>
        <button className="btn btn-primary" type="button" disabled={busy || !reviewed} onClick={() => void finalize()}>
          Finalize outputs
        </button>
      </div>
    </section>
  );
}
