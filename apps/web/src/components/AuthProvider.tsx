"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { getEmployeeMe, recordEmployeeSession } from "@/lib/api";
import { EMPTY_CAPABILITIES, type EmployeeMe } from "@/lib/employeeRoles";
import { syncPipelineOwner } from "@/lib/pipelineContext";
import { getSupabaseBrowserClient } from "@/lib/supabase";

interface AuthContextValue {
  session: Session | null;
  accessToken: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  employee: EmployeeMe | null;
  capabilities: EmployeeMe["capabilities"];
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  accessToken: null,
  loading: true,
  isAuthenticated: false,
  employee: null,
  capabilities: EMPTY_CAPABILITIES,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<EmployeeMe | null>(null);
  const loginRecorded = useRef<string | null>(null);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setLoading(false);
      return;
    }

    void client.auth.getSession().then(({ data }) => {
      syncPipelineOwner(data.session?.user.id ?? null);
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      syncPipelineOwner(nextSession?.user.id ?? null);
      setSession(nextSession);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const devToken = process.env.NEXT_PUBLIC_DEV_ACCESS_TOKEN?.trim() || null;
  const accessToken = session?.access_token ?? devToken;

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
      isAuthenticated: Boolean(accessToken),
      employee,
      capabilities: employee?.capabilities ?? EMPTY_CAPABILITIES,
    };
  }, [accessToken, employee, loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
