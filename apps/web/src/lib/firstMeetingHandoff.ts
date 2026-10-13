import { apiFetch, resolveBackendOpportunityId } from "./api";
import { loadPostMeetingWorkflow, postMeetingPath, workflowCompleted, type PostMeetingWorkflow } from "./postMeeting";

export async function completeFirstMeetingAndGetRoute(token: string, opportunityId: string, signal?: AbortSignal) {
  const current = await loadPostMeetingWorkflow(token, opportunityId, signal);
  signal?.throwIfAborted();
  if (!workflowCompleted(current, "first_meeting_completed")) {
    if (!workflowCompleted(current, "ppt1_ready") || !current.documents.ppt1?.latest_ready_version_id) {
      throw new Error("Master Presentation V1 must be ready before you can mark the first meeting completed.");
    }
    const confirmed = await apiFetch<PostMeetingWorkflow>(postMeetingPath(opportunityId, "workflow/first-meeting-completed"), token, { method: "POST", signal });
    signal?.throwIfAborted();
    if (confirmed.opportunity_id !== resolveBackendOpportunityId(opportunityId) || !Array.isArray(confirmed.steps) ||
        !workflowCompleted(confirmed, "first_meeting_completed")) {
      throw new Error("The server has not confirmed meeting completion for this pitch. Retry to check its saved status.");
    }
  }
  return `/opportunities/${encodeURIComponent(opportunityId)}/meeting`;
}
