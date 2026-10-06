"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useLanguage } from "@/components/LanguageProvider";
import { useAuth } from "@/components/AuthProvider";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import { isLocalUiPreviewAvailable } from "@/lib/uiPreview";

function resolvePostAuthPath(): string {
  if (typeof window === "undefined") return "/clients";
  const next = new URLSearchParams(window.location.search).get("next")?.trim();
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/clients";
}

export function AuthCard() {
  const router = useRouter();
  const { language, setLanguage, copy } = useLanguage();
  const { session, isAuthenticated, startPreviewSession } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewAvailable, setPreviewAvailable] = useState(false);
  const authCopy = copy.auth;
  const configured = isSupabaseConfigured();

  useEffect(() => {
    setPreviewAvailable(!configured && isLocalUiPreviewAvailable());
    if (session || isAuthenticated) router.replace(resolvePostAuthPath());
  }, [configured, isAuthenticated, router, session]);

  async function handleMicrosoftSignIn() {
    if (previewAvailable) {
      startPreviewSession();
      router.push(resolvePostAuthPath());
      return;
    }
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setBusy(true);
    setError(null);
    const { error: oauthError } = await client.auth.signInWithOAuth({
      provider: "azure",
      options: {
        redirectTo: `${window.location.origin}/login`,
        scopes: "email",
        queryParams: { prompt: "select_account" },
      },
    });
    setBusy(false);
    if (oauthError) setError(oauthError.message);
  }

  return (
    <div className="auth-card">
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      <button
        type="button"
        className="btn btn-primary btn-block auth-microsoft"
        disabled={busy || (!configured && !previewAvailable)}
        onClick={() => void handleMicrosoftSignIn()}
      >
        <span className="auth-microsoft-mark" aria-hidden="true"><span /><span /><span /><span /></span>
        {busy ? authCopy.wait : authCopy.continueMicrosoft}
      </button>
      <label className="auth-remember">
        <input type="checkbox" defaultChecked />
        <span>{authCopy.remember}</span>
      </label>
      <div className="auth-login-divider" aria-hidden="true" />
      <div className="auth-language" aria-label={copy.language}>
        <strong>{copy.language}</strong>
        <div>
          <button type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>English</button>
          <button type="button" aria-pressed={language === "de"} onClick={() => setLanguage("de")}>Deutsch</button>
        </div>
      </div>
      <p className="auth-support">{authCopy.support}</p>
      {!configured ? (
        <p className="auth-availability" role="status">
          {previewAvailable ? authCopy.previewAvailable : authCopy.unavailable}
        </p>
      ) : null}
    </div>
  );
}
