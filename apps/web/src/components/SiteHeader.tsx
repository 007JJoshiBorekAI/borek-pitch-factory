"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuth } from "@/components/AuthProvider";

interface SiteHeaderProps {
  signedInEmail?: string | null;
  opportunityId?: string | null;
  onNewPresentation?: () => void;
}

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/clients", label: "Clients" },
  { href: "/approvals", label: "Approvals" },
  { href: "/archive", label: "Library" },
] as const;

function pageTitle(pathname: string): string {
  if (pathname === "/") return "Pitch Factory";
  if (pathname.startsWith("/first-contact")) {
    return "Stage 1";
  }
  if (pathname.startsWith("/first-meeting") || pathname.startsWith("/opportunity") || pathname.startsWith("/create-pitch")) {
    return "Stage 2";
  }
  if (pathname.startsWith("/clients")) return "Clients";
  if (pathname.startsWith("/approvals")) return "Approvals";
  if (pathname.startsWith("/archive")) return "Library";
  if (pathname.startsWith("/activity")) return "Activity";
  if (pathname.startsWith("/profile")) return "Profile";
  if (pathname.startsWith("/upload")) return "Pitch Factory";
  if (pathname.startsWith("/framework-review")) return "Pitch review";
  if (pathname.startsWith("/plan-preview")) return "Meeting preparation";
  if (pathname.startsWith("/deck-center")) return "Pitch review";
  if (pathname.startsWith("/followup-review")) return "Follow-ups";
  return "Pitch Factory";
}

function isActive(pathname: string, href: string): boolean {
  const inStage =
    pathname.startsWith("/first-contact") ||
    pathname.startsWith("/first-meeting") ||
    pathname.startsWith("/opportunity") ||
    pathname.startsWith("/create-pitch");
  if (href === "/") return pathname === "/";
  if (href === "/clients") return pathname.startsWith("/clients") || inStage;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function displayNameFromEmail(email: string | null | undefined): string {
  if (!email) return "Signed in";
  const local = email.split("@")[0] ?? email;
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function initialsFromName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return letters.join("") || "B";
}

function LogoMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="4" cy="6" r="2" fill="#12224a" />
      <circle cx="10" cy="3" r="2" fill="#12224a" />
      <circle cx="16" cy="6" r="2" fill="#12224a" />
      <circle cx="4" cy="14" r="2" fill="#12224a" />
      <circle cx="10" cy="17" r="2" fill="#12224a" />
      <circle cx="16" cy="14" r="2" fill="#12224a" />
      <circle cx="10" cy="10" r="2" fill="#12224a" />
    </svg>
  );
}

export function SiteHeader({ signedInEmail }: SiteHeaderProps) {
  const pathname = usePathname();
  const { session, employee } = useAuth();
  const email = signedInEmail ?? session?.user.email ?? employee?.email ?? null;
  const name = displayNameFromEmail(email);

  return (
    <>
      <aside className="pitch-sidebar">
        <Link href="/" className="pitch-logo">
          <LogoMark />
          <span className="pitch-logo-name">BOREK</span>
        </Link>
        <div className="pitch-logo-sub">AI PITCH</div>
        {email ? (
          <Link href="/" className="pitch-btn-new">
            + New pitch
          </Link>
        ) : null}
        <nav aria-label="Main navigation">
          <ul>
            {NAV.map((item) => (
              <li key={item.href} className={isActive(pathname, item.href) ? "active" : undefined}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <header className="pitch-topbar">
        <div className="pitch-topline">
          <h1 className="pitch-page-title">{pageTitle(pathname)}</h1>
          <div className="pitch-header-actions">
            {email ? (
              <Link href="/activity" className="pitch-icon-btn" aria-label="Activity">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </Link>
            ) : null}
            {email ? (
              <Link href="/profile" className="pitch-user">
                <span className="pitch-avatar">{initialsFromName(name)}</span>
                <span className="pitch-user-name">{name}</span>
              </Link>
            ) : (
              <Link href="/login" className="pitch-signin">
                Sign in
              </Link>
            )}
          </div>
        </div>
        <div className="pitch-progress" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
      </header>
    </>
  );
}
