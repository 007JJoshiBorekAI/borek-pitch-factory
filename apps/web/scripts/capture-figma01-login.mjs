/**
 * FIGMA-01 visual validation capture for /login (unauthenticated).
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "screenshots", "figma-01");
const webBase = process.env.WEB_BASE_URL ?? "http://localhost:3000";

const widths = [
  { name: "1440", width: 1440, height: 1024 },
  { name: "1280", width: 1280, height: 1024 },
  { name: "1024", width: 1024, height: 1024 },
];

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();

for (const viewport of widths) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  await page.goto(`${webBase}/login`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForSelector("[data-testid='figma-login-page']", { timeout: 60000 });
  await page.waitForSelector("[data-testid='figma-login-microsoft']", { timeout: 60000 });
  await page.waitForTimeout(600);
  const file = path.join(outDir, `01-login-${viewport.name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(JSON.stringify({ file, width: viewport.width, height: viewport.height }));
  await page.close();
}

await browser.close();
