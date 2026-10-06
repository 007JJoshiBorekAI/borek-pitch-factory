"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { getEmployeeMe, recordEmployeeSession } from "@/lib/api";
import { syncAuthOwner } from "@/lib/authSession";
import { EMPTY_CAPABILITIES, type EmployeeMe } from "@/lib/employeeRoles";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { isLocalUiPreviewAvailable } from "@/lib/uiPreview";

interface AuthContextValue {
  session: Session | null;
  accessToken: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  employee: EmployeeMe | null;
  capabilities: EmployeeMe["capabilities"];
  previewMode: boolean;
  startPreviewSession: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  accessToken: null,
  loading: true,
  isAuthenticated: false,
  employee: null,
  capabilities: EMPTY_CAPABILITIES,
  previewMode: false,
  startPreviewSession: () => undefined,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<EmployeeMe | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const loginRecorded = useRef<string | null>(null);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      if (isLocalUiPreviewAvailable()) {
        setPreviewMode(window.sessionStorage.getItem("borek-ui-preview") === "true");
      }
      setLoading(false);
      return;
    }

    void client.auth.getSession().then(({ data }) => {
      syncAuthOwner(data.session?.user.id ?? null);
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      syncAuthOwner(nextSession?.user.id ?? null);
      setSession(nextSession);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const devToken = process.env.NEXT_PUBLIC_DEV_ACCESS_TOKEN?.trim() || null;
  // TEMPORARY: with NEXT_PUBLIC_BYPASS_LOGIN the API (AUTH_BYPASS=true) ignores the token value.
  const bypassToken = process.env.NEXT_PUBLIC_BYPASS_LOGIN === "true" ? "dev-bypass" : null;
  const accessToken = session?.access_token ?? devToken ?? bypassToken;

  function startPreviewSession() {
    if (!isLocalUiPreviewAvailable() || getSupabaseBrowserClient()) {
      return;
    }
    window.sessionStorage.setItem("borek-ui-preview", "true");
    setPreviewMode(true);
    setLoading(false);
  }

  useEffect(() => {
    if (!accessToken) {
      setEmployee(null);
      loginRecorded.current = null;
      return;
    }
    let cancelled = false;
    void getEmployeeMe(accessToken)
      .then((profile) => {
        if (!cancelled) {
          setEmployee(profile);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEmployee(null);
        }
      });
    const ownerKey = session?.user.id ?? "dev";
    if (loginRecorded.current !== ownerKey) {
      loginRecorded.current = ownerKey;
      void recordEmployeeSession(accessToken).catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [accessToken, session?.user.id]);

  const value = useMemo<AuthContextValue>(() => {
    return {
      session,
      accessToken,
      loading,
      isAuthenticated: Boolean(accessToken) || previewMode,
      employee,
      capabilities: employee?.capabilities ?? EMPTY_CAPABILITIES,
      previewMode,
      startPreviewSession,
    };
  }, [accessToken, employee, loading, previewMode, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
