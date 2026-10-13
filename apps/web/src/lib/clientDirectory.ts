import { ApiRequestError, apiFetch } from "./api";
import { BACKEND_UUID } from "./backendOpportunityMap";
import { WORKFLOW_STATUS_CATALOG, type WorkflowStatus } from "./discoveryFirst";

export type ClientPhase = "pre_meeting" | "post_meeting";

export interface ClientDirectoryItem {
  opportunity_id: string;
  company_name: string;
  engagement_name: string;
  contact_person: string;
  contact_role: string;
  workflow_status: WorkflowStatus;
  phase: ClientPhase;
  last_activity: string;
  preview_fixture?: boolean;
}

export const CLIENT_DIRECTORY_FIXTURE: readonly ClientDirectoryItem[] = [
  {
    opportunity_id: "opp-acme",
    company_name: "Acme GmbH",
    engagement_name: "Multilingual customer operations",
    contact_person: "Mira Koch",
    contact_role: "COO",
    workflow_status: "client_information",
    phase: "pre_meeting",
    last_activity: "Today",
    preview_fixture: true,
  },
  {
    opportunity_id: "opp-nova",
    company_name: "Nova Retail",
    engagement_name: "Data platform modernization",
    contact_person: "Daniel Weber",
    contact_role: "CTO",
    workflow_status: "discovery_prepared",
    phase: "pre_meeting",
    last_activity: "3 min ago",
    preview_fixture: true,
  },
  {
    opportunity_id: "opp-karo",
    company_name: "Karo Mobility",
    engagement_name: "Service operations automation",
    contact_person: "Aisha Rahman",
    contact_role: "VP Operations",
    workflow_status: "transcript_added",
    phase: "post_meeting",
    last_activity: "Yesterday",
    preview_fixture: true,
  },
  {
    opportunity_id: "opp-lindner",
    company_name: "Lindner Health",
    engagement_name: "AI product discovery",
    contact_person: "Felix Krause",
    contact_role: "CIO",
    workflow_status: "client_information",
    phase: "pre_meeting",
    last_activity: "4 Sep",
    preview_fixture: true,
  },
  {
    opportunity_id: "opp-vela",
    company_name: "Vela Foods",
    engagement_name: "Quality assurance program",
    contact_person: "Anna Meier",
    contact_role: "COO",
    workflow_status: "ppt_1_ready",
    phase: "pre_meeting",
    last_activity: "2 Sep",
    preview_fixture: true,
  },
  {
    opportunity_id: "opp-nordstern",
    company_name: "Nordstern AG",
    engagement_name: "Dedicated development team",
    contact_person: "Leon Fischer",
    contact_role: "CEO",
    workflow_status: "owner_review",
    phase: "post_meeting",
    last_activity: "30 Aug",
    preview_fixture: true,
  },
];

export const CLIENT_STATUS_LABELS: Record<WorkflowStatus, string> = {
  client_information: "Client Information",
  discovery_prepared: "Discovery Prepared",
  ppt_1_ready: "PPT #1 Ready",
  first_meeting_completed: "First Meeting Completed",
  transcript_added: "Transcript Added",
  ppt_2_generated: "PPT #2 Generated",
  owner_review: "Owner Review",
  finalized: "Finalized",
};

export function clientOpportunityHref(item: ClientDirectoryItem): string {
  const section = item.workflow_status === "client_information"
    ? "client-information"
    : item.workflow_status === "discovery_prepared"
      ? "discovery"
      : item.workflow_status === "ppt_1_ready" || (item.workflow_status === "first_meeting_completed" && item.phase === "pre_meeting")
        ? "presentations"
        : item.workflow_status === "ppt_2_generated"
          ? "post-meeting-presentation"
          : item.workflow_status === "first_meeting_completed" || item.workflow_status === "transcript_added"
            ? "meeting"
            : item.workflow_status === "owner_review"
              ? "review"
              : "follow-up";
  return `/opportunities/${encodeURIComponent(item.opportunity_id)}/${section}`;
}

export async function loadLiveClientDirectory(token: string, locale: string, signal?: AbortSignal): Promise<ClientDirectoryItem[]> {
  const rows = await apiFetch<Array<{
    id: string; client_name: string; opportunity_name: string; updated_at: string;
    stage1_intake?: { poc_name?: string; poc_position?: string; sales_topic_description?: string } | null;
  }>>("/opportunities", token, { signal, cache: "no-store" });
  if (!Array.isArray(rows)) throw new ApiRequestError("The client list response is incomplete.", 502);
  return Promise.all(rows.map(async (row) => {
    if (!row || !BACKEND_UUID.test(row.id) || typeof row.client_name !== "string") {
      throw new ApiRequestError("The client list contains an invalid opportunity.", 502);
    }
    const workflow = await apiFetch<{
      opportunity_id: string; current_status: string; steps: Array<{ key: string; state: string }>;
    }>(`/opportunities/${row.id}/workflow-status`, token, { signal, cache: "no-store" });
    const status = workflow.current_status === "ppt1_ready" ? "ppt_1_ready"
      : workflow.current_status === "ppt2_generated" ? "ppt_2_generated" : workflow.current_status;
    const current = WORKFLOW_STATUS_CATALOG.find((entry) => entry.id === status);
    if (workflow.opportunity_id !== row.id || !current || !Array.isArray(workflow.steps)) {
      throw new ApiRequestError("The client workflow response is incomplete or mismatched.", 502);
    }
    const updated = new Date(row.updated_at);
    return {
      opportunity_id: row.id,
      company_name: row.client_name,
      engagement_name: row.stage1_intake?.sales_topic_description || row.opportunity_name || "",
      contact_person: row.stage1_intake?.poc_name || "-",
      contact_role: row.stage1_intake?.poc_position || "",
      workflow_status: current.id,
      // The backend's current status is the next incomplete step, not proof of meeting completion.
      phase: workflow.steps.some((step) => step.key === "first_meeting_completed" && step.state === "completed")
        ? "post_meeting" : "pre_meeting",
      last_activity: Number.isNaN(updated.getTime()) ? "-"
        : updated.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }),
    };
  }));
}
