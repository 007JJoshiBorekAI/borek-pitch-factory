/**
 * FIGMA-06 visual validation capture.
 * Validation-only route mocks — does not modify production code.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "screenshots", "figma-06");
const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
const webBase = process.env.WEB_BASE_URL ?? "http://localhost:3000";
const opportunityId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const presentationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const widths = [
  { name: "1440", width: 1440 },
  { name: "1280", width: 1280 },
  { name: "1024", width: 1024 },
];

const planFixture = {
  id: "plan-figma-06",
  framework_version_id: "framework-1",
  created_at: "2026-09-25T10:00:00.000Z",
  plan_json: {
    schema_version: "1.0",
    title: "Acme GmbH Pitch",
    slides: [
      { order: 1, purpose: "Cover", layoutId: "COVER_01", frameworkReferences: [] },
      { order: 2, purpose: "Client context", layoutId: "CONTEXT_01", frameworkReferences: [] },
      { order: 3, purpose: "Opportunity", layoutId: "SCOPE_01", frameworkReferences: [] },
      { order: 4, purpose: "Borek approach", layoutId: "PROCESS_FLOW_01", frameworkReferences: [] },
      { order: 5, purpose: "Relevant use case", layoutId: "TIMELINE_01", frameworkReferences: [] },
      { order: 6, purpose: "Pilot proposal", layoutId: "MILESTONES_01", frameworkReferences: [] },
      { order: 7, purpose: "Next steps", layoutId: "NEXT_STEPS_01", frameworkReferences: [] },
    ],
  },
};

const presentationFixture = {
  id: presentationId,
  presentation_plan_id: planFixture.id,
  name: "Acme GmbH Pitch",
  status: "ready",
  created_at: "2026-09-25T11:00:00.000Z",
};

function deckFixture(readyCount) {
  const slides = planFixture.plan_json.slides.slice(0, readyCount).map((slide, index) => ({
    slide_id: `11111111-1111-4111-8111-1111111111${index + 1}`,
    slide_index: index,
    layout_id: slide.layoutId,
    preview_url: `/presentations/${presentationId}/preview/slides/${index}.png`,
  }));
  const complete = readyCount === planFixture.plan_json.slides.length;
  return {
    presentation_id: presentationId,
    presentation_name: presentationFixture.name,
    version_number: 1,
    status: complete ? "ready" : "building",
    slides,
    pptx_download_url: complete ? `/presentations/${presentationId}/download/pptx` : "",
    pdf_download_url: complete ? `/presentations/${presentationId}/download/pdf` : "",
  };
}

function opportunityFixture() {
  return {
    id: opportunityId,
    client_name: "Acme GmbH",
    opportunity_name: "First meeting",
    department: "Sales",
    language: "en",
    pii_redaction_enabled: true,
    status: "active",
  };
}

function recentIso(minutesAgo = 3) {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function runningJobDetail() {
  const startedAt = recentIso(3);
  return {
    job_id: "job-figma-06",
    job_type: "presentation_generation",
    status: "RUNNING",
    current_stage: "SLIDE_GENERATING",
    created_at: startedAt,
    started_at: startedAt,
    completed_at: null,
    result: {},
    error: null,
  };
}

function activeJobFixture() {
  return {
    job_id: "job-figma-06",
    job_type: "presentation_generation",
    status: "RUNNING",
    current_stage: "SLIDE_GENERATING",
    started_at: recentIso(3),
    error: null,
  };
}

function employeeFixture() {
  return {
    user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    email: "user-a@example.com",
    display_name: "Elena Manovska",
    role: "employee",
    capabilities: {
      can_manage_employees: false,
      can_view_all_opportunities: false,
      can_export_audit_log: false,
    },
  };
}

function previewPng() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC",
    "base64",
  );
}

function jsonResponse(body, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

async function installMocks(page, mode) {
  await page.route(`${apiBase}/**`, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/employees/me")) {
      await route.fulfill(jsonResponse(employeeFixture()));
      return;
    }
    if (url.includes("/employees/session") && method === "POST") {
      await route.fulfill(jsonResponse({ ok: true }));
      return;
    }
    if (mode === "in-progress" && url.includes("/jobs")) {
      if (url.includes("/jobs/active")) {
        await route.fulfill(jsonResponse(activeJobFixture()));
        return;
      }
      await route.fulfill(jsonResponse(runningJobDetail()));
      return;
    }
    if (mode === "completed" && url.includes("/jobs")) {
      await route.fulfill(jsonResponse({ error: { code: "NOT_FOUND", message: "Not found" } }, 404));
      return;
    }
    if (url.includes("/presentation-plan")) {
      await route.fulfill(jsonResponse(planFixture));
      return;
    }
    if (url.includes("/jobs/active")) {
      if (mode === "in-progress") {
        await route.fulfill(jsonResponse(activeJobFixture()));
        return;
      }
      await route.fulfill(jsonResponse({ error: { code: "ACTIVE_JOB_NOT_FOUND", message: "No active job" } }, 404));
      return;
    }
    if (url.includes(`/presentations/${presentationId}/deck`)) {
      if (mode === "in-progress") {
        await route.fulfill(
          jsonResponse(
            {
              error: {
                code: "PRESENTATION_NOT_READY",
                message: "Presentation artifacts are not ready for preview or download",
              },
            },
            409,
          ),
        );
        return;
      }
      await route.fulfill(jsonResponse(deckFixture(planFixture.plan_json.slides.length)));
      return;
    }
    if (url.match(/\/jobs\/[^/?]+$/) && method === "GET") {
      if (mode === "in-progress") {
        await route.fulfill(jsonResponse(runningJobDetail()));
        return;
      }
      await route.fulfill(jsonResponse({ error: { code: "NOT_FOUND", message: "Job not found" } }, 404));
      return;
    }
    if (url.includes(`/opportunities/${opportunityId}/presentation`) && !url.includes("presentation-plan")) {
      await route.fulfill(jsonResponse(presentationFixture));
      return;
    }
    if (url.endsWith(opportunityId)) {
      await route.fulfill(jsonResponse(opportunityFixture()));
      return;
    }
    if (url.includes(`/presentations/${presentationId}/preview/`)) {
      await route.fulfill({ status: 200, contentType: "image/png", body: previewPng() });
      return;
    }
    if (url.includes(`/presentations/${presentationId}/download/`)) {
      await route.fulfill({ status: 200, contentType: "application/octet-stream", body: Buffer.from("mock-pptx") });
      return;
    }

    await route.continue();
  });
}

async function waitForScenario(page, mode) {
  await page.waitForSelector("[data-testid='auth-ready']", { state: "attached", timeout: 60000 });
  await page.waitForSelector("[data-testid='pitch-generation-workspace']", { timeout: 60000 });
  await page.waitForSelector("[data-testid='pitch-slide-list']", { timeout: 60000 });
  await page.waitForFunction(
    () => !document.querySelector("[data-testid='deck-loading']"),
    undefined,
    { timeout: 60000 },
  );

  if (mode === "in-progress") {
    await page.waitForSelector("[data-testid='pitch-ready-count']", { timeout: 60000 });
    await page.waitForFunction(
      () => {
        const text = document.querySelector("[data-testid='pitch-ready-count']")?.textContent ?? "";
        return /0 of 7 slides ready/.test(text);
      },
      undefined,
      { timeout: 60000 },
    );
    await page.waitForSelector("[data-testid='pitch-current-generation']", { timeout: 60000 });
  } else {
    await page.waitForFunction(
      () => {
        const text = document.querySelector("[data-testid='pitch-ready-count']")?.textContent ?? "";
        return /7 of 7 slides ready/.test(text);
      },
      undefined,
      { timeout: 60000 },
    );
    await page.waitForSelector("[data-testid='pitch-slide-preview']", { timeout: 60000 });
    await page.waitForSelector("[data-testid='download-powerpoint']:not([disabled])", { timeout: 60000 });
    await page.waitForSelector("[data-testid='regenerate-slide']", { timeout: 60000 });
  }
}

async function collectLayoutMetrics(page) {
  return page.evaluate(() => {
    const workspace = document.querySelector(".pitch-generation-header");
    const body = document.querySelector(".pitch-generation-body");
    const slideList = document.querySelector(".pitch-generation-slide-list");
    const previewArea = document.querySelector(".pitch-generation-preview-area");
    const selected = document.querySelector(".pitch-generation-slide-row.is-selected");
    const download = document.querySelector("[data-testid='download-powerpoint']");
    const progress = document.querySelector(".pitch-generation-progress-track");

    return {
      headerWidth: workspace?.getBoundingClientRect().width ?? null,
      bodyWidth: body?.getBoundingClientRect().width ?? null,
      slideListWidth: slideList?.getBoundingClientRect().width ?? null,
      previewWidth: previewArea?.getBoundingClientRect().width ?? null,
      selectedSlide: Boolean(selected),
      downloadDisabled: download?.hasAttribute("disabled") ?? null,
      downloadHasDisabledClass: download?.classList.contains("is-disabled") ?? null,
      progressHeight: progress?.getBoundingClientRect().height ?? null,
      readyCount: document.querySelector("[data-testid='pitch-ready-count']")?.textContent?.trim() ?? null,
      slideRows: document.querySelectorAll(".pitch-generation-slide-row").length,
    };
  });
}

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const results = [];

for (const scenario of [
  { name: "01-in-progress", mode: "in-progress" },
  { name: "02-completed", mode: "completed" },
]) {
  for (const viewport of widths) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: 1024 } });
    await installMocks(page, scenario.mode);
    await page.goto(`${webBase}/deck-center?opportunityId=${opportunityId}`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    await waitForScenario(page, scenario.mode);
    await page.waitForTimeout(800);

    const metrics = await collectLayoutMetrics(page);
    const file = path.join(outDir, `${scenario.name}-${viewport.name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    results.push({ scenario: scenario.name, file, width: viewport.width, metrics });
    console.log(JSON.stringify({ scenario: scenario.name, file, width: viewport.width, metrics }));
    await page.close();
  }
}

await browser.close();

const failed = results.filter((row) => {
  if (row.scenario === "01-in-progress") {
    return row.metrics.readyCount !== "0 of 7 slides ready" || row.metrics.downloadDisabled !== true;
  }
  return row.metrics.readyCount !== "7 of 7 slides ready" || row.metrics.downloadDisabled !== false;
});

if (failed.length > 0) {
  console.error("Capture validation failed for scenarios:", failed.map((row) => row.scenario));
  process.exit(1);
}
