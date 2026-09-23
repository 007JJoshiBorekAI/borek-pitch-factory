"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { JourneyStartPanel } from "@/components/JourneyStartPanel";
import { displayNameFromEmail, SiteHeader } from "@/components/SiteHeader";
import { useRecentWork } from "@/components/useRecentWork";
import { formatRecentDate, type RecentLifecycle, type RecentWorkItem } from "@/lib/recentPresentations";

const ATTENTION: RecentLifecycle[] = ["needs_review", "needs_attention"];

function greeting(name: string): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = name.split(" ")[0] || name;
  return `${part}, ${first}.`;
}

function statusColor(lifecycle: RecentLifecycle): string {
  if (lifecycle === "needs_attention") return "var(--pitch-red)";
  if (lifecycle === "needs_review") return "var(--pitch-navy)";
  if (lifecycle === "ready") return "var(--pitch-teal)";
  if (lifecycle === "analyzing" || lifecycle === "building_presentation") return "var(--pitch-orange)";
  return "var(--pitch-gray-400)";
}

function WorkActions({
  item,
  downloadingId,
  onDownload,
}: {
  item: RecentWorkItem;
  downloadingId: string | null;
  onDownload: (item: RecentWorkItem) => void;
}) {
  return (
    <div className="pitch-row-actions">
      <Link href={item.actionHref}>{item.actionLabel} →</Link>
      {item.downloadPath ? (
        <button
          type="button"
          className="pitch-text-button"
          disabled={downloadingId === item.opportunityId}
          onClick={() => onDownload(item)}
        >
          {downloadingId === item.opportunityId ? "Downloading..." : "Download PowerPoint"}
        </button>
      ) : null}
    </div>
  );
}

export function RecentPresentationsPanel() {
  const { items, loading, error, downloadingId, reload, downloadItem, email } = useRecentWork();
  const [showJourneyStart, setShowJourneyStart] = useState(false);
  const name = displayNameFromEmail(email);

  useEffect(() => {
    if (window.location.hash === "#journey-start" || new URLSearchParams(window.location.search).has("new")) {
      setShowJourneyStart(true);
    }
  }, []);

  useEffect(() => {
    if (showJourneyStart) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [showJourneyStart]);

  function openJourneyStart() {
    setShowJourneyStart(true);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  const attention = items.filter((item) => ATTENTION.includes(item.lifecycle));

  return (
    <div className="app-workspace recent-page">
      <SiteHeader signedInEmail={email} onNewPresentation={openJourneyStart} />
      <main className="app-shell app-workspace-body">
        <div className="pitch-greet-row">
          <div>
            <h2 className="pitch-greet">{greeting(name)}</h2>
            <p className="pitch-subtle">Here is the work that needs your attention.</p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            aria-expanded={showJourneyStart}
            aria-controls="journey-start"
            onClick={() => setShowJourneyStart((visible) => !visible)}
          >
            {showJourneyStart ? "Close" : "Add New Client"}
          </button>
        </div>

        {showJourneyStart ? <JourneyStartPanel heading="Start a new pitch" /> : null}

        {error ? (
          <div className="alert alert-error recent-error" role="alert">
            <span>{error}</span>
            <button type="button" className="btn btn-secondary" onClick={() => void reload()}>
              Try again
            </button>
          </div>
        ) : null}

        {loading ? (
          <section className="recent-state-card" aria-live="polite">
            <p>Loading your recent work...</p>
          </section>
        ) : null}

        {!loading && items.length === 0 && !error ? (
          <section className="recent-empty">
            <p className="recent-empty-kicker">No presentations yet</p>
            <h2>Build your first customer presentation</h2>
            <p>Start with the opportunity details, then upload one or more discovery transcripts.</p>
            <button type="button" className="btn btn-primary" onClick={openJourneyStart}>
              New presentation
            </button>
          </section>
        ) : null}

        {!loading && attention.length > 0 ? (
          <section aria-label="Needs attention">
            <div className="pitch-eyebrow">Needs attention</div>
            <div className="pitch-attn-list">
              {attention.map((item) => (
                <div className="pitch-attn-row" key={item.opportunityId}>
                  <span className="pitch-status-dot" style={{ background: statusColor(item.lifecycle) }} />
                  <span className="pitch-attn-client">{item.clientName}</span>
                  <span className="pitch-attn-desc">
                    {item.opportunityName} · {item.statusLabel}
                  </span>
                  <span className="pitch-attn-date">{formatRecentDate(item.updatedAt)}</span>
                  <WorkActions item={item} downloadingId={downloadingId} onDownload={(entry) => void downloadItem(entry)} />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {!loading && items.length > 0 ? (
          <section className="recent-list" aria-label="Recent presentations">
            <div className="pitch-eyebrow">Client workspaces</div>
            <div className="pitch-section-head">
              <h2 className="pitch-section-title">All clients</h2>
            </div>
            <table className="pitch-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Opportunity</th>
                  <th>Stage</th>
                  <th>Updated</th>
                  <th>Next action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.opportunityId}>
                    <td className="pitch-client-name">{item.clientName}</td>
                    <td>{item.opportunityName}</td>
                    <td>
                      <span className="pitch-status">
                        <span className="pitch-status-dot" style={{ background: statusColor(item.lifecycle) }} />
                        {item.statusLabel}
                      </span>
                    </td>
                    <td>{formatRecentDate(item.updatedAt)}</td>
                    <td>
                      <WorkActions item={item} downloadingId={downloadingId} onDownload={(entry) => void downloadItem(entry)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="pitch-footnote">
              {items.length} active workspace{items.length === 1 ? "" : "s"}
              {attention.length > 0 ? ` · ${attention.length} needing attention` : ""}
            </p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
