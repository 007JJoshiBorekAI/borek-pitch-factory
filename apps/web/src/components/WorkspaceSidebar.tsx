"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  WORKSPACE_NAV_ITEMS,
  resolveActiveNavSection,
  type WorkspaceNavSection,
} from "@/lib/workspaceShellNav";

interface WorkspaceSidebarProps {
  activeSection?: WorkspaceNavSection | null;
  mobileOpen?: boolean;
  onNavigate?: () => void;
}

export function WorkspaceSidebar({
  activeSection,
  mobileOpen = false,
  onNavigate,
}: WorkspaceSidebarProps) {
  const pathname = usePathname();
  const currentSection = activeSection ?? resolveActiveNavSection(pathname);

  return (
    <aside
      id="workspace-sidebar"
      className={["workspace-sidebar", mobileOpen ? "workspace-sidebar-open" : ""]
        .filter(Boolean)
        .join(" ")}
      aria-label="Workflow navigation"
    >
      <div className="workspace-sidebar-brand">
        <Link href="/upload" className="workspace-sidebar-logo" onClick={onNavigate}>
          <Image
            src="/borek-logo.svg"
            alt="Borek Solutions Group"
            width={112}
            height={26}
            className="workspace-sidebar-logo-image"
            priority
          />
        </Link>
        <p className="workspace-sidebar-product">AI PITCH</p>
      </div>

      <nav className="workspace-sidebar-nav" aria-label="Primary">
        {WORKSPACE_NAV_ITEMS.map((item) => {
          const isActive = currentSection === item.id;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={[
                "workspace-sidebar-link",
                isActive ? "workspace-sidebar-link-active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-current={isActive ? "page" : undefined}
              onClick={onNavigate}
            >
              {isActive ? <span className="workspace-sidebar-active-rail" aria-hidden="true" /> : null}
              <span className="workspace-sidebar-link-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <p className="workspace-sidebar-note">
        Choose. Create.
        <br />
        Review. Download.
      </p>
    </aside>
  );
}
