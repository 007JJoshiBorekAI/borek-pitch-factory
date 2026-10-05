const AUTH_USER_KEY = "borek.authUserId";
const PREVIEW_KEY = "borek-ui-preview";

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function clearAuthSession(): void {
  const current = storage();
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
