"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { SiteHeader } from "@/components/SiteHeader";
import { useLanguage } from "@/components/LanguageProvider";
import { usePreviewJourney } from "@/components/PreviewJourneyProvider";
import { useAuth } from "@/components/AuthProvider";
import { isLocalUiPreviewAvailable } from "@/lib/uiPreview";
import {
  clientOpportunityHref,
  loadLiveClientDirectory,
  type ClientDirectoryItem,
  type ClientPhase,
} from "@/lib/clientDirectory";

type PhaseFilter = "all" | ClientPhase;

export function ClientDirectoryPanel() {
  const searchParams = useSearchParams();
  const { copy, language } = useLanguage();
  const { accessToken, ownerId, previewMode, loading } = useAuth();
  const { directoryItems, hydrated } = usePreviewJourney();
  const [retry, setRetry] = useState(0);
  const scope = `${ownerId}:${previewMode}:${language}:${retry}`;
  const [result, setResult] = useState<{ scope: string; items: ClientDirectoryItem[]; failed: boolean } | null>(null);
  const localPreview = previewMode && isLocalUiPreviewAvailable();
  useEffect(() => {
    if (loading || previewMode || !accessToken || !ownerId) return;
    const controller = new AbortController();
    void loadLiveClientDirectory(accessToken, language, controller.signal).then((items) => {
      if (!controller.signal.aborted) setResult({ scope, items, failed: false });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ scope, items: [], failed: true });
    });
    return () => controller.abort();
  }, [loading, previewMode, accessToken, ownerId, language, scope]);
  const pending = loading || (localPreview ? !hydrated : Boolean(accessToken && ownerId) && result?.scope !== scope);
  const failed = !pending && !localPreview && (!accessToken || !ownerId || result?.scope !== scope || result.failed);
  const items = localPreview ? directoryItems
    : !pending && !failed && result?.scope === scope ? result.items : [];
  const [query, setQuery] = useState("");
  const requestedPhase = searchParams.get("phase");
  const phase: PhaseFilter = requestedPhase === "pre_meeting" || requestedPhase === "post_meeting"
    ? requestedPhase
    : "all";
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const filtered = items.filter((item) => {
    const matchesPhase = phase === "all" || item.phase === phase;
    const matchesQuery = !deferredQuery ||
      item.company_name.toLowerCase().includes(deferredQuery) ||
      item.contact_person.toLowerCase().includes(deferredQuery) ||
      item.engagement_name.toLowerCase().includes(deferredQuery);
    return matchesPhase && matchesQuery;
  });

  return (
    <div className="app-workspace clients-workspace">
      <SiteHeader activeSection={phase === "all" ? "clients" : phase} />
      <main className="clients-main">
        <header className="clients-heading">
          <div>
            <p>{copy.clients.kicker}</p>
            <h2>{copy.clients.title}</h2>
            {!pending && !failed && <span>{items.length} {copy.clients.title.toLowerCase()} · {items.filter((item) => item.workflow_status !== "finalized").length} {copy.clients.activePitches}</span>}
          </div>
          <Link href="/opportunities/new/client-information" className="btn btn-primary">{copy.clients.add}</Link>
        </header>

        <div className="clients-controls">
          <label className="clients-search">
            <span className="sr-only">{copy.clients.search}</span>
            <input type="search" value={query} placeholder={copy.clients.search} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="clients-phase-filter" role="group" aria-label="Filter clients by meeting phase">
            {([
              ["all", copy.clients.all, "/clients"],
              ["pre_meeting", copy.clients.preMeeting, "/clients?phase=pre_meeting"],
              ["post_meeting", copy.clients.postMeeting, "/clients?phase=post_meeting"],
            ] as const).map(([value, label, href]) => (
              <Link key={value} href={href} className={phase === value ? "is-active" : undefined} aria-current={phase === value ? "page" : undefined}>{label}</Link>
            ))}
          </div>
        </div>

        {pending ? (
          <section className="clients-empty" role="status">{language === "de" ? "Kunden werden geladen..." : "Loading clients..."}</section>
        ) : failed ? (
          <section className="clients-empty" role="alert">
            <p>{language === "de" ? "Kunden konnten nicht geladen werden." : "Clients could not be loaded."}</p>
            <button type="button" className="btn btn-secondary" onClick={() => setRetry((value) => value + 1)}>{language === "de" ? "Erneut versuchen" : "Retry loading"}</button>
          </section>
        ) : items.length === 0 ? (
          <section className="clients-empty"><h3>{language === "de" ? "Noch keine Kunden" : "No clients yet"}</h3><p>{language === "de" ? "Erstellen Sie einen neuen Kunden, um zu beginnen." : "Add a new client to get started."}</p></section>
        ) : filtered.length > 0 ? (
          <div className="clients-table-wrap">
            <table className="clients-table">
              <thead><tr><th>{copy.clients.client}</th><th>{copy.clients.contact}</th><th>{copy.clients.workflow}</th><th>{copy.clients.activity}</th><th><span className="sr-only">Action</span></th></tr></thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.opportunity_id}>
                    <td data-label={copy.clients.client}><strong>{item.company_name}</strong><span>{item.engagement_name}</span></td>
                    <td data-label={copy.clients.contact}><strong>{item.contact_person}</strong><span>{item.contact_role}</span></td>
                    <td data-label={copy.clients.workflow}><span className={`clients-status is-${item.phase}`}><i aria-hidden="true" />{copy.workflow.statuses[item.workflow_status]}</span></td>
                    <td data-label={copy.clients.activity}><span>{item.last_activity === "Today" ? copy.clients.today : item.last_activity === "Yesterday" ? copy.clients.yesterday : item.last_activity}</span></td>
                    <td><Link href={clientOpportunityHref(item)} className="clients-open">{copy.clients.open}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <section className="clients-empty"><h3>{copy.clients.noMatch}</h3><p>{copy.clients.noMatchHelp}</p></section>
        )}
        {!pending && !failed && <p className="clients-count">{copy.clients.showing} {filtered.length} {copy.clients.of} {items.length} {copy.clients.title.toLowerCase()}</p>}
      </main>
    </div>
  );
}
