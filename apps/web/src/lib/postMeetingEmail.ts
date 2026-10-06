import { apiFetch, resolveBackendOpportunityId } from "./api";
import { postMeetingPath, workflowCompleted, type PostMeetingWorkflow } from "./postMeeting";

export interface PostMeetingEmail {
  id: string; subject: string; body: string; updatedAt: string;
}

export function parsePostMeetingEmail(value: unknown, opportunityId: string): PostMeetingEmail | null {
  if (!value || typeof value !== "object") throw new Error("Invalid email draft response.");
  const envelope = value as Record<string, unknown>;
  if (envelope.opportunity_id !== resolveBackendOpportunityId(opportunityId) || envelope.journey_stage !== "deepening") {
    throw new Error("The email draft does not belong to this post-meeting opportunity.");
  }
  if (envelope.draft === null) return null;
  const draft = envelope.draft as { id?: unknown; updated_at?: unknown; selected_length?: unknown; lengths?: Record<string, { subject?: unknown; body?: unknown }> } | undefined;
  const length = draft?.selected_length === "short" || draft?.selected_length === "extensive" ? draft.selected_length : "medium";
  const text = draft?.lengths?.[length];
  if (typeof draft?.id !== "string" || typeof draft.updated_at !== "string" || typeof text?.subject !== "string" || typeof text.body !== "string") {
    throw new Error("The email draft is incomplete. Retry loading the draft.");
  }
  return { id: draft.id, subject: text.subject, body: text.body, updatedAt: draft.updated_at };
}

export async function loadPostMeetingEmail(token: string, opportunityId: string, signal?: AbortSignal) {
  return parsePostMeetingEmail(await apiFetch(postMeetingPath(opportunityId, "email-drafts?journey_stage=deepening"), token, { signal, cache: "no-store" }), opportunityId);
}

export function canPreparePostMeetingEmail(workflow: PostMeetingWorkflow | null) {
  return Boolean(workflow?.finalization && workflowCompleted(workflow, "owner_review") && workflowCompleted(workflow, "finalized"));
}
