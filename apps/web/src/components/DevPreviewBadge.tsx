"use client";

import { useAuth } from "@/components/AuthProvider";

/** Marks the deployed development environment while its sign-in bypass is active. */
export function DevPreviewBadge() {
  const { deployedDevPreview, isAuthenticated } = useAuth();
  if (!deployedDevPreview || !isAuthenticated) return null;
  return <p className="dev-preview-badge" role="status">Development Preview</p>;
}
