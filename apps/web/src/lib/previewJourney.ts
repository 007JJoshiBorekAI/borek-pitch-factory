import type { ClientDirectoryItem } from "./clientDirectory";
import type { ClientInformationRecord } from "./clientInformation";
import type { ClientInformationViewModel, WorkflowSnapshotViewModel } from "./discoveryFirst";
import type { DiscoveryWorkspaceVersion } from "./discoveryWorkspace";

export type PreviewPresentationState = "waiting" | "generating" | "ready" | "failed";

export interface PreviewPresentation {
  state: PreviewPresentationState;
  version_id: string | null;
  source_discovery_version_id: string | null;
  slide_count: number;
}

export interface PreviewOpportunity {
  opportunity_id: string;
  created_at: string;
  updated_at: string;
  client: ClientInformationRecord;
  discovery: DiscoveryWorkspaceVersion;
  presentation: PreviewPresentation;
  workflow: WorkflowSnapshotViewModel;
}

export interface PreviewJourneyState {
  schema_version: "1.0";
  opportunities: Record<string, PreviewOpportunity>;
}

export const PREVIEW_JOURNEY_STORAGE_KEY = "borek-preview-journey-v1";

export const EMPTY_PREVIEW_JOURNEY: PreviewJourneyState = {
  schema_version: "1.0",
  opportunities: {},
};

export function previewOpportunityId(companyName: string): string {
  const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "client";
  const suffix = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Date.now().toString(36);
  return `opp-${slug}-${suffix}`;
}

export function previewDirectoryItem(opportunity: PreviewOpportunity): ClientDirectoryItem {
  return {
    opportunity_id: opportunity.opportunity_id,
    company_name: opportunity.client.values.company_name,
    engagement_name: opportunity.client.values.meeting_purpose,
    contact_person: opportunity.client.values.contact_person,
    contact_role: "Primary contact",
    workflow_status: opportunity.workflow.current_status,
    phase: "pre_meeting",
    last_activity: "Today",
  };
}

export function previewClientRecord(
  opportunityId: string,
  values: ClientInformationViewModel,
): ClientInformationRecord {
  return {
    opportunity_id: opportunityId,
    revision: 1,
    values,
    source: "fixture",
  };
}

export function parsePreviewJourney(value: unknown): PreviewJourneyState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY_PREVIEW_JOURNEY;
  const row = value as Partial<PreviewJourneyState>;
  if (row.schema_version !== "1.0" || !row.opportunities || typeof row.opportunities !== "object") {
    return EMPTY_PREVIEW_JOURNEY;
  }
  return row as PreviewJourneyState;
}
