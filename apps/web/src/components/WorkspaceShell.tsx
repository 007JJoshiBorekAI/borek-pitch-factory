"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { WorkspaceTopBar } from "@/components/WorkspaceTopBar";
import {
  resolveActiveNavSection,
  resolveWorkspacePageTitle,
  type WorkspaceNavSection,
} from "@/lib/workspaceShellNav";

interface WorkspaceShellProps {
  children: React.ReactNode;
  pageTitle?: string;
  activeSection?: WorkspaceNavSection | null;
  className?: string;
}

export function WorkspaceShell({
  children,
  pageTitle,
  activeSection,
  className = "",
}: WorkspaceShellProps) {
  const pathname = usePathname();
  const resolvedTitle = pageTitle ?? resolveWorkspacePageTitle(pathname);
  const resolvedSection = activeSection ?? resolveActiveNavSection(pathname);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [mobileNavOpen]);

  const rootClassName = ["workspace-shell", "app-workspace", className].filter(Boolean).join(" ");

  return (
    <div className={rootClassName}>
      {mobileNavOpen ? (
        <button
          type="button"
          className="workspace-sidebar-backdrop"
          aria-label="Close navigation menu"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <WorkspaceSidebar
        activeSection={resolvedSection}
        mobileOpen={mobileNavOpen}
        onNavigate={() => setMobileNavOpen(false)}
      />

      <div className="workspace-main">
        <WorkspaceTopBar
          pageTitle={resolvedTitle}
          menuExpanded={mobileNavOpen}
          onMenuToggle={() => setMobileNavOpen((open) => !open)}
        />
        <div className="workspace-content">{children}</div>
      </div>
    </div>
  );
}
