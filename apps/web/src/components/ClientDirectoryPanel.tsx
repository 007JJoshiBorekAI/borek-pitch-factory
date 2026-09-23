"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { initialsFromName, SiteHeader } from "@/components/SiteHeader";
import { useRecentWork } from "@/components/useRecentWork";
import { formatRecentDate, type RecentLifecycle, type RecentWorkItem } from "@/lib/recentPresentations";

const PAGE_SIZE = 6;

function statusColor(lifecycle: RecentLifecycle): string {
  if (lifecycle === "needs_attention") return "var(--pitch-red)";
  if (lifecycle === "needs_review") return "var(--pitch-navy)";
  if (lifecycle === "ready") return "var(--pitch-teal)";
  if (lifecycle === "analyzing" || lifecycle === "building_presentation") return "var(--pitch-orange)";
  return "var(--pitch-gray-400)";
}

export function ClientDirectoryPanel() {
  const router = useRouter();
  const { items, loading, error, reload, email } = useRecentWork();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const statuses = useMemo(
    () => Array.from(new Set(items.map((item) => item.statusLabel))).sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery =
        needle.length === 0 ||
        item.clientName.toLowerCase().includes(needle) ||
        item.opportunityName.toLowerCase().includes(needle);
      const matchesStatus = status === "all" || item.statusLabel === status;
      return matchesQuery && matchesStatus;
    });
  }, [items, query, status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  function openNewClient() {
    router.push("/");
  }

  return (
    <div className="app-workspace">
      <SiteHeader signedInEmail={email} />
      <main className="app-shell app-workspace-body">
        <div className="pitch-greet-row">
          <div>
            <h2 className="pitch-greet">Clients</h2>
            <p className="pitch-subtle">
              View and manage every client relationship and active engagement in one place.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={openNewClient}>
            Add New Client
          </button>
        </div>

        {error ? (
          <div className="alert alert-error recent-error" role="alert">
            <span>{error}</span>
            <button type="button" className="btn btn-secondary" onClick={() => void reload()}>
              Try again
            </button>
          </div>
        ) : null}

        <div className="pitch-eyebrow">Client directory</div>
        <div className="pitch-section-head">
          <h2 className="pitch-section-title">All clients</h2>
          <span className="pitch-count">{filtered.length} clients</span>
        </div>

        <div className="pitch-toolbar">
          <input
            className="pitch-search"
            type="search"
            value={query}
            placeholder="Search by client or opportunity"
            aria-label="Search clients"
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
          <select
            className="pitch-select"
            aria-label="Filter by status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">All statuses</option>
            {statuses.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <section className="recent-state-card" aria-live="polite">
            <p>Loading your recent work...</p>
          </section>
        ) : null}

        {!loading && visible.length === 0 && !error ? (
          <section className="recent-empty">
            <h2>{items.length === 0 ? "No clients yet" : "No clients match"}</h2>
            <p>
              {items.length === 0
                ? "Add a client to start a presentation."
                : "Try a different name or status."}
            </p>
          </section>
        ) : null}

        {!loading && visible.length > 0 ? (
          <table className="pitch-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Opportunity</th>
                <th>Status</th>
                <th>Last activity</th>
                <th>Open</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item: RecentWorkItem) => (
                <tr key={item.opportunityId}>
                  <td>
                    <div className="pitch-client-cell">
                      <div className="pitch-initials">{initialsFromName(item.clientName)}</div>
                      <div className="pitch-client-name">{item.clientName}</div>
                    </div>
                  </td>
                  <td>{item.opportunityName}</td>
                  <td>
                    <span className="pitch-status">
                      <span className="pitch-status-dot" style={{ background: statusColor(item.lifecycle) }} />
                      {item.statusLabel}
                    </span>
                  </td>
                  <td>{formatRecentDate(item.updatedAt)}</td>
                  <td>
                    <Link href={`/first-contact?opportunityId=${encodeURIComponent(item.opportunityId)}`}>Open →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {!loading && filtered.length > PAGE_SIZE ? (
          <div className="pitch-footer-row">
            <span className="pitch-footnote">
              Showing {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length} clients
            </span>
            <div className="pitch-pagination">
              <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
                Previous
              </button>
              <span className="active">{currentPage}</span>
              <button
                type="button"
                disabled={currentPage === pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
