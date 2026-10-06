"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { getEmployeeMe, recordEmployeeSession } from "@/lib/api";
import { authOwnerId, beginAuthSession, clearAuthSession, isAuthSessionEnded, isPreviewSessionActive, syncAuthOwner } from "@/lib/authSession";
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
  ownerId: string | null;
  startPreviewSession: () => void;
  endPreviewSession: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  accessToken: null,
  loading: true,
  isAuthenticated: false,
  employee: null,
  capabilities: EMPTY_CAPABILITIES,
  previewMode: false,
  ownerId: null,
  startPreviewSession: () => undefined,
  endPreviewSession: () => undefined,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<EmployeeMe | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const endedRef = useRef(false);
  const authGeneration = useRef(0);
  const loginRecorded = useRef<string | null>(null);

  const devToken = process.env.NEXT_PUBLIC_DEV_ACCESS_TOKEN?.trim() || null;
  // TEMPORARY: with NEXT_PUBLIC_BYPASS_LOGIN the API (AUTH_BYPASS=true) ignores the token value.
  const bypassToken = process.env.NEXT_PUBLIC_BYPASS_LOGIN === "true" ? "dev-bypass" : null;
  const developmentToken = devToken ?? bypassToken;
  const accessToken = sessionEnded ? null : session?.access_token ?? developmentToken;
  const ownerId = loading ? null : authOwnerId(session?.user.id ?? null, previewMode, accessToken);
  const ownerRef = useRef(ownerId);
  ownerRef.current = ownerId;

  useEffect(() => {
    let active = true;
    endedRef.current = isAuthSessionEnded();
    setSessionEnded(endedRef.current);
    const client = getSupabaseBrowserClient();
    if (!client) {
      const preview = !endedRef.current && isLocalUiPreviewAvailable() && isPreviewSessionActive();
      ownerRef.current = authOwnerId(null, preview, endedRef.current ? null : developmentToken);
      syncAuthOwner(ownerRef.current);
      setPreviewMode(preview);
      setLoading(false);
      return;
    }

    const generation = authGeneration.current;
    void client.auth.getSession().then(({ data }) => {
      if (!active || authGeneration.current !== generation) return;
      const nextSession = endedRef.current ? null : data.session;
      ownerRef.current = authOwnerId(nextSession?.user.id ?? null, false, endedRef.current ? null : developmentToken);
      syncAuthOwner(ownerRef.current);
      setSession(nextSession);
      setLoading(false);
    }).catch(() => {
      if (!active || authGeneration.current !== generation) return;
      ownerRef.current = authOwnerId(null, false, endedRef.current ? null : developmentToken);
      syncAuthOwner(ownerRef.current);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      authGeneration.current += 1;
      if (event === "SIGNED_OUT") {
        endPreviewSession();
        return;
      }
      if (event === "SIGNED_IN") {
        endedRef.current = false;
        setSessionEnded(false);
        beginAuthSession();
      }
      if (endedRef.current) nextSession = null;
      const nextOwner = authOwnerId(nextSession?.user.id ?? null, false, endedRef.current ? null : developmentToken);
      if (ownerRef.current !== nextOwner) setEmployee(null);
      ownerRef.current = nextOwner;
      syncAuthOwner(nextOwner);
      setPreviewMode(false);
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  function startPreviewSession() {
    if (!isLocalUiPreviewAvailable() || getSupabaseBrowserClient()) {
      return;
    }
    authGeneration.current += 1;
    endedRef.current = false;
    const preview = !developmentToken;
    const nextOwner = authOwnerId(null, preview, developmentToken);
    beginAuthSession(preview);
    syncAuthOwner(nextOwner);
    ownerRef.current = nextOwner;
    setSessionEnded(false);
    setPreviewMode(preview);
    setLoading(false);
  }

  function endPreviewSession() {
    authGeneration.current += 1;
    endedRef.current = true;
    clearAuthSession(ownerRef.current ?? undefined);
    ownerRef.current = null;
    setSessionEnded(true);
    setPreviewMode(false);
    setSession(null);
    setEmployee(null);
    loginRecorded.current = null;
    setLoading(false);
  }

  useEffect(() => {
    if (loading || !accessToken) {
      setEmployee(null);
      loginRecorded.current = null;
      return;
    }
    let cancelled = false;
    void getEmployeeMe(accessToken)
      .then((profile) => {
        if (!cancelled && ownerRef.current === ownerId && !endedRef.current) {
          setEmployee(profile);
        }
      })
      .catch(() => {
        if (!cancelled && ownerRef.current === ownerId && !endedRef.current) {
          setEmployee(null);
        }
      });
    const ownerKey = ownerId;
    if (loginRecorded.current !== ownerKey) {
      loginRecorded.current = ownerKey;
      void recordEmployeeSession(accessToken).catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [accessToken, loading, ownerId]);

  const value = useMemo<AuthContextValue>(() => {
    return {
      session,
      accessToken,
      loading,
      isAuthenticated: !loading && (Boolean(accessToken) || previewMode),
      employee,
      capabilities: employee?.capabilities ?? EMPTY_CAPABILITIES,
      previewMode,
      ownerId,
      startPreviewSession,
      endPreviewSession,
    };
  }, [accessToken, employee, loading, ownerId, previewMode, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
