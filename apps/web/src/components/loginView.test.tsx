import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const viewSource = readFileSync(
  fileURLToPath(new URL("./LoginView.tsx", import.meta.url)),
  "utf8",
);
const pageSource = readFileSync(
  fileURLToPath(new URL("../app/login/page.tsx", import.meta.url)),
  "utf8",
);
const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");

assert.match(pageSource, /LoginView/);
assert.doesNotMatch(pageSource, /AuthShell/);
assert.doesNotMatch(pageSource, /AuthCard/);

assert.match(viewSource, /signInWithOAuth/);
assert.match(viewSource, /provider: "azure"/);
assert.match(viewSource, /redirectTo/);
assert.match(viewSource, /scopes: "email"/);
assert.match(viewSource, /queryParams: \{ prompt: "select_account" \}/);
assert.doesNotMatch(viewSource, /signInWithPassword/);
assert.doesNotMatch(viewSource, /NEXT_PUBLIC_DEV_ACCESS_TOKEN/);
assert.match(viewSource, /resolveLoginAuthMode/);
assert.match(viewSource, /authMode !== "supabase"/);
assert.match(viewSource, /Microsoft sign-in requires NEXT_PUBLIC_SUPABASE_URL/);
assert.match(viewSource, /loginKeepSignedInHint/);
assert.match(viewSource, /LOGIN_LANGUAGES/);
assert.match(viewSource, /German UI is not available yet/);

assert.match(css, /\.figma-login-page/);
assert.match(css, /\.figma-login-microsoft/);
assert.match(css, /grid-template-columns: minmax\(0, 760px\) minmax\(0, 680px\)/);
assert.match(css, /@media \(max-width: 1024px\)[\s\S]*\.figma-login-page/);

assert.match(viewSource, /data-testid="figma-login-page"/);
assert.match(viewSource, /Prepare the right/);
assert.match(viewSource, /AI PITCH/);
assert.match(viewSource, /Welcome/);
assert.match(viewSource, /Sign in with your Borek account to continue\./);
assert.match(viewSource, /Continue with Microsoft/);
assert.match(viewSource, /handleMicrosoftSignIn/);
assert.match(viewSource, /authMode !== "supabase"/);
assert.match(viewSource, /authMode !== "supabase"[\s\S]*return;[\s\S]*handleMicrosoftSignIn/);
assert.match(viewSource, /if \(session\)[\s\S]*router\.replace\(resolvePostAuthPath\(\)\)/);
assert.match(viewSource, /data-testid="figma-login-microsoft"/);
assert.match(viewSource, /\/figma-01\/microsoft-logo\.png/);
assert.match(viewSource, /width=\{54\}/);
assert.match(viewSource, /height=\{41\}/);
assert.match(viewSource, /checked=\{false\}/);
assert.doesNotMatch(viewSource, /Enter demo workspace/);
assert.doesNotMatch(viewSource, /router\.push/);
assert.doesNotMatch(viewSource, /resolveDemoEntryPath/);
assert.match(viewSource, /Keep me signed in on this device/);
assert.match(viewSource, /figma-login-keep-signed-in/);
assert.match(viewSource, /Need access\? Contact IT Support\./);
assert.match(viewSource, /\/figma-01\/login-powder-artwork\.png/);
assert.match(viewSource, /\/figma-01\/borek-logo-white\.svg/);
assert.doesNotMatch(viewSource, /Sign in with email/);
assert.doesNotMatch(viewSource, /NEXT_PUBLIC_DEV_ACCESS_TOKEN/);
assert.match(viewSource, /Redirecting/);
assert.match(viewSource, /Checking your session/);
assert.match(viewSource, /parseOAuthCallbackError/);

console.log("FIGMA-01 login view tests passed");
