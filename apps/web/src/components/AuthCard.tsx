"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import {
  DUPLICATE_EMAIL_MESSAGE,
  isDuplicateSignUpEmail,
  resolveSignUpErrorMessage,
} from "@/lib/authSignUp";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import { isEmployeeSsoOnly } from "@/lib/employeeRoles";

export type AuthMode = "sign-in" | "sign-up";

interface AuthCardProps {
  mode: AuthMode;
}

function resolvePostAuthPath(): string {
  if (typeof window === "undefined") {
    return "/";
  }
  const next = new URLSearchParams(window.location.search).get("next")?.trim();
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return "/";
}

export function AuthCard({ mode: initialMode }: AuthCardProps) {
  const router = useRouter();
  const { session } = useAuth();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const ssoOnly = isEmployeeSsoOnly();

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (session) {
      router.replace(resolvePostAuthPath());
    }
  }, [router, session]);

  if (!isSupabaseConfigured()) {
    return (
      <div className="auth-card">
        <div className="alert alert-info">
          Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{" "}
          <code>apps/web/.env.local</code>, then restart the dev server.
        </div>
      </div>
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const client = getSupabaseBrowserClient();
    if (!client) {
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);

    if (mode === "sign-in") {
      const { error: signInError } = await client.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (signInError) {
        setError(resolveSignUpErrorMessage(signInError.message));
        return;
      }
      router.push(resolvePostAuthPath());
      return;
    }

    const { data, error: signUpError } = await client.auth.signUp({ email, password });
    setBusy(false);
    if (signUpError) {
      setError(resolveSignUpErrorMessage(signUpError.message));
      return;
    }
    if (isDuplicateSignUpEmail(data.user)) {
      setError(DUPLICATE_EMAIL_MESSAGE);
      setMode("sign-in");
      return;
    }
    if (data.session) {
      router.push(resolvePostAuthPath());
      return;
    }
    setInfo("Account created. Confirm your email if required, then sign in.");
    setMode("sign-in");
  }

  async function handleMicrosoftSignIn() {
    const client = getSupabaseBrowserClient();
    if (!client) {
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    const redirectTo = `${window.location.origin}/login`;
    const { error: oauthError } = await client.auth.signInWithOAuth({
      provider: "azure",
      options: {
        redirectTo,
        scopes: "email",
        queryParams: { prompt: "select_account" },
      },
    });
    setBusy(false);
    if (oauthError) {
      setError(oauthError.message);
    }
  }

  if (session) {
    return (
      <div className="auth-card">
        <div className="auth-card-header">
          <h1>Redirecting…</h1>
          <p>Taking you to the app.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-card">
      {ssoOnly ? null : (
        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <Link
            href="/login"
            className={`auth-tab${mode === "sign-in" ? " auth-tab-active" : ""}`}
            role="tab"
            aria-selected={mode === "sign-in"}
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className={`auth-tab${mode === "sign-up" ? " auth-tab-active" : ""}`}
            role="tab"
            aria-selected={mode === "sign-up"}
          >
            Register
          </Link>
        </div>
      )}

      {error ? <div className="alert alert-error">{error}</div> : null}
      {info ? <div className="alert alert-info">{info}</div> : null}

      <button
        type="button"
        className="btn btn-primary btn-block auth-microsoft"
        disabled={busy}
        onClick={() => void handleMicrosoftSignIn()}
      >
        {busy ? "Please wait…" : "Sign in with Microsoft 365"}
      </button>

      {ssoOnly ? (
        <p className="auth-footer-note">Use your work Microsoft account. Password sign-in is disabled.</p>
      ) : (
        <>
          <div className="auth-divider" role="separator">
            <span>or use email</span>
          </div>
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="form-field">
              <label htmlFor="email">Work email</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                placeholder={mode === "sign-in" ? "Enter your password" : "At least 6 characters"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
              />
            </div>

            <button type="submit" className="btn btn-secondary btn-block" disabled={busy}>
              {busy ? "Please wait…" : mode === "sign-in" ? "Sign in with email" : "Create account"}
            </button>
          </form>

          <p className="auth-footer-note">
            {mode === "sign-in" ? (
              <>
                No account yet? <Link href="/register">Register</Link>
              </>
            ) : (
              <>
                Already have an account? <Link href="/login">Sign in</Link>
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}
