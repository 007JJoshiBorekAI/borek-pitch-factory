const AUTH_USER_KEY = "borek.authUserId";
const PREVIEW_KEY = "borek-ui-preview";
const PREVIEW_JOURNEY_STORAGE_KEY = "borek-preview-journey-v1";

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function clearAuthSession(): void {
  const current = storage();
  const ownerId = current?.getItem(AUTH_USER_KEY) ?? (current?.getItem(PREVIEW_KEY) === "true" ? "local-preview" : null);
  if (ownerId) {
    try {
      globalThis.localStorage?.removeItem(`${PREVIEW_JOURNEY_STORAGE_KEY}:${ownerId}`);
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }
  }
  current?.removeItem(AUTH_USER_KEY);
  current?.removeItem(PREVIEW_KEY);
}

export function syncAuthOwner(userId: string | null): void {
  const current = storage();
  const previous = current?.getItem(AUTH_USER_KEY) ?? null;
  if (previous && previous !== userId) clearAuthSession();
  if (userId) current?.setItem(AUTH_USER_KEY, userId);
  else current?.removeItem(AUTH_USER_KEY);
}
