export type WorkspaceNavSection = "pre-meeting" | "post-meeting" | "clients";

export interface WorkspaceNavItem {
  id: WorkspaceNavSection;
  label: string;
  href: string;
}

/** Figma sidebar navigation — node 304:193 */
export const WORKSPACE_NAV_ITEMS: WorkspaceNavItem[] = [
  { id: "pre-meeting", label: "Pre-meeting", href: "/upload" },
  { id: "post-meeting", label: "Post-meeting", href: "/deepening/review" },
  { id: "clients", label: "Clients", href: "/clients" },
];

const PRE_MEETING_PREFIXES = [
  "/upload",
  "/first-contact",
  "/framework-review",
  "/plan-preview",
  "/deck-center",
];

const POST_MEETING_PREFIXES = ["/deepening", "/followup-review"];

export function resolveActiveNavSection(pathname: string): WorkspaceNavSection | null {
  const path = normalizePath(pathname);
  if (path.startsWith("/clients")) {
    return "clients";
  }
  if (POST_MEETING_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return "post-meeting";
  }
  if (PRE_MEETING_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return "pre-meeting";
  }
  return null;
}

/** TopBar titles aligned with Figma TopBar component instances (node 30:179). */
export function resolveWorkspacePageTitle(pathname: string): string {
  const path = normalizePath(pathname);

  if (path === "/" || path.startsWith("/archive")) {
    return "Recent presentations";
  }
  if (path.startsWith("/upload")) {
    return "Add New Client";
  }
  if (path.startsWith("/first-contact")) {
    return "Pre-meeting";
  }
  if (
    path.startsWith("/framework-review") ||
    path.startsWith("/plan-preview") ||
    path.startsWith("/deck-center")
  ) {
    return "Pitch generation";
  }
  if (path.startsWith("/deepening")) {
    return "Post-meeting";
  }
  if (path.startsWith("/followup-review")) {
    return "Follow-up email";
  }
  if (path.startsWith("/clients")) {
    return "Clients";
  }
  if (path.startsWith("/activity")) {
    return "Activity log";
  }

  return "AI Pitch";
}

export function resolveUserInitials(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name ?? email ?? "").trim();
  if (!source) {
    return "?";
  }

  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

export function resolveUserDisplayName(
  displayName: string | null | undefined,
  email: string | null | undefined,
): string {
  const name = displayName?.trim();
  if (name) {
    return name;
  }
  if (email) {
    return email.split("@")[0] ?? email;
  }
  return "Signed in";
}

export function emailFromAccessToken(accessToken: string | null | undefined): string | null {
  if (!accessToken) {
    return null;
  }
  const parts = accessToken.split(".");
  if (parts.length < 2) {
    return null;
  }
  try {
    const base64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const json =
      typeof atob === "function"
        ? atob(base64)
        : Buffer.from(base64, "base64").toString("utf8");
    const payload = JSON.parse(json) as { email?: unknown };
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

function normalizePath(pathname: string): string {
  if (!pathname || pathname === "/") {
    return "/";
  }
  return pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
}
