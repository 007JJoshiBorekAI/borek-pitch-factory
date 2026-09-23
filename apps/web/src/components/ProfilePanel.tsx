"use client";

import Link from "next/link";

import { SignOutButton } from "@/components/SignOutButton";
import { displayNameFromEmail, initialsFromName, SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/components/AuthProvider";
import { formatEmployeeRole } from "@/lib/employeeRoles";

export function ProfilePanel() {
  const { session, employee } = useAuth();
  const email = session?.user.email ?? employee?.email ?? null;
  const name = displayNameFromEmail(email);
  const role = formatEmployeeRole(employee?.role);
  const capabilities = employee?.capabilities;

  return (
    <div className="app-workspace">
      <SiteHeader signedInEmail={email} />
      <main className="app-shell app-workspace-body">
        <p className="pitch-breadcrumb">Account / Profile</p>
        <div className="pitch-greet-row">
          <div>
            <h2 className="pitch-greet">{name}</h2>
            <p className="pitch-subtle">Your identity and access for this workspace.</p>
          </div>
        </div>

        <div className="pitch-profile-grid">
          <aside className="pitch-profile-card">
            <div className="pitch-avatar pitch-avatar-lg">{initialsFromName(name)}</div>
            <strong>{name}</strong>
            <p className="pitch-subtle">{role}</p>
            <div className="pitch-meta-block">
              <h3>Account</h3>
              <div className="pitch-meta-row">
                <span>Email</span>
                <span>{email ?? "Unavailable"}</span>
              </div>
              <div className="pitch-meta-row">
                <span>Role</span>
                <span>{role}</span>
              </div>
            </div>
          </aside>

          <section>
            <div className="pitch-eyebrow">Role permissions</div>
            <ul className="pitch-perm">
              <li>{capabilities?.generate ? "Generate pitches and follow-ups" : "Generation follows your assigned role"}</li>
              <li>{capabilities?.edit ? "Edit client workspaces" : "Editing follows your assigned role"}</li>
              <li>{capabilities?.confirm ? "Confirm work for release" : "Confirmation follows your assigned role"}</li>
              <li>{capabilities?.release ? "Release client-facing material" : "Client-facing release follows your assigned role"}</li>
            </ul>
            <p className="pitch-note">Role changes are handled by an administrator.</p>
          </section>

          <aside className="pitch-governance">
            <div className="pitch-eyebrow">Account</div>
            <div className="pitch-gov-row">
              <span>Activity logging</span>
              <span>Enabled</span>
            </div>
            <div className="pitch-gov-row">
              <span>Signed in as</span>
              <span>{email ?? name}</span>
            </div>
            <Link href="/activity" className="btn btn-secondary pitch-block-btn">
              View activity log →
            </Link>
            <SignOutButton />
          </aside>
        </div>
      </main>
    </div>
  );
}
