import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "screenshots", "figma-04");
const base = process.env.WEB_BASE_URL ?? "http://localhost:3000";
const widths = [
  { name: "1440", width: 1440 },
  { name: "1280", width: 1280 },
  { name: "1024", width: 1024 },
];

fs.mkdirSync(outDir, { recursive: true });

const repoRoot = path.join(__dirname, "..", "..", "..");
const seedEnv = {
  ...process.env,
  FIGMA04_ACCESS_TOKEN:
    process.env.FIGMA04_ACCESS_TOKEN ?? process.env.NEXT_PUBLIC_DEV_ACCESS_TOKEN ?? "",
};
const seed = spawnSync("py", ["-3", path.join(repoRoot, "scripts", "seed_figma04_memory_validation.py")], {
  cwd: repoRoot,
  encoding: "utf8",
  env: seedEnv,
});
if (seed.status !== 0) {
  console.error(seed.stderr || seed.stdout || "Failed to seed FIGMA-04 validation data");
  process.exit(seed.status ?? 1);
}
console.log(seed.stdout.trim());

const browser = await chromium.launch();

for (const viewport of widths) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: 1024 } });
  await page.goto(`${base}/clients`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForSelector(".clients-page", { timeout: 60000 });
  await page.waitForSelector(".clients-table tbody tr", { timeout: 60000 });
  await page.waitForTimeout(1500);
  const file = path.join(outDir, `01-clients-${viewport.name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(JSON.stringify({ file, width: viewport.width, url: page.url() }));
  await page.close();
}

await browser.close();
