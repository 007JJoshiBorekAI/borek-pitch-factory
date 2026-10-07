"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useLanguage } from "@/components/LanguageProvider";
import { useAuth } from "@/components/AuthProvider";
import { ApiRequestError } from "@/lib/api";
import { clearPostAuthPath, rememberPostAuthPath, resolvePostAuthPath } from "@/lib/authMode";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export function AuthCard() {
  const router = useRouter();
  const { language, setLanguage, copy } = useLanguage();
  const { session, isAuthenticated, authMode, bypassIgnoredReason, startPreviewSession, startDevSession } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authCopy = copy.auth;

  useEffect(() => {
    if (!session && !isAuthenticated) return;
    const target = resolvePostAuthPath(window.location.search);
    clearPostAuthPath();
    router.replace(target);
  }, [isAuthenticated, router, session]);

  async function handleMicrosoftSignIn() {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setBusy(true);
    setError(null);
    // Supabase returns to /login only, so the requested page is kept in this tab until then.
    rememberPostAuthPath(new URLSearchParams(window.location.search).get("next"));
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

  async function handleDevSignIn() {
    setBusy(true);
    setError(null);
    try {
      await startDevSession();
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? authCopy.devRejected : authCopy.devUnreachable);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      {authMode === "dev" ? (
        <button
          type="button"
          className="btn btn-primary btn-block auth-microsoft"
          disabled={busy}
          onClick={() => void handleDevSignIn()}
        >
          {busy ? authCopy.wait : authCopy.devSignIn}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-block auth-microsoft"
          disabled={busy || authMode !== "supabase"}
          onClick={() => void handleMicrosoftSignIn()}
        >
          <span className="auth-microsoft-mark" aria-hidden="true"><span /><span /><span /><span /></span>
          {busy ? authCopy.wait : authCopy.continueMicrosoft}
        </button>
      )}
      {authMode === "supabase" ? (
        <label className="auth-remember">
          <input type="checkbox" defaultChecked />
          <span>{authCopy.remember}</span>
        </label>
      ) : null}
      {authMode === "dev" ? <p className="auth-availability" role="status">{authCopy.devNotice}</p> : null}
      {authMode === "preview" || authMode === "unconfigured" ? (
        <p className="auth-availability" role="status">{authCopy.unavailable}</p>
      ) : null}
      {bypassIgnoredReason ? <p className="auth-availability" role="status">{authCopy.bypassIgnored}</p> : null}
      {authMode === "preview" ? (
        <>
          <button
            type="button"
            className="btn btn-secondary btn-block auth-preview"
            onClick={() => startPreviewSession()}
          >
            {authCopy.previewOpen}
          </button>
          <p className="auth-availability">{authCopy.previewAvailable}</p>
        </>
      ) : null}
      <div className="auth-login-divider" aria-hidden="true" />
      <div className="auth-language" aria-label={copy.language}>
        <strong>{copy.language}</strong>
        <div>
          <button type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>English</button>
          <button type="button" aria-pressed={language === "de"} onClick={() => setLanguage("de")}>Deutsch</button>
        </div>
      </div>
      <p className="auth-support">{authCopy.support}</p>
    </div>
  );
}
