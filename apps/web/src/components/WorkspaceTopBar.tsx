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

type TopBarPanel = "none" | "profile" | "notifications";

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
  const profileMenuId = useId();
  const notificationsPopoverId = useId();
  const notificationsTitleId = useId();
  const germanUnavailableId = useId();
  const [openPanel, setOpenPanel] = useState<TopBarPanel>("none");
  const profileRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  const profileOpen = openPanel === "profile";
  const notificationsOpen = openPanel === "notifications";

  useEffect(() => {
    if (openPanel === "none") {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (profileRef.current?.contains(target) || notificationsRef.current?.contains(target)) {
        return;
      }
      setOpenPanel("none");
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenPanel("none");
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openPanel]);

  function toggleProfile() {
    setOpenPanel((current) => (current === "profile" ? "none" : "profile"));
  }

  function toggleNotifications() {
    setOpenPanel((current) => (current === "notifications" ? "none" : "notifications"));
  }

  function closePanels() {
    setOpenPanel("none");
  }

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
            aria-label="Interface language"
          >
            <button
              type="button"
              className="workspace-lang-option workspace-lang-option-unavailable"
              disabled
              aria-disabled="true"
              aria-describedby={germanUnavailableId}
              title="German UI is not available yet"
            >
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
            <span id={germanUnavailableId} className="sr-only">
              German UI is not available yet
            </span>
          </div>

          <div className="workspace-notifications" ref={notificationsRef}>
            <button
              type="button"
              className="workspace-notifications-button"
              aria-expanded={notificationsOpen}
              aria-controls={notificationsPopoverId}
              aria-haspopup="dialog"
              aria-label="Notifications"
              onClick={toggleNotifications}
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

            {notificationsOpen ? (
              <div
                className="workspace-notifications-popover"
                id={notificationsPopoverId}
                role="dialog"
                aria-modal="false"
                aria-labelledby={notificationsTitleId}
              >
                <h2 className="workspace-notifications-popover-title" id={notificationsTitleId}>
                  Notifications
                </h2>
                <p className="workspace-notifications-popover-copy">
                  No notification feed is configured yet.
                </p>
                <Link
                  href="/activity"
                  className="workspace-notifications-popover-link"
                  onClick={closePanels}
                >
                  View activity log
                </Link>
              </div>
            ) : null}
          </div>

          <span className="workspace-topbar-utility-divider" aria-hidden="true" />

          <div className="workspace-profile" ref={profileRef}>
            <button
              type="button"
              className="workspace-profile-trigger"
              aria-expanded={profileOpen}
              aria-controls={profileMenuId}
              aria-haspopup="menu"
              onClick={toggleProfile}
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
              <div className="workspace-profile-menu" id={profileMenuId} role="menu">
                {email ? (
                  <p className="workspace-profile-menu-email" title={email}>
                    {email}
                  </p>
                ) : null}
                <Link
                  href="/"
                  className="workspace-profile-menu-link"
                  role="menuitem"
                  onClick={closePanels}
                >
                  Recent presentations
                </Link>
                <Link
                  href="/archive"
                  className="workspace-profile-menu-link"
                  role="menuitem"
                  onClick={closePanels}
                >
                  Archive
                </Link>
                <Link
                  href="/activity"
                  className="workspace-profile-menu-link"
                  role="menuitem"
                  onClick={closePanels}
                >
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
