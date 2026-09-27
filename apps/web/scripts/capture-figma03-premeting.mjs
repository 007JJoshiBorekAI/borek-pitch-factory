import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "screenshots", "figma-03");
const base = process.env.WEB_BASE_URL ?? "http://localhost:3000";
const widths = [
  { name: "1440", width: 1440 },
  { name: "1280", width: 1280 },
  { name: "1024", width: 1024 },
];

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();

for (const viewport of widths) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: 1024 } });
  await page.goto(`${base}/upload?new=1`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForSelector(".pre-meeting-page", { timeout: 60000 });
  await page.waitForTimeout(1000);
  const file = path.join(outDir, `01-pre-meeting-${viewport.name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(JSON.stringify({ file, width: viewport.width, url: page.url() }));
  await page.close();
}

await browser.close();
