import { beginAuthSession, isDevAuthSessionActive, syncAuthOwner } from "./authSession";

export interface DevAuthProfile {
  user_id: string;
  email: string;
}

/**
 * Starts a development session only after the API has answered as its development user.
 * Nothing is persisted when the request fails or when the attempt was superseded.
 */
export async function startDevAuthSession<T extends DevAuthProfile>(
  fetchProfile: () => Promise<T>,
  isCurrent: () => boolean = () => true,
): Promise<T | null> {
  const profile = await fetchProfile();
  if (!profile?.user_id || !profile.email) {
    throw new Error("The API did not return a development user.");
  }
  if (!isCurrent()) return null;
  syncAuthOwner(profile.user_id);
  beginAuthSession(false, true);
  return profile;
}

/** After a reload the stored flag alone is not enough: the API has to confirm the session again. */
export async function restoreDevAuthSession<T extends DevAuthProfile>(
  fetchProfile: () => Promise<T>,
): Promise<T | null> {
  if (!isDevAuthSessionActive()) return null;
  try {
    const profile = await fetchProfile();
    return profile?.user_id && profile.email ? profile : null;
  } catch {
    return null;
  }
}
