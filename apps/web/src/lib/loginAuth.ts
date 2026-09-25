export type LoginLanguage = "en" | "de";

export const LOGIN_LANGUAGES: ReadonlyArray<{ id: LoginLanguage; label: string; supported: boolean }> =
  [
    { id: "en", label: "English", supported: true },
    { id: "de", label: "Deutsch", supported: false },
  ];

export function resolvePostAuthPath(search?: string | null): string {
  if (typeof window !== "undefined" && search === undefined) {
    search = window.location.search;
  }
  const next = new URLSearchParams(search ?? "").get("next")?.trim();
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return "/";
}

export function parseOAuthCallbackError(search?: string | null): string | null {
  if (typeof window !== "undefined" && search === undefined) {
    search = window.location.search;
  }
  const params = new URLSearchParams(search ?? "");
  const description = params.get("error_description")?.trim();
  if (description) {
    return description;
  }
  const code = params.get("error")?.trim();
  if (code) {
    return code.replaceAll("_", " ");
  }
  return null;
}

/** Supabase persists browser sessions automatically; there is no separate toggle. */
export function loginKeepSignedInHint(): string {
  return "Session persistence is managed automatically when you sign in with Microsoft.";
}
