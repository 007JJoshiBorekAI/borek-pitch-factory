"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { usePreviewMeeting } from "@/components/usePreviewMeeting";
import { completeFirstMeetingAndGetRoute } from "@/lib/firstMeetingHandoff";
import { loadPostMeetingWorkflow, postMeetingError, workflowCompleted, type PostMeetingWorkflow } from "@/lib/postMeeting";

export function FirstMeetingHandoff({ opportunityId, ppt1Ready }: { opportunityId: string; ppt1Ready: boolean }) {
  const { accessToken, previewMode } = useAuth();
  const router = useRouter();
  const live = Boolean(accessToken) && !previewMode;
  const preview = usePreviewMeeting(opportunityId);
  const [workflow, setWorkflow] = useState<PostMeetingWorkflow | null>(null);
  const [loading, setLoading] = useState(live);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const operation = useRef<AbortController | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const completed = previewMode ? preview.completed : workflowCompleted(workflow, "first_meeting_completed");
  const ready = previewMode ? preview.ready : ppt1Ready && workflowCompleted(workflow, "ppt1_ready");
  const checking = previewMode ? preview.loading : loading;
  const available = previewMode ? preview.enabled : live;

  useEffect(() => {
    if (!live || !accessToken) return;
    const controller = new AbortController();
    operation.current?.abort(); operation.current = null; setBusy(false);
    setLoading(true); setWorkflow(null); setError(null); setConfirming(false);
    void loadPostMeetingWorkflow(accessToken, opportunityId, controller.signal).then((value) => {
      if (!controller.signal.aborted) setWorkflow(value);
    }).catch((cause) => { if (!controller.signal.aborted) setError(postMeetingError(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); operation.current?.abort(); };
  }, [accessToken, live, opportunityId, ppt1Ready, reload]);

  async function continueToMeeting() {
    if (previewMode) {
      if (!available || checking || busy || (!completed && (!ready || !confirming))) return;
      setError(null); setBusy(true);
      try { router.push(preview.complete()); }
      catch (cause) { setError(postMeetingError(cause)); }
      finally { setBusy(false); }
      return;
    }
    if (!accessToken || !live || loading || operation.current || (!completed && (!ready || !confirming))) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true); setError(null);
    try {
      const route = await completeFirstMeetingAndGetRoute(accessToken, opportunityId, controller.signal);
      if (!controller.signal.aborted) router.push(route);
    } catch (cause) { if (!controller.signal.aborted) setError(postMeetingError(cause)); }
    finally {
      if (operation.current === controller) operation.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <section className="discovery-download-card" aria-labelledby="meeting-handoff-title">
    <strong id="meeting-handoff-title">{completed ? previewMode ? "First meeting completed (preview)" : "First meeting completed" : "After your first client meeting"}</strong>
    <p>{previewMode ? "Confirm the preview meeting to inspect the transcript-and-notes screen." : "Confirm that the meeting took place to unlock transcript upload and personal notes."}</p>
    {error || preview.error ? <p className="client-information-error" role="alert">{error ?? preview.error}</p> : null}
    {checking || busy ? <p role="status">{busy ? "Confirming meeting completion..." : "Checking meeting status..."}</p> : null}
    {previewMode ? <p className="discovery-version-label">Preview only: confirmation is stored locally for this pitch. It opens the post-meeting layout without changing backend status.</p> : !live ? <p className="discovery-version-label">A signed-in API session is required.</p> : null}
    {!checking && !completed && !ready ? <p className="discovery-version-label">Generate Master Presentation V1 before confirming the first meeting.</p> : null}
    {confirming && !completed ? <div role="group" aria-labelledby="meeting-confirmation-question">
      <p id="meeting-confirmation-question">Has the first client meeting taken place?</p>
      <p>{previewMode ? "This records a local preview confirmation and opens the transcript-and-notes screen. No backend milestone is changed." : "This records the meeting as completed and opens the meeting-input page."}</p>
      <div className="discovery-version-actions">
        <button className="btn btn-primary" type="button" autoFocus disabled={busy || checking || !ready} onClick={() => void continueToMeeting()}>{previewMode ? "Confirm preview and continue" : "Yes, complete meeting and continue"}</button>
        <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => { setConfirming(false); setError(null); window.requestAnimationFrame(() => trigger.current?.focus()); }}>Cancel</button>
      </div>
    </div> : null}
    <div className="discovery-version-actions">
      <button ref={trigger} className="btn btn-primary" type="button" disabled={!available || checking || busy || (!completed && !ready) || confirming}
        onClick={() => completed ? void continueToMeeting() : setConfirming(true)}>{completed ? "Continue to meeting inputs" : "Mark first meeting completed"}{previewMode ? " (preview)" : ""}</button>
      {error || preview.error ? <button className="btn btn-secondary" type="button" disabled={checking || busy} onClick={() => { setError(null); if (previewMode) preview.reload(); else setReload((value) => value + 1); }}>Retry meeting status</button> : null}
    </div>
  </section>;
}
