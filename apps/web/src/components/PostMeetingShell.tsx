"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { WORKFLOW_STATUS_CATALOG } from "@/lib/discoveryFirst";
import { loadPostMeetingWorkflow, postMeetingError, workflowCompleted, type PostMeetingWorkflow } from "@/lib/postMeeting";
import styles from "./post-meeting.module.css";

const PostMeetingContext = createContext<{
  workflow: PostMeetingWorkflow | null; refreshWorkflow: () => void; companyName: string; contactPerson: string;
}>({ workflow: null, refreshWorkflow: () => {}, companyName: "", contactPerson: "" });

export const usePostMeeting = () => useContext(PostMeetingContext);

export function PostMeetingPhaseNav({ opportunityId, active }: { opportunityId: string; active: "meeting" | "review" }) {
  const root = `/opportunities/${encodeURIComponent(opportunityId)}`;
  return <nav className={styles.phaseNav} aria-label="Post-meeting workspace">
    <Link href={`${root}/meeting`} aria-current={active === "meeting" ? "page" : undefined}><span>1</span><div><small>Meeting input</small><strong>Capture what changed</strong></div></Link>
    <Link href={`${root}/follow-up`} aria-current={active === "review" ? "page" : undefined}><span>2</span><div><small>Generate</small><strong>Documents &amp; review</strong></div></Link>
  </nav>;
}

export function PostMeetingShell({ opportunityId, companyName, contactPerson, children }: {
  opportunityId: string; companyName: string; contactPerson: string; children: ReactNode;
}) {
  const { ownerId, previewMode } = useAuth();
  return <PostMeetingSession key={`${opportunityId}:${previewMode}:${ownerId}`} opportunityId={opportunityId}
    companyName={companyName} contactPerson={contactPerson}>{children}</PostMeetingSession>;
}

function PostMeetingSession({ opportunityId, companyName, contactPerson, children }: {
  opportunityId: string; companyName: string; contactPerson: string; children: ReactNode;
}) {
  const { accessToken, previewMode } = useAuth();
  const pathname = usePathname();
  const [workflow, setWorkflow] = useState<PostMeetingWorkflow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [accessGranted, setAccessGranted] = useState(false);
  const live = Boolean(accessToken) && !previewMode;
  const root = `/opportunities/${encodeURIComponent(opportunityId)}`;

  useEffect(() => {
    if (!live || !accessToken) return;
    const controller = new AbortController();
    setError(null);
    setWorkflow(null);
    void loadPostMeetingWorkflow(accessToken, opportunityId, controller.signal).then((value) => {
      if (!controller.signal.aborted) {
        setWorkflow(value);
        setAccessGranted(workflowCompleted(value, "first_meeting_completed"));
      }
    }).catch((cause) => { if (!controller.signal.aborted) setError(postMeetingError(cause)); });
    return () => controller.abort();
  }, [accessToken, live, opportunityId, revision, pathname]);

  return <PostMeetingContext.Provider value={{ workflow, refreshWorkflow: () => setRevision((value) => value + 1), companyName, contactPerson }}>
    <div className="app-workspace discovery-workflow-shell">
      <SiteHeader opportunityId={opportunityId} activeSection="post_meeting" />
      <main className={`discovery-workflow-main ${styles.root}`}>
        {error ? <div className={styles.error} role="alert">{error} <button className="btn btn-secondary" onClick={() => setRevision((value) => value + 1)}>Retry workflow</button></div> : null}
        {live && !workflow && !error ? <p role="status">Loading workflow status...</p> : null}
        {live && accessGranted ? children : !error && (!live || workflow) ? <section className={styles.card} aria-labelledby="post-meeting-locked-title">
          <h1 id="post-meeting-locked-title">Complete the first meeting to continue</h1>
          <p>Post-meeting inputs unlock after you mark the first meeting completed on the pre-meeting presentation screen.</p>
          {!live ? <p>A signed-in API session is required. Layout preview cannot confirm meeting completion.</p> : null}
          <Link className="btn btn-primary" href={`${root}/presentations`}>Back to pre-meeting presentation</Link>
        </section> : null}
        {live && accessGranted ? <details className={styles.workflow}>
          <summary>Workflow checkpoints {workflow ? `(${workflow.steps.filter((step) => step.state === "completed").length}/8 completed)` : "(awaiting server status)"}</summary>
          <ol>{WORKFLOW_STATUS_CATALOG.map((step) => {
            const key = step.id.replace("ppt_1", "ppt1").replace("ppt_2", "ppt2");
            const status = workflow?.steps.find((entry) => entry.key === key)?.state;
            const route = step.id === "ppt_2_generated" ? "post-meeting-presentation" : step.route;
            return <li key={step.id}><span>{step.label}</span><small>{status ?? "Not loaded"}</small>{status === "completed" || status === "current" ? <Link href={`${root}/${route}`}>Open</Link> : null}</li>;
          })}</ol>
        </details> : null}
      </main>
    </div>
  </PostMeetingContext.Provider>;
}
