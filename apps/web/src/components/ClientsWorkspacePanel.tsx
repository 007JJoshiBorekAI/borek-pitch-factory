"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { listOpportunities, listRecentWork } from "@/lib/api";
import {
  buildClientDirectory,
  filterClientDirectoryRows,
  summarizeClientDirectory,
  type ClientDirectoryRow,
  type ClientFilterCategory,
} from "@/lib/clientDirectory";

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function progressToneClass(tone: ClientDirectoryRow["progressTone"]): string {
  return `clients-progress-dot clients-progress-dot-${tone}`;
}

export function ClientsWorkspacePanel() {
  const { accessToken } = useAuth();
  const [rows, setRows] = useState<ClientDirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ClientFilterCategory>("all");
  const loadRequestId = useRef(0);

  const loadClients = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    if (!accessToken) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [opportunities, recentWork] = await Promise.all([
        listOpportunities(accessToken),
        listRecentWork(accessToken),
      ]);
      if (requestId === loadRequestId.current) {
        setRows(buildClientDirectory(opportunities, recentWork));
      }
    } catch {
      if (requestId === loadRequestId.current) {
        setError("Clients could not be loaded. Please try again.");
      }
    } finally {
      if (requestId === loadRequestId.current) {
        setLoading(false);
      }
    }
  }, [accessToken]);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  const summary = useMemo(() => summarizeClientDirectory(rows), [rows]);
  const filteredRows = useMemo(
    () => filterClientDirectoryRows(rows, query, filter),
    [rows, query, filter],
  );

  const hasClients = rows.length > 0;
  const hasMatches = filteredRows.length > 0;
  const showEmpty = !loading && !error && !hasClients;
  const showNoMatches = !loading && !error && hasClients && !hasMatches;

  return (
    <main className="app-shell app-workspace-body clients-workspace">
      <div className="clients-page">
        <header className="clients-header">
          <div className="clients-header-copy">
            <p className="clients-eyebrow">Clients</p>
            <h1 className="clients-title">Clients</h1>
            {!loading && !error ? (
              <p className="clients-summary">
                {summary.clientCount} {pluralize(summary.clientCount, "client", "clients")} ·{" "}
                {summary.activePitchCount}{" "}
                {pluralize(summary.activePitchCount, "active pitch", "active pitches")}
              </p>
            ) : null}
          </div>
          <Link href="/upload?new=1" className="clients-add-button">
            Add new client
          </Link>
        </header>

        <div className="clients-toolbar">
          <label className="clients-search">
            <span className="sr-only">Search clients</span>
            <span className="clients-search-icon" aria-hidden="true">
              ⌕
            </span>
            <input
              type="search"
              className="clients-search-input"
              placeholder="Search clients"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              disabled={loading || Boolean(error) || !hasClients}
            />
          </label>

          <div className="clients-filters" role="tablist" aria-label="Client filters">
            {(
              [
                ["all", "All clients"],
                ["pre-meeting", "Pre-meeting"],
                ["post-meeting", "Post-meeting"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={filter === value}
                className={[
                  "clients-filter-button",
                  filter === value ? "clients-filter-button-active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setFilter(value)}
                disabled={loading || Boolean(error) || !hasClients}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="clients-state clients-state-loading" aria-live="polite">
            <p>Loading clients…</p>
          </div>
        ) : null}

        {error ? (
          <div className="clients-state clients-state-error" role="alert">
            <p>{error}</p>
            <button type="button" className="clients-retry-button" onClick={() => void loadClients()}>
              Retry
            </button>
          </div>
        ) : null}

        {showEmpty ? (
          <div className="clients-state clients-state-empty">
            <h2>No clients yet</h2>
            <p>Create your first client and pitch to see them listed here.</p>
            <Link href="/upload?new=1" className="clients-add-button clients-add-button-inline">
              Add new client
            </Link>
          </div>
        ) : null}

        {showNoMatches ? (
          <div className="clients-state clients-state-empty">
            <h2>No matching clients</h2>
            <p>Try a different search term or filter.</p>
          </div>
        ) : null}

        {!loading && !error && hasMatches ? (
          <div className="clients-table-wrap">
            <table className="clients-table">
              <thead>
                <tr>
                  <th scope="col">Client</th>
                  <th scope="col">Contact</th>
                  <th scope="col">AI pitch workflow</th>
                  <th scope="col">Last activity</th>
                  <th scope="col">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.clientKey}>
                    <td>
                      <div className="clients-cell-client">
                        <span className="clients-cell-primary">{row.clientName}</span>
                        <span className="clients-cell-secondary">{row.opportunityContext}</span>
                      </div>
                    </td>
                    <td className="clients-cell-contact">{row.contact ?? "—"}</td>
                    <td className="clients-cell-progress">
                      <span className="clients-progress">
                        <span
                          className={progressToneClass(row.progressTone)}
                          aria-hidden="true"
                        />
                        <span>{row.progress}</span>
                      </span>
                    </td>
                    <td className="clients-cell-activity">{row.lastActivityLabel}</td>
                    <td className="clients-cell-action">
                      <Link
                        href={row.actionHref}
                        className={[
                          "clients-row-action",
                          row.actionLabel === "Create pitch" ? "clients-row-action-primary" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {row.actionLabel}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && !error && hasClients ? (
          <p className="clients-footer">
            Showing {filteredRows.length} of {summary.clientCount}{" "}
            {pluralize(summary.clientCount, "client", "clients")}
          </p>
        ) : null}
      </div>
    </main>
  );
}
