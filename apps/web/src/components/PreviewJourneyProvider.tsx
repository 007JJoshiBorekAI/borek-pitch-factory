"use client";

import { createContext, useContext, useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import type { ClientDirectoryItem } from "@/lib/clientDirectory";
import { normalizeClientInformation, normalizeClientInformationExtras, type ClientInformationExtras, type ClientInformationRecord } from "@/lib/clientInformation";
import type { ClientInformationViewModel, WorkflowSnapshotViewModel } from "@/lib/discoveryFirst";
import { createDiscoveryWorkspaceFixture, type DiscoveryWorkspaceVersion } from "@/lib/discoveryWorkspace";
import {
  EMPTY_PREVIEW_JOURNEY,
  parsePreviewJourney,
  previewClientRecord,
  previewDirectoryItem,
  previewOpportunityId,
  previewJourneyStorageKey,
  withApprovedDiscovery,
  withPresentationAdvanced,
  withPresentationCompleted,
  withPresentationStarted,
  withUpdatedDiscovery,
  type PreviewJourneyState,
  type PreviewOpportunity,
} from "@/lib/previewJourney";
import { isLocalUiPreviewAvailable } from "@/lib/uiPreview";

interface PreviewJourneyContextValue {
  hydrated: boolean;
  opportunities: PreviewOpportunity[];
  directoryItems: ClientDirectoryItem[];
  getOpportunity: (opportunityId: string) => PreviewOpportunity | null;
  createOpportunity: (values: ClientInformationViewModel, extras: ClientInformationExtras) => PreviewOpportunity;
  updateClient: (record: ClientInformationRecord) => void;
  updateDiscovery: (version: DiscoveryWorkspaceVersion) => void;
  approveDiscovery: (version: DiscoveryWorkspaceVersion) => void;
  startPresentation: (opportunityId: string) => void;
  advancePresentation: (opportunityId: string) => void;
  completePresentation: (opportunityId: string) => void;
}

const PreviewJourneyContext = createContext<PreviewJourneyContextValue | null>(null);

function workflow(
  revision: number,
  current_status: WorkflowSnapshotViewModel["current_status"],
  completed_statuses: WorkflowSnapshotViewModel["completed_statuses"],
): WorkflowSnapshotViewModel {
  return { revision, current_status, completed_statuses, blocked_reason: null, available_actions: [] };
}

export function PreviewJourneyProvider({ children }: { children: React.ReactNode }) {
  const { previewMode, session } = useAuth();
  const ownerId = session?.user.id ?? (previewMode ? "local-preview" : null);
  const [state, setState] = useState<PreviewJourneyState>(EMPTY_PREVIEW_JOURNEY);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!ownerId || !isLocalUiPreviewAvailable()) {
      setState(EMPTY_PREVIEW_JOURNEY);
      setHydrated(true);
      return;
    }
    try {
      setState(parsePreviewJourney(JSON.parse(window.localStorage.getItem(previewJourneyStorageKey(ownerId)) ?? "null")));
    } catch {
      setState(EMPTY_PREVIEW_JOURNEY);
    }
    setHydrated(true);
  }, [ownerId]);

  function commit(update: (current: PreviewJourneyState) => PreviewJourneyState) {
    setState((current) => {
      const next = update(current);
      if (ownerId && isLocalUiPreviewAvailable()) {
        window.localStorage.setItem(previewJourneyStorageKey(ownerId), JSON.stringify(next));
      }
      return next;
    });
  }

  function replaceOpportunity(opportunity: PreviewOpportunity) {
    commit((current) => ({
      ...current,
      opportunities: { ...current.opportunities, [opportunity.opportunity_id]: opportunity },
    }));
  }

  function getOpportunity(opportunityId: string) {
    return state.opportunities[opportunityId] ?? null;
  }

  function createOpportunity(values: ClientInformationViewModel, extras: ClientInformationExtras): PreviewOpportunity {
    const normalized = normalizeClientInformation(values);
    const opportunityId = previewOpportunityId(normalized.company_name);
    const now = new Date().toISOString();
    const baseDiscovery = createDiscoveryWorkspaceFixture(opportunityId);
    const discovery: DiscoveryWorkspaceVersion = {
      ...baseDiscovery,
      pages: baseDiscovery.pages.map((page) => {
        if (page.id === "cover") {
          return { ...page, title: `${normalized.company_name} Discovery Paper`, body: `Prepared for the first conversation with ${normalized.company_name}.` };
        }
        if (page.id === "client_context") {
          return { ...page, body: normalized.additional_information || `${normalized.company_name} context will be validated during the first meeting.` };
        }
        if (page.id === "opportunity") {
          return { ...page, body: normalized.meeting_purpose };
        }
        return page;
      }),
    };
    const opportunity: PreviewOpportunity = {
      opportunity_id: opportunityId,
      created_at: now,
      updated_at: now,
      client: previewClientRecord(opportunityId, normalized),
      client_extras: normalizeClientInformationExtras(extras),
      discovery,
      presentation: { state: "waiting", version_id: null, source_discovery_version_id: null, slide_count: 0 },
      workflow: workflow(1, "client_information", []),
    };
    replaceOpportunity(opportunity);
    return opportunity;
  }

  function updateClient(record: ClientInformationRecord) {
    const current = getOpportunity(record.opportunity_id);
    if (!current) return;
    replaceOpportunity({ ...current, client: record, updated_at: new Date().toISOString() });
  }

  function updateDiscovery(version: DiscoveryWorkspaceVersion) {
    const current = getOpportunity(version.opportunity_id);
    if (!current) return;
    replaceOpportunity({ ...withUpdatedDiscovery(current, version), updated_at: new Date().toISOString() });
  }

  function approveDiscovery(version: DiscoveryWorkspaceVersion) {
    const current = getOpportunity(version.opportunity_id);
    if (!current) return;
    replaceOpportunity({ ...withApprovedDiscovery(current, version), updated_at: new Date().toISOString() });
  }

  function startPresentation(opportunityId: string) {
    const current = getOpportunity(opportunityId);
    if (!current) return;
    replaceOpportunity({ ...withPresentationStarted(current), updated_at: new Date().toISOString() });
  }

  function completePresentation(opportunityId: string) {
    const current = getOpportunity(opportunityId);
    if (!current || current.presentation.state !== "generating") return;
    replaceOpportunity({ ...withPresentationCompleted(current), updated_at: new Date().toISOString() });
  }

  function advancePresentation(opportunityId: string) {
    const current = getOpportunity(opportunityId);
    if (!current || current.presentation.state !== "generating") return;
    replaceOpportunity({ ...withPresentationAdvanced(current), updated_at: new Date().toISOString() });
  }

  const opportunities = Object.values(state.opportunities).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return (
    <PreviewJourneyContext.Provider value={{
      hydrated,
      opportunities,
      directoryItems: opportunities.map(previewDirectoryItem),
      getOpportunity,
      createOpportunity,
      updateClient,
      updateDiscovery,
      approveDiscovery,
      startPresentation,
      advancePresentation,
      completePresentation,
    }}>
      {children}
    </PreviewJourneyContext.Provider>
  );
}

export function usePreviewJourney(): PreviewJourneyContextValue {
  const value = useContext(PreviewJourneyContext);
  if (!value) throw new Error("PreviewJourneyProvider is missing.");
  return value;
}
