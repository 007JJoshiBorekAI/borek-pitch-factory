"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuth } from "@/components/AuthProvider";
import { BrandLogo } from "@/components/BrandLogo";
import { useLanguage } from "@/components/LanguageProvider";

interface SiteHeaderProps {
  signedInEmail?: string | null;
  opportunityId?: string | null;
  onNewPresentation?: () => void;
  sidebarExtra?: ReactNode;
  activeSection?: "pre_meeting" | "post_meeting" | "clients";
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

export function SiteHeader({
  signedInEmail,
  sidebarExtra,
  activeSection,
}: SiteHeaderProps) {
  const pathname = usePathname();
  const { session, employee, previewMode } = useAuth();
  const { language, setLanguage, copy } = useLanguage();
  const navigation = [
    { id: "pre_meeting", href: "/opportunities/new/client-information", label: copy.sidebar.preMeeting },
    { id: "post_meeting", href: "/clients?phase=post_meeting", label: copy.sidebar.postMeeting },
    { id: "clients", href: "/clients", label: copy.sidebar.clients },
  ] as const;
  // The follow-up email has its own page title (Figma 416:877); every other pitch route keeps its title.
  const followUpEmail = /^\/opportunities\/[^/]+\/follow-up\/?$/.test(pathname);
  // The meeting-input page is the "Post-meeting" screen of the design (Figma 259:5).
  const postMeeting = /^\/opportunities\/[^/]+\/meeting\/?$/.test(pathname);
  const title = followUpEmail
    ? copy.header.followUpEmail
    : postMeeting
    ? copy.sidebar.postMeeting
    : pathname.startsWith("/opportunities/new/")
    ? copy.header.addClient
    : pathname.startsWith("/clients")
      ? copy.header.clients
    : pathname.startsWith("/opportunities/")
      ? copy.header.pitchGeneration
      : pathname.startsWith("/profile")
        ? copy.header.profile
        : "Pitch Factory";
  const email = signedInEmail ?? session?.user.email ?? employee?.email ?? (previewMode ? "preview@borek.local" : null);
  const name = displayNameFromEmail(email);

  return (
    <>
      <aside className="pitch-sidebar">
        <BrandLogo href="/clients" className="pitch-sidebar-brand" />
        <p className="pitch-sidebar-product">AI Pitch</p>
        <nav aria-label="Main navigation">
          <ul>
            {navigation.map((item) => (
              <li key={item.id} className={activeSection === item.id ? "active" : undefined}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        {sidebarExtra}
      </aside>
      <header className="pitch-topbar">
        <div className="pitch-topline">
          <div className="pitch-page-heading">
            <h1 className="pitch-page-title">{title}</h1>
            {followUpEmail ? <p className="pitch-page-subtitle">{copy.header.followUpEmailSubtitle}</p> : null}
          </div>
          <div className="pitch-header-actions">
            <div className="pitch-language-switch" role="group" aria-label={copy.language}>
              <button type="button" aria-pressed={language === "de"} onClick={() => setLanguage("de")}>DE</button>
              <button type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>EN</button>
            </div>
            {email ? (
              <Link href="/profile" className="pitch-user">
                <span className="pitch-avatar">{initialsFromName(name)}</span>
                <span className="pitch-user-name">{name}</span>
              </Link>
            ) : (
              <Link href="/login" className="pitch-signin">
                {copy.header.signIn}
              </Link>
            )}
          </div>
        </div>
        <div className="pitch-title-underline" aria-hidden="true" />
      </header>
    </>
  );
}
