"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { downloadPresentationFile, listRecentWork } from "@/lib/api";
import { buildDownloadFilename } from "@/lib/deckCenter";
import {
  buildRecentWorkItems,
  snapshotsFromRecentWorkApi,
  type RecentWorkItem,
} from "@/lib/recentPresentations";

export function useRecentWork() {
  const { accessToken, session } = useAuth();
  const [items, setItems] = useState<RecentWorkItem[]>([]);
  const [itemsAuthScope, setItemsAuthScope] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const loadRequestId = useRef(0);
  const currentUserId = session?.user.id;
  const authScope = currentUserId ?? accessToken;
  const visibleItems = authScope && itemsAuthScope === authScope ? items : [];

  const loadRecent = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    if (!accessToken || !authScope) {
      setItems([]);
      setItemsAuthScope(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const snapshots = snapshotsFromRecentWorkApi(await listRecentWork(accessToken));
      if (requestId === loadRequestId.current) {
        setItems(buildRecentWorkItems(snapshots, currentUserId));
        setItemsAuthScope(authScope);
      }
    } catch {
      if (requestId === loadRequestId.current) {
        setError("Recent presentations could not be loaded. Please try again.");
      }
    } finally {
      if (requestId === loadRequestId.current) {
        setLoading(false);
      }
    }
  }, [accessToken, authScope, currentUserId]);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  async function downloadItem(item: RecentWorkItem) {
    if (!accessToken || !item.downloadPath) {
      return;
    }
    setDownloadingId(item.opportunityId);
    setError(null);
    try {
      const blob = await downloadPresentationFile(accessToken, item.downloadPath);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = buildDownloadFilename(
        item.presentationName ?? item.opportunityName,
        "pptx",
      );
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("The PowerPoint download is not available right now. Open the presentation to retry.");
    } finally {
      setDownloadingId(null);
    }
  }

  return {
    items: visibleItems,
    loading,
    error,
    downloadingId,
    reload: loadRecent,
    downloadItem,
    email: session?.user.email ?? null,
  };
}
