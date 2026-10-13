"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { ApiRequestError, getEmployeeMe, recordEmployeeSession } from "@/lib/api";
import { currentAuthMode, DEV_AUTH_TOKEN, type AuthMode, type BypassIgnoredReason } from "@/lib/authMode";
import { authOwnerId, beginAuthSession, clearAuthSession, isAuthSessionEnded, isDevAuthSessionActive, isPreviewSessionActive, syncAuthOwner } from "@/lib/authSession";
import { restoreDevAuthSession, startDevAuthSession } from "@/lib/devAuthSession";
import { EMPTY_CAPABILITIES, type EmployeeMe } from "@/lib/employeeRoles";
import { getSupabaseBrowserClient } from "@/lib/supabase";

interface AuthContextValue {
  session: Session | null;
  accessToken: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  employee: EmployeeMe | null;
  capabilities: EmployeeMe["capabilities"];
  /** Browser-only sample data; the API is never called. */
  previewMode: boolean;
  /** Development sign-in against a local API running with AUTH_BYPASS; API calls are live. */
  devAuthMode: boolean;
  /** null until the browser has resolved which sign-in this build supports. */
  authMode: AuthMode | null;
  bypassIgnoredReason: BypassIgnoredReason | null;
  /** Development sign-in is running on the deployed development host. */
  deployedDevPreview: boolean;
  ownerId: string | null;
  startPreviewSession: () => void;
  startDevSession: () => Promise<void>;
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
  devAuthMode: false,
  authMode: null,
  bypassIgnoredReason: null,
  deployedDevPreview: false,
  ownerId: null,
  startPreviewSession: () => undefined,
  startDevSession: async () => undefined,
  endPreviewSession: () => undefined,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<EmployeeMe | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [devUserId, setDevUserId] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [bypassIgnoredReason, setBypassIgnoredReason] = useState<BypassIgnoredReason | null>(null);
  const [deployedDevPreview, setDeployedDevPreview] = useState(false);
  const [developmentToken, setDevelopmentToken] = useState<string | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const endedRef = useRef(false);
  const authGeneration = useRef(0);
  const loginRecorded = useRef<string | null>(null);

  const accessToken = sessionEnded ? null : session?.access_token ?? (devUserId ? DEV_AUTH_TOKEN : developmentToken);
  const ownerId = loading ? null : devUserId ?? authOwnerId(session?.user.id ?? null, previewMode, accessToken);
  const ownerRef = useRef(ownerId);
  ownerRef.current = ownerId;

  useEffect(() => {
    let active = true;
    endedRef.current = isAuthSessionEnded();
    setSessionEnded(endedRef.current);
    const resolved = currentAuthMode();
    const developmentToken = resolved.devAccessToken;
    setAuthMode(resolved.mode);
    setBypassIgnoredReason(resolved.bypassIgnoredReason);
    setDeployedDevPreview(resolved.deployedDevPreview);
    setDevelopmentToken(developmentToken);
    if (resolved.mode === "dev") {
      if (endedRef.current || !isDevAuthSessionActive()) {
        ownerRef.current = null;
        syncAuthOwner(null);
        setLoading(false);
        return;
      }
      // Restore only once the API confirms it still runs in development auth mode.
      const generation = authGeneration.current;
      void restoreDevAuthSession(() => getEmployeeMe(DEV_AUTH_TOKEN)).then((profile) => {
        if (!active || authGeneration.current !== generation) return;
        ownerRef.current = profile?.user_id ?? null;
        if (profile) syncAuthOwner(profile.user_id);
        setEmployee(profile);
        setDevUserId(profile?.user_id ?? null);
        setLoading(false);
      });
      return () => {
        active = false;
      };
    }
    const client = getSupabaseBrowserClient();
    if (!client) {
      const preview = resolved.mode === "preview" && !endedRef.current && isPreviewSessionActive();
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
    if (currentAuthMode().mode !== "preview") {
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

  async function startDevSession() {
    if (currentAuthMode().mode !== "dev") {
      throw new Error("Development sign-in is not available in this environment.");
    }
    authGeneration.current += 1;
    const generation = authGeneration.current;
    // The session only starts once the API answers as the development user.
    const profile = await startDevAuthSession(
      () => getEmployeeMe(DEV_AUTH_TOKEN),
      () => authGeneration.current === generation,
    );
    if (!profile) return;
    endedRef.current = false;
    ownerRef.current = profile.user_id;
    setSessionEnded(false);
    setPreviewMode(false);
    setEmployee(profile);
    setDevUserId(profile.user_id);
    setLoading(false);
  }

  function endPreviewSession() {
    authGeneration.current += 1;
    endedRef.current = true;
    clearAuthSession(ownerRef.current ?? undefined);
    ownerRef.current = null;
    setSessionEnded(true);
    setPreviewMode(false);
    setDevUserId(null);
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
      .catch((error: unknown) => {
        if (cancelled || ownerRef.current !== ownerId || endedRef.current) return;
        // A development session is only valid while the API still accepts it.
        if (devUserId && error instanceof ApiRequestError && error.status === 401) {
          endPreviewSession();
          return;
        }
        setEmployee(null);
      });
    const ownerKey = ownerId;
    if (loginRecorded.current !== ownerKey) {
      loginRecorded.current = ownerKey;
      void recordEmployeeSession(accessToken).catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [accessToken, devUserId, loading, ownerId]);

  const value = useMemo<AuthContextValue>(() => {
    return {
      session,
      accessToken,
      loading,
      isAuthenticated: !loading && (Boolean(accessToken) || previewMode),
      employee,
      capabilities: employee?.capabilities ?? EMPTY_CAPABILITIES,
      previewMode,
      devAuthMode: Boolean(devUserId) && Boolean(accessToken),
      authMode,
      bypassIgnoredReason,
      deployedDevPreview,
      ownerId,
      startPreviewSession,
      startDevSession,
      endPreviewSession,
    };
  }, [accessToken, authMode, bypassIgnoredReason, deployedDevPreview, developmentToken, devUserId, employee, loading, ownerId, previewMode, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
