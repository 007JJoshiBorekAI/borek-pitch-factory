/**
 * FIGMA-09 final visual capture — 1440px primary screens.
 * Uses runtime env credentials only; never logs tokens.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..", "..", "..");
const outDir = path.join(__dirname, "..", "screenshots", "figma-09");
const webBaseLogin = process.env.FIGMA09_LOGIN_BASE_URL ?? "http://localhost:3003";
const webBaseAuth = process.env.FIGMA09_AUTH_BASE_URL ?? process.env.WEB_BASE_URL ?? "http://localhost:3002";
const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

fs.mkdirSync(outDir, { recursive: true });

function mintDevToken() {
  const result = spawnSync(
    "py",
    [
      "-3",
      "-c",
      [
        "import jwt",
        "from datetime import datetime, timedelta, UTC",
        "now = datetime.now(UTC)",
        "payload = {",
        "  'sub': '11111111-1111-4111-8111-111111111111',",
        "  'email': 'user-a@example.com',",
        "  'aud': 'authenticated',",
        "  'iat': now,",
        "  'exp': now + timedelta(hours=2),",
        "}",
        "print(jwt.encode(payload, 'test-supabase-jwt-secret-with-32-byte-minimum-length', algorithm='HS256'))",
      ].join("\n"),
    ],
    { encoding: "utf8", cwd: repoRoot },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || "Failed to mint dev JWT for FIGMA-09 capture");
  }
  return result.stdout.trim();
}

function runScript(scriptName, extraEnv = {}) {
  const env = {
    ...process.env,
    WEB_BASE_URL: webBaseAuth,
    NEXT_PUBLIC_API_URL: apiBase,
    ...extraEnv,
  };
  const result = spawnSync("node", [path.join(__dirname, scriptName)], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || `${scriptName} failed`);
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

function copy1440(sourceDir, sourceName, destName) {
  const source = path.join(__dirname, "..", "screenshots", sourceDir, sourceName);
  const dest = path.join(outDir, destName);
  if (!fs.existsSync(source)) {
    console.error(`Missing capture source: ${source}`);
    process.exit(1);
  }
  fs.copyFileSync(source, dest);
  console.log(JSON.stringify({ dest, source }));
}

const token = mintDevToken();

runScript("capture-figma01-login.mjs", {
  WEB_BASE_URL: webBaseLogin,
});
copy1440("figma-01", "01-login-1440.png", "01-login.png");

runScript("capture-figma03-premeting.mjs", {
  NEXT_PUBLIC_DEV_ACCESS_TOKEN: token,
});
copy1440("figma-03", "01-pre-meeting-1440.png", "02-pre-meeting.png");

runScript("capture-figma05-postmeeting.mjs", {
  FIGMA05_ACCESS_TOKEN: token,
  NEXT_PUBLIC_DEV_ACCESS_TOKEN: token,
});
copy1440("figma-05", "01-postmeeting-1440.png", "03-post-meeting.png");

runScript("capture-figma04-clients.mjs", {
  FIGMA04_ACCESS_TOKEN: token,
  NEXT_PUBLIC_DEV_ACCESS_TOKEN: token,
});
copy1440("figma-04", "01-clients-1440.png", "04-clients.png");

runScript("capture-figma06-deckcenter.mjs", {
  NEXT_PUBLIC_DEV_ACCESS_TOKEN: token,
});
copy1440("figma-06", "02-completed-1440.png", "05-pitch-generation.png");

runScript("capture-figma07-followup.mjs", {
  NEXT_PUBLIC_DEV_ACCESS_TOKEN: token,
});
copy1440("figma-07", "01-draft-ready-1440.png", "06-follow-up-email.png");

console.log(JSON.stringify({ ok: true, outDir, webBaseLogin, webBaseAuth }));
