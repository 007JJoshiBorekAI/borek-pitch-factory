import { isSupabaseConfigured } from "./supabase";

export type LoginLanguage = "en" | "de";

export type LoginAuthMode = "supabase" | "dev-demo" | "unconfigured";

export const LOGIN_LANGUAGES: ReadonlyArray<{ id: LoginLanguage; label: string; supported: boolean }> =
  [
    { id: "en", label: "English", supported: true },
    { id: "de", label: "Deutsch", supported: false },
  ];

export interface LoginAuthModeInput {
  supabaseConfigured?: boolean;
  devAccessToken?: string | null;
}

export function resolveLoginAuthMode(input: LoginAuthModeInput = {}): LoginAuthMode {
  const supabaseConfigured = input.supabaseConfigured ?? isSupabaseConfigured();
  if (supabaseConfigured) {
    return "supabase";
  }
  const devAccessToken =
    input.devAccessToken === undefined
      ? process.env.NEXT_PUBLIC_DEV_ACCESS_TOKEN?.trim() ?? ""
      : input.devAccessToken?.trim() ?? "";
  if (devAccessToken) {
    return "dev-demo";
  }
  return "unconfigured";
}

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
