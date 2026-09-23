"use client";

import { useEffect, useState } from "react";

import { AppPageHeader } from "@/components/AppPageHeader";
import { useAuth } from "@/components/AuthProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { assignEmployeeRole, listActivityLog, listEmployees } from "@/lib/api";
import {
  formatActivityAction,
  formatEmployeeRole,
  type ActivityLogEntry,
  type EmployeeRole,
  type EmployeeRoleRow,
} from "@/lib/employeeRoles";

export function ActivityLogPanel() {
  const { accessToken, employee, capabilities } = useAuth();
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [people, setPeople] = useState<EmployeeRoleRow[]>([]);
  const [documentId, setDocumentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(nextDocumentId = documentId) {
    if (!accessToken) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const logs = await listActivityLog(accessToken, {
        documentId: nextDocumentId.trim() || undefined,
      });
      setEntries(logs);
      if (capabilities.assign_roles) {
        setPeople(await listEmployees(accessToken));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load activity.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    // Load when the signed-in employee profile is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, employee?.user_id, capabilities.assign_roles]);

  async function handleRoleChange(userId: string, role: EmployeeRole, email: string) {
    if (!accessToken) {
      return;
    }
    setBusy(true);
    try {
      await assignEmployeeRole(accessToken, userId, role, email);
      await load();
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "Could not update role.");
      setBusy(false);
    }
  }

  return (
    <div className="app-workspace">
      <SiteHeader />
      <main className="app-shell app-workspace-body">
        <AppPageHeader
          kicker="Workspace"
          title="Activity"
          lead="Every generation, edit, login, and role change is recorded with the employee, time, and document ID."
        />

        {error ? <div className="alert alert-error">{error}</div> : null}

        <form
          className="activity-filter"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <label htmlFor="document-id">Document ID</label>
          <input
            id="document-id"
            value={documentId}
            onChange={(event) => setDocumentId(event.target.value)}
            placeholder="Filter by document or object id"
          />
          <button type="submit" className="btn btn-secondary" disabled={busy}>
            Filter
          </button>
        </form>

        <section className="card activity-table-card">
          <h2>Events</h2>
          {entries.length === 0 ? (
            <p className="upload-hint">{busy ? "Loading…" : "No activity yet for this view."}</p>
          ) : (
            <div className="activity-table-wrap">
              <table className="activity-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Employee</th>
                    <th>Action</th>
                    <th>Document ID</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{new Date(entry.timestamp).toLocaleString()}</td>
                      <td>{entry.actor_email || entry.actor_id}</td>
                      <td>{formatActivityAction(entry.action)}</td>
                      <td>
                        <code>{entry.document_id}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {capabilities.assign_roles ? (
          <section className="card">
            <h2>Employee roles</h2>
            <p className="upload-hint">
              Consultant generates and edits. Reviewer confirms and releases. Admin assigns roles
              and sees every employee&apos;s activity.
            </p>
            {people.length === 0 ? (
              <p className="upload-hint">No employee roles stored yet.</p>
            ) : (
              <div className="activity-table-wrap">
                <table className="activity-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((person) => (
                      <tr key={person.user_id}>
                        <td>{person.email || person.user_id}</td>
                        <td>
                          <select
                            aria-label={`Role for ${person.email || person.user_id}`}
                            value={person.role}
                            disabled={busy}
                            onChange={(event) =>
                              void handleRoleChange(
                                person.user_id,
                                event.target.value as EmployeeRole,
                                person.email,
                              )
                            }
                          >
                            <option value="consultant">Consultant</option>
                            <option value="reviewer">Reviewer</option>
                            <option value="releaser">Releaser</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : (
          <p className="upload-hint">
            Signed in as {formatEmployeeRole(employee?.role)}. You see your own activity.
          </p>
        )}
      </main>
    </div>
  );
}
