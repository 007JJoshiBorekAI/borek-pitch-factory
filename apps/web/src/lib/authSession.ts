import { clearIntakeDraft } from "./intakeDraft";
import { BACKEND_OPPORTUNITY_MAP_PREFIX } from "./backendOpportunityMap";

const AUTH_USER_KEY = "borek.authUserId";
const PREVIEW_KEY = "borek-ui-preview";
const DEV_AUTH_KEY = "borek-dev-auth";
const PREVIEW_JOURNEY_STORAGE_KEY = "borek-preview-journey-v1";
const SIGNED_OUT_KEY = "borek.authSignedOut";

export function authOwnerId(userId: string | null, previewMode: boolean, accessToken: string | null): string | null {
  return userId ?? (previewMode ? "local-preview" : accessToken ? "development-access" : null);
}

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function read(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) storage()?.removeItem(key);
    else storage()?.setItem(key, value);
  } catch {
    // In-memory auth still works when browser storage is unavailable.
  }
}

export function getAuthOwnerId(): string | null {
  return read(AUTH_USER_KEY);
}

export function isAuthSessionEnded(): boolean {
  return read(SIGNED_OUT_KEY) === "true";
}

export function isPreviewSessionActive(): boolean {
  return !isAuthSessionEnded() && read(PREVIEW_KEY) === "true";
}

export function isDevAuthSessionActive(): boolean {
  return !isAuthSessionEnded() && read(DEV_AUTH_KEY) === "true";
}

export function beginAuthSession(preview = false, devAuth = false): void {
  write(SIGNED_OUT_KEY, null);
  write(PREVIEW_KEY, preview ? "true" : null);
  write(DEV_AUTH_KEY, devAuth && !preview ? "true" : null);
}

export function clearAuthSession(ownerId = getAuthOwnerId() ?? (isPreviewSessionActive() ? "local-preview" : null)): void {
  clearIntakeDraft(ownerId);
  if (ownerId) {
    try {
      globalThis.localStorage?.removeItem(`${PREVIEW_JOURNEY_STORAGE_KEY}:${ownerId}`);
      const local = globalThis.localStorage;
      if (local) {
        const prefix = `${BACKEND_OPPORTUNITY_MAP_PREFIX}${encodeURIComponent(ownerId)}:`;
        const keys = Array.from({ length: local.length }, (_, index) => local.key(index));
        for (const key of keys) if (key?.startsWith(prefix)) local.removeItem(key);
      }
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }
  }
  write(AUTH_USER_KEY, null);
  write(PREVIEW_KEY, null);
  write(DEV_AUTH_KEY, null);
  write(SIGNED_OUT_KEY, "true");
}

export function syncAuthOwner(userId: string | null): void {
  const previous = getAuthOwnerId() ?? (isPreviewSessionActive() ? "local-preview" : null);
  if (previous && previous !== userId) {
    const devAuth = isDevAuthSessionActive();
    clearAuthSession(previous);
    if (userId) beginAuthSession(userId === "local-preview", devAuth);
  }
  clearIntakeDraft(null);
  write(AUTH_USER_KEY, userId);
}
