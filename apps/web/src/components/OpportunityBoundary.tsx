"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { usePreviewJourney } from "@/components/PreviewJourneyProvider";
import { ApiRequestError, resolveBackendOpportunityId } from "@/lib/api";
import { loadLiveOpportunity, opportunityAccessMode } from "@/lib/opportunityResolution";

export function OpportunityBoundary({ opportunityId, children }: { opportunityId: string; children: ReactNode }) {
  const { accessToken, previewMode, ownerId, loading } = useAuth();
  const { hydrated, getOpportunity, registerLiveOpportunity } = usePreviewJourney();
  const pathname = usePathname();
  const [retry, setRetry] = useState(0);
  const scope = `${ownerId}:${opportunityId}:${retry}`;
  const [result, setResult] = useState<{ scope: string; error: string | null } | null>(null);
  const backendId = resolveBackendOpportunityId(opportunityId);
  const known = getOpportunity(opportunityId);
  const mode = opportunityAccessMode(opportunityId, Boolean(known), Boolean(accessToken) && !previewMode, backendId);
  const registerRef = useRef(registerLiveOpportunity);
  registerRef.current = registerLiveOpportunity;
  const extrasRef = useRef(known?.client_extras);
  extrasRef.current = known?.client_extras;

  useEffect(() => {
    if (loading || !hydrated || mode !== "live" || !accessToken) return;
    const controller = new AbortController();
    void loadLiveOpportunity(accessToken, opportunityId, backendId, controller.signal).then((opportunity) => {
      if (controller.signal.aborted) return;
      registerRef.current({ ...opportunity, client_extras: extrasRef.current });
      setResult({ scope, error: null });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setResult({ scope, error: error instanceof ApiRequestError && (error.status === 404 || error.status === 403)
        ? "This opportunity was not found or is not available to your account."
        : "The opportunity could not be loaded. Check the API connection and retry." });
    });
    return () => controller.abort();
  }, [loading, hydrated, mode, accessToken, opportunityId, backendId, scope]);

  const creating = opportunityId === "new" && pathname === "/opportunities/new/client-information";
  if (loading || !hydrated || (!creating && mode === "live" && result?.scope !== scope)) {
    return <section className="workflow-standard-page" role="status">Loading opportunity...</section>;
  }
  const error = mode === "live" && result?.scope === scope ? result.error : null;
  if (!creating && (mode === "missing" || error)) {
    return <section className="workflow-standard-page" role="alert">
      <h1>Opportunity unavailable</h1>
      <p>{error ?? "This opportunity is not in your workspace. Create a client or open an existing opportunity from Clients."}</p>
      {error ? <button type="button" className="btn btn-secondary" onClick={() => setRetry((value) => value + 1)}>Retry loading</button> : null}
      <Link href="/clients" className="btn btn-primary">Back to clients</Link>
    </section>;
  }
  return children;
}
