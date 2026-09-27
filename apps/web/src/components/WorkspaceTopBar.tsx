"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { SignOutButton } from "@/components/SignOutButton";
import {
  emailFromAccessToken,
  resolveUserDisplayName,
  resolveUserInitials,
} from "@/lib/workspaceShellNav";

interface WorkspaceTopBarProps {
  pageTitle: string;
  onMenuToggle?: () => void;
  menuExpanded?: boolean;
}

export function WorkspaceTopBar({ pageTitle, onMenuToggle, menuExpanded = false }: WorkspaceTopBarProps) {
  const { session, employee, accessToken } = useAuth();
  const email =
    session?.user.email ?? employee?.email ?? emailFromAccessToken(accessToken) ?? null;
  const profileName =
    typeof session?.user.user_metadata?.full_name === "string"
      ? session.user.user_metadata.full_name
      : null;
  const displayName = resolveUserDisplayName(profileName, email);
  const initials = resolveUserInitials(profileName, email);
  const menuId = useId();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!profileRef.current?.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setProfileOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [profileOpen]);

  return (
    <header className="workspace-topbar">
      <div className="workspace-topbar-row">
        {onMenuToggle ? (
          <button
            type="button"
            className="workspace-topbar-menu-button"
            aria-expanded={menuExpanded}
            aria-controls="workspace-sidebar"
            onClick={onMenuToggle}
          >
            Menu
          </button>
        ) : null}

        <h1 className="workspace-topbar-title">{pageTitle}</h1>

        <div className="workspace-topbar-actions">
          <div
            className="workspace-lang-switcher"
            role="group"
            aria-label="Language (localization not available yet)"
          >
            <button type="button" className="workspace-lang-option" disabled title="German localization coming soon">
              DE
            </button>
            <span className="workspace-lang-divider" aria-hidden="true" />
            <button
              type="button"
              className="workspace-lang-option workspace-lang-option-active"
              disabled
              aria-current="true"
              title="English is the current interface language"
            >
              EN
            </button>
          </div>

          <button
            type="button"
            className="workspace-notifications-button"
            disabled
            aria-label="Notifications (not available yet)"
            title="Notifications are not available yet"
          >
            <Image
              src="/workspace-notifications.svg"
              alt=""
              width={36}
              height={36}
              className="workspace-notifications-icon"
              aria-hidden
            />
          </button>

          <span className="workspace-topbar-utility-divider" aria-hidden="true" />

          <div className="workspace-profile" ref={profileRef}>
            <button
              type="button"
              className="workspace-profile-trigger"
              aria-expanded={profileOpen}
              aria-controls={menuId}
              onClick={() => setProfileOpen((open) => !open)}
            >
              <span className="workspace-profile-avatar" aria-hidden="true">
                {initials}
              </span>
              <span className="workspace-profile-name">{displayName}</span>
              <Image
                src="/workspace-chevron-down.svg"
                alt=""
                width={10}
                height={6}
                className="workspace-profile-chevron"
                aria-hidden
              />
            </button>

            {profileOpen ? (
              <div className="workspace-profile-menu" id={menuId} role="menu">
                {email ? (
                  <p className="workspace-profile-menu-email" title={email}>
                    {email}
                  </p>
                ) : null}
                <Link href="/" className="workspace-profile-menu-link" role="menuitem" onClick={() => setProfileOpen(false)}>
                  Recent presentations
                </Link>
                <Link href="/archive" className="workspace-profile-menu-link" role="menuitem" onClick={() => setProfileOpen(false)}>
                  Archive
                </Link>
                <Link href="/activity" className="workspace-profile-menu-link" role="menuitem" onClick={() => setProfileOpen(false)}>
                  Activity log
                </Link>
                <div className="workspace-profile-menu-signout">
                  <SignOutButton />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="workspace-topbar-splash" aria-hidden="true">
        <span className="workspace-topbar-splash-segment workspace-topbar-splash-tradition" />
        <span className="workspace-topbar-splash-segment workspace-topbar-splash-kumkum" />
        <span className="workspace-topbar-splash-segment workspace-topbar-splash-spirit" />
        <span className="workspace-topbar-splash-segment workspace-topbar-splash-happiness" />
      </div>
    </header>
  );
}
