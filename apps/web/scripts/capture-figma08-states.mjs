/**
 * FIGMA-08 visual validation capture.
 * Validation-only route mocks — does not modify production code.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "screenshots", "figma-08");
const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
const webBase = process.env.WEB_BASE_URL ?? "http://localhost:3000";
const opportunityId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const presentationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const width = 1440;

function jsonResponse(body, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
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

async function routeApi(page, handler) {
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

    if (await handler(route, url, method)) {
      return;
    }

    await route.continue();
  });
}

async function screenshot(page, name) {
  await page.waitForTimeout(600);
  const file = path.join(outDir, `${name}-${width}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(JSON.stringify({ scenario: name, file, width }));
}

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const results = [];

async function runScenario(name, fn) {
  const page = await browser.newPage({ viewport: { width, height: 1024 } });
  try {
    await fn(page);
    results.push({ name, ok: true });
  } catch (error) {
    console.error(JSON.stringify({ scenario: name, error: String(error) }));
    results.push({ name, ok: false, error: String(error) });
  } finally {
    await page.close();
  }
}

await runScenario("01-new-client-empty", async (page) => {
  await routeApi(page, async (route, url, method) => {
    if (url.match(/\/opportunities$/) && method === "GET") {
      await route.fulfill(jsonResponse([]));
      return true;
    }
    if (url.includes("/opportunities/recent-work")) {
      await route.fulfill(jsonResponse([]));
      return true;
    }
    return false;
  });
  await page.goto(`${webBase}/clients`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForSelector("[data-testid='clients-new-client-state']", { timeout: 90000 });
  await screenshot(page, "01-new-client-empty");
});

await runScenario("02-missing-information-premeting", async (page) => {
  await routeApi(page, async () => false);
  await page.goto(`${webBase}/upload?new=1`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForSelector(".pre-meeting-page", { timeout: 90000 });
  await page.click(".pre-meeting-create-button");
  await page.waitForSelector("[data-testid='pre-meeting-missing-information']", { timeout: 90000 });
  await screenshot(page, "02-missing-information-premeting");
});

await runScenario("03-transcript-processing", async (page) => {
  await routeApi(page, async (route, url) => {
    if (url.endsWith(`/opportunities/${opportunityId}`)) {
      await route.fulfill(
        jsonResponse({
          id: opportunityId,
          client_name: "Acme GmbH",
          opportunity_name: "First meeting",
          department: "Sales",
          language: "en",
          pii_redaction_enabled: true,
          status: "active",
        }),
      );
      return true;
    }
    if (url.includes(`/opportunities/${opportunityId}/transcripts`)) {
      await route.fulfill(
        jsonResponse([
          {
            id: "tr-1",
            file_name: "workshop_call.txt",
            processing_status: "pending",
          },
        ]),
      );
      return true;
    }
    if (url.includes("/journey-stage-eligibility")) {
      await route.fulfill(
        jsonResponse({
          schema_version: "1.0",
          opportunity_id: opportunityId,
          requested_journey_stage: "deepening",
          startable: true,
          prerequisite_stage: "first_contact",
          stages: [
            {
              journey_stage: "deepening",
              startable: true,
              prerequisite_stage: "first_contact",
            },
          ],
        }),
      );
      return true;
    }
    if (url.includes(`/opportunities/${opportunityId}/client-documents`)) {
      await route.fulfill(jsonResponse([]));
      return true;
    }
    return false;
  });
  await page.goto(
    `${webBase}/upload?opportunityId=${opportunityId}&journeyStage=deepening`,
    { waitUntil: "networkidle", timeout: 90000 },
  );
  await page.waitForSelector(".post-meeting-page", { timeout: 90000 });
  await page.waitForSelector("[data-testid='transcript-processing-state']", {
    state: "attached",
    timeout: 90000,
  });
  await screenshot(page, "03-transcript-processing");
});

await runScenario("04-generation-failed-recovery", async (page) => {
  await routeApi(page, async (route, url) => {
    if (url.endsWith(`/opportunities/${opportunityId}`)) {
      await route.fulfill(
        jsonResponse({
          id: opportunityId,
          client_name: "Acme GmbH",
          opportunity_name: "First meeting",
          department: "Sales",
          language: "en",
          status: "active",
        }),
      );
      return true;
    }
    if (url.includes(`/opportunities/${opportunityId}/jobs/latest`)) {
      await route.fulfill(
        jsonResponse({
          id: "job-failed-figma08",
          job_type: "framework_generation",
          status: "FAILED",
          current_stage: "FRAMEWORK_SYNTHESIZING",
          error: {
            code: "FRAMEWORK_GENERATION_FAILED",
            message: "Framework synthesis failed",
            retryable: true,
          },
        }),
      );
      return true;
    }
    if (url.includes(`/opportunities/${opportunityId}/jobs/active`)) {
      await route.fulfill(jsonResponse({ error: { code: "ACTIVE_JOB_NOT_FOUND" } }, 404));
      return true;
    }
    if (url.includes(`/opportunities/${opportunityId}/framework`)) {
      await route.fulfill(jsonResponse({ error: { code: "NOT_FOUND" } }, 404));
      return true;
    }
    if (url.includes(`/opportunities/${opportunityId}/transcripts`)) {
      await route.fulfill(jsonResponse([{ id: "tr-1", file_name: "call.txt", processing_status: "processed" }]));
      return true;
    }
    return false;
  });
  await page.goto(`${webBase}/framework-review?opportunityId=${opportunityId}`, {
    waitUntil: "networkidle",
    timeout: 90000,
  });
  await page.waitForSelector("[data-testid='auth-ready']", { state: "attached", timeout: 90000 });
  await page.waitForSelector("[data-recovery-category='TERMINAL_FAILURE']", {
    state: "attached",
    timeout: 90000,
  });
  await screenshot(page, "04-generation-failed-recovery");
});

await runScenario("05-ready-email-state", async (page) => {
  await routeApi(page, async (route, url) => {
    if (url.includes("/journey-stage-eligibility")) {
      await route.fulfill(
        jsonResponse({
          schema_version: "1.0",
          opportunity_id: opportunityId,
          requested_journey_stage: "deepening",
          startable: true,
          prerequisite_stage: "first_contact",
          stages: [
            {
              journey_stage: "deepening",
              startable: true,
              prerequisite_stage: "first_contact",
            },
          ],
        }),
      );
      return true;
    }
    if (url.endsWith(`/opportunities/${opportunityId}`)) {
      await route.fulfill(
        jsonResponse({
          id: opportunityId,
          client_name: "Acme GmbH",
          opportunity_name: "First meeting",
          followup_statics: {
            project_name: "Acme GmbH Pitch",
            client_short: "Acme GmbH",
            salutation_style: "informal",
            standard_recipients: [
              {
                email: "mira@acme.example",
                first_name: "Mira",
                last_name: "Koch",
                salutation: "Ms",
                kind: "to",
                primary: true,
              },
            ],
            sender_profile: {
              name: "Elena",
              role: "Lead",
              email: "elena@borek.example",
            },
          },
        }),
      );
      return true;
    }
    if (url.includes(`/opportunities/${opportunityId}/email-drafts`)) {
      await route.fulfill(
        jsonResponse({
          journey_stage: "deepening",
          draft: null,
          send_status: "not_sent",
        }),
      );
      return true;
    }
    return false;
  });
  await page.goto(
    `${webBase}/followup-review?opportunityId=${opportunityId}&journeyStage=deepening&demo=1`,
    { waitUntil: "networkidle", timeout: 90000 },
  );
  await page.waitForSelector("[data-testid='auth-ready']", { state: "attached", timeout: 90000 });
  await page.waitForSelector("[data-testid='follow-up-subject']", { timeout: 90000 });
  await page.waitForSelector("[data-testid='follow-up-readiness-state']", {
    state: "attached",
    timeout: 90000,
  });
  await screenshot(page, "05-ready-email-state");
});

await runScenario("06-archived-empty", async (page) => {
  await routeApi(page, async (route, url) => {
    if (url.includes("/archive/artifacts")) {
      await route.fulfill(jsonResponse([]));
      return true;
    }
    return false;
  });
  await page.goto(`${webBase}/archive`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForSelector("[data-testid='archive-empty-state']", { timeout: 90000 });
  await screenshot(page, "06-archived-empty");
});

await browser.close();

const failed = results.filter((row) => !row.ok);
if (failed.length) {
  console.error("Capture validation incomplete for scenarios:", failed.map((row) => row.name));
  process.exitCode = 1;
}
