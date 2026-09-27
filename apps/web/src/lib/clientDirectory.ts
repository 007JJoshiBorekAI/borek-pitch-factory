import type { ListedOpportunityResponse, RecentWorkApiSnapshot } from "./api";
import {
  actionHrefFor,
  latestActivityAt,
  lifecycleFor,
  snapshotsFromRecentWorkApi,
  type RecentLifecycle,
  type RecentWorkSnapshot,
} from "./recentPresentations";
import { hasStage1IntakeContent } from "./stage1Intake";

export type ClientProgressLabel =
  | "Pre-meeting"
  | "Generating pitch"
  | "Post-meeting"
  | "No active pitch"
  | "Follow-up ready";

export type ClientProgressTone =
  | "pre-meeting"
  | "generating"
  | "post-meeting"
  | "inactive"
  | "follow-up";

export type ClientFilterCategory = "all" | "pre-meeting" | "post-meeting";

export type ClientRowActionLabel = "Open" | "View" | "Create pitch";

export interface ClientDirectoryRow {
  clientKey: string;
  clientName: string;
  opportunityContext: string;
  contact: string | null;
  progress: ClientProgressLabel;
  progressTone: ClientProgressTone;
  lastActivityAt: string;
  lastActivityLabel: string;
  actionLabel: ClientRowActionLabel;
  actionHref: string;
  primaryOpportunityId: string;
  opportunityIds: string[];
  filterCategory: Exclude<ClientFilterCategory, "all">;
  isActivePitch: boolean;
}

export interface ClientDirectorySummary {
  clientCount: number;
  activePitchCount: number;
}

function normalizeClientKey(clientName: string): string {
  return clientName.trim().toLowerCase();
}

export function resolveClientContact(opportunity: ListedOpportunityResponse): string | null {
  const pocName = opportunity.stage1_intake?.poc_name?.trim();
  const pocPosition = opportunity.stage1_intake?.poc_position?.trim();
  if (pocName && pocPosition) {
    return `${pocName} · ${pocPosition}`;
  }
  if (pocName) {
    return pocName;
  }

  const contact = opportunity.additional_client_information?.contacts?.[0];
  if (!contact) {
    return null;
  }
  const contactName = contact.name?.trim();
  if (!contactName) {
    return null;
  }
  const contactRole = contact.role?.trim();
  return contactRole ? `${contactName} · ${contactRole}` : contactName;
}

function isGenerationJob(snapshot: RecentWorkSnapshot): boolean {
  const job = snapshot.job;
  if (!job || (job.status !== "QUEUED" && job.status !== "RUNNING")) {
    return false;
  }
  const jobType = job.job_type.toLowerCase();
  return (
    jobType.includes("stage1") ||
    jobType.includes("research") ||
    jobType.includes("framework") ||
    jobType.includes("plan") ||
    jobType.includes("presentation") ||
    jobType.includes("slide")
  );
}

export function mapClientProgress(
  snapshot: RecentWorkSnapshot,
  opportunity: ListedOpportunityResponse,
): { progress: ClientProgressLabel; tone: ClientProgressTone; filterCategory: Exclude<ClientFilterCategory, "all"> } {
  const lifecycle = lifecycleFor(snapshot);

  if (isGenerationJob(snapshot)) {
    return {
      progress: "Generating pitch",
      tone: "generating",
      filterCategory: "pre-meeting",
    };
  }

  if (snapshot.transcriptCount > 0) {
    if (snapshot.deck || lifecycle === "ready") {
      return {
        progress: "Follow-up ready",
        tone: "follow-up",
        filterCategory: "post-meeting",
      };
    }
    return {
      progress: "Post-meeting",
      tone: "post-meeting",
      filterCategory: "post-meeting",
    };
  }

  if (
    lifecycle === "draft" &&
    !hasStage1IntakeContent(opportunity.stage1_intake) &&
    !snapshot.frameworkStatus &&
    !snapshot.hasPlan &&
    !snapshot.presentationId
  ) {
    return {
      progress: "No active pitch",
      tone: "inactive",
      filterCategory: "pre-meeting",
    };
  }

  return {
    progress: "Pre-meeting",
    tone: "pre-meeting",
    filterCategory: "pre-meeting",
  };
}

export function mapClientAction(
  progress: ClientProgressLabel,
  snapshot: RecentWorkSnapshot,
  lifecycle: RecentLifecycle,
): { label: ClientRowActionLabel; href: string } {
  if (progress === "No active pitch") {
    return { label: "Create pitch", href: "/upload?new=1" };
  }

  const href = actionHrefFor(snapshot, lifecycle);
  if (progress === "Generating pitch") {
    return { label: "View", href };
  }

  return { label: "Open", href };
}

