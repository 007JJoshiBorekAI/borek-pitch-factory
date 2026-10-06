"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export function SignOutButton() {
  const router = useRouter();
  const { endPreviewSession } = useAuth();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    endPreviewSession();
    try {
      await getSupabaseBrowserClient()?.auth.signOut();
    } catch {
      // Local auth is already cleared, even if the remote sign-out is unavailable.
    } finally {
      router.replace("/login");
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="site-nav-signout"
      disabled={busy}
      onClick={() => void handleSignOut()}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
