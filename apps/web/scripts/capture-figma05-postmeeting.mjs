import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "screenshots", "figma-05");
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
  FIGMA05_ACCESS_TOKEN:
    process.env.FIGMA05_ACCESS_TOKEN ?? process.env.NEXT_PUBLIC_DEV_ACCESS_TOKEN ?? "",
};
const seed = spawnSync("py", ["-3", path.join(repoRoot, "scripts", "seed_figma05_memory_validation.py")], {
  cwd: repoRoot,
  encoding: "utf8",
  env: seedEnv,
});
if (seed.status !== 0) {
  console.error(seed.stderr || seed.stdout || "Failed to seed FIGMA-05 validation data");
  process.exit(seed.status ?? 1);
}

const seedPayload = JSON.parse(seed.stdout.trim().split("\n").pop() ?? "{}");
const opportunityId = seedPayload.opportunity_id;
if (!opportunityId) {
  console.error("Seed script did not return opportunity_id");
  process.exit(1);
}

function deepeningEligibility(id) {
  return {
    schema_version: "1.0",
    opportunity_id: id,
    requested_journey_stage: "deepening",
    startable: true,
    prerequisite_stage: "first_contact",
    prior_stage_presentation_version_id: "ver-first",
    reason: null,
    next_action: null,
    stages: [
      {
        journey_stage: "first_contact",
        startable: true,
        prerequisite_stage: null,
        prior_stage_presentation_version_id: null,
        reason: null,
        next_action: null,
      },
      {
        journey_stage: "deepening",
        startable: true,
        prerequisite_stage: "first_contact",
        prior_stage_presentation_version_id: "ver-first",
        reason: null,
        next_action: null,
      },
      {
        journey_stage: "concretisation",
        startable: false,
        prerequisite_stage: "deepening",
        prior_stage_presentation_version_id: null,
        reason: "NO_COMPLETED_PREREQUISITE",
        next_action: "complete_deepening",
      },
    ],
  };
}

const browser = await chromium.launch();

for (const viewport of widths) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: 1024 } });
  await page.route("**/journey-stage-eligibility**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(deepeningEligibility(opportunityId)),
    });
  });
  await page.addInitScript((selection) => {
    window.sessionStorage.setItem("borek.selectedJourneyStage", JSON.stringify(selection));
  }, { journeyStage: "deepening", opportunityId });

  await page.goto(`${base}/upload?opportunityId=${opportunityId}`, {
    waitUntil: "networkidle",
    timeout: 90000,
  });
  await page.waitForSelector(".post-meeting-page", { timeout: 60000 });
  await page.waitForSelector(".post-meeting-readiness-list", { timeout: 60000 });
  await page.waitForTimeout(2000);
  const file = path.join(outDir, `01-postmeeting-${viewport.name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(JSON.stringify({ file, width: viewport.width, url: page.url(), opportunityId }));
  await page.close();
}

await browser.close();
