"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { completeFirstMeetingAndGetRoute } from "@/lib/firstMeetingHandoff";
import { loadPostMeetingWorkflow, postMeetingError, workflowCompleted, type PostMeetingWorkflow } from "@/lib/postMeeting";

export function FirstMeetingHandoff({ opportunityId, ppt1Ready }: { opportunityId: string; ppt1Ready: boolean }) {
  const { accessToken, previewMode } = useAuth();
  const router = useRouter();
  const live = Boolean(accessToken) && !previewMode;
  const [workflow, setWorkflow] = useState<PostMeetingWorkflow | null>(null);
  const [loading, setLoading] = useState(live);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const operation = useRef<AbortController | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const completed = workflowCompleted(workflow, "first_meeting_completed");
  const ready = ppt1Ready && workflowCompleted(workflow, "ppt1_ready");

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
    <strong id="meeting-handoff-title">{completed ? "First meeting completed" : "After your first client meeting"}</strong>
    <p>Confirm that the meeting took place to unlock transcript upload and personal notes.</p>
    {error ? <p className="client-information-error" role="alert">{error}</p> : null}
    {loading || busy ? <p role="status">{busy ? "Confirming meeting completion..." : "Checking meeting status..."}</p> : null}
    {!live ? <p className="discovery-version-label">A signed-in API session is required. Layout preview cannot record a completed meeting.</p> : !loading && !completed && !ready ? <p className="discovery-version-label">Generate a ready PPT #1 before confirming the first meeting.</p> : null}
    {confirming && !completed ? <div role="group" aria-labelledby="meeting-confirmation-question">
      <p id="meeting-confirmation-question">Has the first client meeting taken place?</p>
      <p>This records the meeting as completed and opens the meeting-input page.</p>
      <div className="discovery-version-actions">
        <button className="btn btn-primary" type="button" autoFocus disabled={busy || loading || !ready} onClick={() => void continueToMeeting()}>Yes, complete meeting and continue</button>
        <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => { setConfirming(false); setError(null); window.requestAnimationFrame(() => trigger.current?.focus()); }}>Cancel</button>
      </div>
    </div> : null}
    <div className="discovery-version-actions">
      <button ref={trigger} className="btn btn-primary" type="button" disabled={!live || loading || busy || (!completed && !ready) || confirming}
        onClick={() => completed ? void continueToMeeting() : setConfirming(true)}>{completed ? "Continue to meeting inputs" : "Mark first meeting completed"}</button>
      {error ? <button className="btn btn-secondary" type="button" disabled={loading || busy} onClick={() => setReload((value) => value + 1)}>Retry meeting status</button> : null}
    </div>
  </section>;
}
