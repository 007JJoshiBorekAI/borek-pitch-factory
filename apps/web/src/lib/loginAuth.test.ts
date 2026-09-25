import assert from "node:assert/strict";

import {
  LOGIN_LANGUAGES,
  loginKeepSignedInHint,
  parseOAuthCallbackError,
  resolvePostAuthPath,
} from "./loginAuth.js";

assert.equal(resolvePostAuthPath("?next=%2Fclients"), "/clients");
assert.equal(resolvePostAuthPath("?next=//evil.example"), "/");
assert.equal(resolvePostAuthPath(""), "/");

assert.equal(
  parseOAuthCallbackError("?error=access_denied&error_description=User%20cancelled"),
  "User cancelled",
);
assert.equal(parseOAuthCallbackError("?error=server_error"), "server error");
assert.equal(parseOAuthCallbackError(""), null);

assert.match(loginKeepSignedInHint(), /automatically/i);

assert.equal(LOGIN_LANGUAGES.find((row) => row.id === "en")?.supported, true);
assert.equal(LOGIN_LANGUAGES.find((row) => row.id === "de")?.supported, false);

console.log("FIGMA-01 loginAuth tests passed");
