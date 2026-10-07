"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { usePreviewJourney } from "@/components/PreviewJourneyProvider";
import { canCompletePreviewMeeting, completePreviewMeetingAndGetRoute, previewMeetingStorageKey, readPreviewMeetingCompletion } from "@/lib/previewMeeting";
import { isLocalUiPreviewAvailable } from "@/lib/uiPreview";

export function usePreviewMeeting(opportunityId: string) {
  const { ownerId, previewMode } = useAuth();
  const { hydrated, getOpportunity } = usePreviewJourney();
  const opportunity = getOpportunity(opportunityId);
  const enabled = previewMode && hydrated && Boolean(ownerId) && isLocalUiPreviewAvailable() && opportunity?.client.source === "fixture";
  const scope = enabled && ownerId ? previewMeetingStorageKey(ownerId, opportunityId) : null;
  const [result, setResult] = useState<{ scope: string; completed: boolean; error: string | null } | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!scope) return;
    function load() {
      try {
        setResult({ scope: scope!, completed: readPreviewMeetingCompletion(window.localStorage, ownerId, opportunityId, true), error: null });
      } catch {
        setResult({ scope: scope!, completed: false, error: "Local preview storage is unavailable. Allow browser storage and retry." });
      }
    }
    load();
    const changed = (event: StorageEvent) => { if (event.key === scope || event.key === null) load(); };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [scope, ownerId, opportunityId, revision]);

  return {
    enabled,
    loading: Boolean(scope && result?.scope !== scope),
    completed: Boolean(scope && result?.scope === scope && result.completed),
    ready: enabled && canCompletePreviewMeeting(opportunity),
    error: scope && result?.scope === scope ? result.error : null,
    reload: () => setRevision((value) => value + 1),
    complete() {
      if (!enabled || !scope) throw new Error("This opportunity is not available in local preview mode.");
      const route = completePreviewMeetingAndGetRoute(window.localStorage, ownerId, getOpportunity(opportunityId), previewMode);
      setResult({ scope, completed: true, error: null });
      return route;
    },
  };
}
