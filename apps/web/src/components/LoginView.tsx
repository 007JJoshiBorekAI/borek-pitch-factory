"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import {
  LOGIN_LANGUAGES,
  loginKeepSignedInHint,
  parseOAuthCallbackError,
  resolvePostAuthPath,
} from "@/lib/loginAuth";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

export function LoginView() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language] = useState<(typeof LOGIN_LANGUAGES)[number]["id"]>("en");

  useEffect(() => {
    const callbackError = parseOAuthCallbackError();
    if (callbackError) {
      setError(callbackError);
    }
  }, []);

  useEffect(() => {
    if (session) {
      router.replace(resolvePostAuthPath());
    }
  }, [router, session]);

  async function handleMicrosoftSignIn() {
    const client = getSupabaseBrowserClient();
    if (!client) {
      return;
    }
    setBusy(true);
    setError(null);
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

  if (authLoading) {
    return (
      <div className="figma-login-page" data-testid="figma-login-page">
        <aside className="figma-login-brand" aria-hidden="true">
          <BrandPanel />
        </aside>
        <main className="figma-login-auth">
          <div className="figma-login-auth-inner">
            <p className="figma-login-status" role="status" aria-live="polite">
              Checking your session…
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (session) {
    return (
      <div className="figma-login-page" data-testid="figma-login-page">
        <aside className="figma-login-brand" aria-hidden="true">
          <BrandPanel />
        </aside>
        <main className="figma-login-auth">
          <div className="figma-login-auth-inner">
            <p className="figma-login-status" role="status" aria-live="polite">
              Redirecting…
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="figma-login-page" data-testid="figma-login-page">
      <aside className="figma-login-brand" aria-label="Borek AI Pitch">
        <BrandPanel />
      </aside>

      <main className="figma-login-auth" aria-labelledby="figma-login-welcome">
        <div className="figma-login-auth-inner">
          {!isSupabaseConfigured() ? (
            <div className="figma-login-alert figma-login-alert-info" role="status">
              Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
              to <code>apps/web/.env.local</code>, then restart the dev server.
            </div>
          ) : null}

          <h1 id="figma-login-welcome" className="figma-login-welcome">
            Welcome
          </h1>
          <p className="figma-login-lead">Sign in with your Borek account to continue.</p>

          {error ? (
            <div className="figma-login-alert figma-login-alert-error" role="alert">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            className="figma-login-microsoft"
            data-testid="figma-login-microsoft"
            disabled={busy || !isSupabaseConfigured()}
            onClick={() => void handleMicrosoftSignIn()}
          >
            <Image
              src="/figma-01/microsoft-logo.png"
              alt=""
              width={20}
              height={20}
              aria-hidden
              className="figma-login-microsoft-icon"
            />
            <span>{busy ? "Please wait…" : "Continue with Microsoft"}</span>
          </button>

          <label className="figma-login-remember">
            <input
              type="checkbox"
              checked
              readOnly
              disabled
              aria-readonly="true"
              aria-label={loginKeepSignedInHint()}
              data-testid="figma-login-keep-signed-in"
            />
            <span>Keep me signed in on this device</span>
          </label>

          <hr className="figma-login-divider" />

          <div className="figma-login-language" data-testid="figma-login-language">
            <p className="figma-login-language-label">Language</p>
            <div className="figma-login-language-options" role="group" aria-label="Language">
              {LOGIN_LANGUAGES.map((option) =>
                option.supported && option.id === language ? (
                  <span
                    key={option.id}
                    className="figma-login-language-active"
                    aria-current="true"
                  >
                    {option.label}
                  </span>
                ) : (
                  <button
                    key={option.id}
                    type="button"
                    className="figma-login-language-option"
                    disabled
                    aria-disabled="true"
                    title="German UI is not available yet"
                    data-testid={`figma-login-language-${option.id}`}
                  >
                    {option.label}
                  </button>
                ),
              )}
            </div>
          </div>

          <p className="figma-login-support">Need access? Contact IT Support.</p>
        </div>
      </main>
    </div>
  );
}

function BrandPanel() {
  return (
    <>
      <div className="figma-login-artwork" aria-hidden="true">
        <Image
          src="/figma-01/login-powder-artwork.png"
          alt=""
          fill
          priority
          sizes="50vw"
          className="figma-login-artwork-image"
        />
      </div>
      <div className="figma-login-artwork-gradient" aria-hidden="true" />
      <div className="figma-login-brand-inner">
        <Image
          src="/figma-01/borek-logo-white.svg"
          alt="Borek Solutions Group"
          width={184}
          height={43}
          priority
          className="figma-login-logo"
        />
        <p className="figma-login-product">AI PITCH</p>
        <h2 className="figma-login-headline">
          Prepare the right
          <br />
          conversation.
        </h2>
        <p className="figma-login-subcopy">
          From client research to an approved follow-up,
          <br />
          all in one focused workspace.
        </p>
        <p className="figma-login-footer">Internal · Borek Solutions</p>
      </div>
    </>
  );
}
