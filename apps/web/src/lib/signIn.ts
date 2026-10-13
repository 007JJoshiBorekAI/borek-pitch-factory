import type { AuthMode } from "./authMode";

export type SignInAction = "microsoft" | "dev";

export interface SignInHandlers {
  microsoft: () => Promise<void>;
  dev: () => Promise<void>;
}

/** What the primary sign-in button does in each mode; preview and unconfigured builds have no sign-in. */
export function signInAction(mode: AuthMode | null): SignInAction | null {
  return mode === "supabase" ? "microsoft" : mode === "dev" ? "dev" : null;
}

/** Runs exactly one sign-in path, so a development sign-in can never also start Microsoft OAuth. */
export async function performSignIn(mode: AuthMode | null, handlers: SignInHandlers): Promise<SignInAction | null> {
  const action = signInAction(mode);
  if (action === "microsoft") await handlers.microsoft();
  if (action === "dev") await handlers.dev();
  return action;
}