export function formatClientLastActivity(value: string, now = Date.now()): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return "—";
  }

  const diffMs = now - timestamp;
  const dayMs = 24 * 60 * 60 * 1000;
  if (diffMs < 60_000) {
    return "Just now";
  }
  if (diffMs < 60 * 60_000) {
    const minutes = Math.max(1, Math.round(diffMs / 60_000));
    return `${minutes} min ago`;
  }
  if (diffMs < dayMs) {
    return "Today";
  }
  if (diffMs < dayMs * 2) {
    return "Yesterday";
  }

  const date = new Date(timestamp);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]}`;
}

function snapshotFromListedOpportunity(
  opportunity: ListedOpportunityResponse,
  recent?: RecentWorkApiSnapshot,
): RecentWorkSnapshot {
  if (recent) {
    return snapshotsFromRecentWorkApi([recent])[0]!;
  }

  return {
    opportunity: {
      id: opportunity.id,
      client_name: opportunity.client_name,
      opportunity_name: opportunity.opportunity_name,
      created_by: opportunity.created_by,
      created_at: opportunity.created_at,
      updated_at: opportunity.updated_at,
    },
    transcriptCount: 0,
    hasPlan: false,
    activityAt: opportunity.updated_at || opportunity.created_at,
  };
}

function buildRowForOpportunity(
  opportunity: ListedOpportunityResponse,
  recentById: Map<string, RecentWorkApiSnapshot>,
): ClientDirectoryRow {
  const snapshot = snapshotFromListedOpportunity(opportunity, recentById.get(opportunity.id));
  const lifecycle = lifecycleFor(snapshot);
  const { progress, tone, filterCategory } = mapClientProgress(snapshot, opportunity);
  const action = mapClientAction(progress, snapshot, lifecycle);
  const lastActivityAt = latestActivityAt(
    snapshot.activityAt,
    snapshot.opportunity.updated_at,
    snapshot.opportunity.created_at,
  );

  return {
    clientKey: normalizeClientKey(opportunity.client_name),
    clientName: opportunity.client_name.trim(),
    opportunityContext: opportunity.opportunity_name.trim(),
    contact: resolveClientContact(opportunity),
    progress,
    progressTone: tone,
    lastActivityAt,
    lastActivityLabel: formatClientLastActivity(lastActivityAt),
    actionLabel: action.label,
    actionHref: action.href,
    primaryOpportunityId: opportunity.id,
    opportunityIds: [opportunity.id],
    filterCategory,
    isActivePitch: progress !== "No active pitch",
  };
}

function mergeRows(existing: ClientDirectoryRow, incoming: ClientDirectoryRow): ClientDirectoryRow {
  const lastActivityAt = latestActivityAt(existing.lastActivityAt, incoming.lastActivityAt);
  const primary =
    Date.parse(incoming.lastActivityAt) >= Date.parse(existing.lastActivityAt) ? incoming : existing;

  return {
    ...primary,
    lastActivityAt,
    lastActivityLabel: formatClientLastActivity(lastActivityAt),
    opportunityIds: [...new Set([...existing.opportunityIds, ...incoming.opportunityIds])],
    isActivePitch: existing.isActivePitch || incoming.isActivePitch,
  };
}

export function buildClientDirectory(
  opportunities: ListedOpportunityResponse[],
  recentWork: RecentWorkApiSnapshot[],
): ClientDirectoryRow[] {
  const recentById = new Map(recentWork.map((row) => [row.opportunity.id, row]));
  const grouped = new Map<string, ClientDirectoryRow>();

  for (const opportunity of opportunities) {
    const row = buildRowForOpportunity(opportunity, recentById);
    const existing = grouped.get(row.clientKey);
    grouped.set(row.clientKey, existing ? mergeRows(existing, row) : row);
  }

  return [...grouped.values()].sort(
    (left, right) => Date.parse(right.lastActivityAt) - Date.parse(left.lastActivityAt),
  );
}

export function summarizeClientDirectory(rows: ClientDirectoryRow[]): ClientDirectorySummary {
  return {
    clientCount: rows.length,
    activePitchCount: rows.filter((row) => row.isActivePitch).length,
  };
}

export function filterClientDirectoryRows(
  rows: ClientDirectoryRow[],
  query: string,
  filter: ClientFilterCategory,
): ClientDirectoryRow[] {
  const normalizedQuery = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter !== "all" && row.filterCategory !== filter) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    const haystack = [
      row.clientName,
      row.opportunityContext,
      row.contact ?? "",
      row.progress,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

export function clientDirectoryMatchesSearch(row: ClientDirectoryRow, query: string): boolean {
  return filterClientDirectoryRows([row], query, "all").length > 0;
}
