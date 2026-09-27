/**
 * FIGMA-07 visual validation capture.
 * Validation-only route mocks — does not modify production code.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import workshopClear from "../../../packages/contracts/fixtures/followup_extraction/workshop_clear.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "screenshots", "figma-07");
const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
const webBase = process.env.WEB_BASE_URL ?? "http://localhost:3000";
const opportunityId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const widths = [
  { name: "1440", width: 1440 },
  { name: "1280", width: 1280 },
  { name: "1024", width: 1024 },
];

const staticsFixture = {
  project_name: "Acme GmbH Pitch",
  client_short: "Acme GmbH",
  salutation_style: "informal",
  standard_recipients: [
    {
      email: "mira.koch@acme.example",
      first_name: "Mira",
      last_name: "Koch",
      salutation: "Ms",
      kind: "to",
      primary: true,
    },
  ],
  sender_profile: {
    name: "Elena Manovska",
    role: "Project Lead",
    email: "elena.manovska@borek.example",
  },
};

function opportunityFixture() {
  return {
    id: opportunityId,
    client_name: "Acme GmbH",
    opportunity_name: "First meeting",
    department: "Sales",
    language: "en",
    pii_redaction_enabled: true,
    status: "active",
    followup_statics: staticsFixture,
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

function jsonResponse(body, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

function demoDraftBody() {
  const extraction = workshopClear;
  return [
    "Hi Mira,",
    "",
    `thank you for your time on ${extraction.meeting_date}. Below is a short summary of what we agreed.`,
    "",
    "Key points",
    ...extraction.key_points.slice(0, 2).map((item) => `- ${item}`),
    "",
    "Best regards",
    staticsFixture.sender_profile.name,
  ].join("\n");
}

function eligibilityFixture() {
  return {
    schema_version: "1.0",
    opportunity_id: opportunityId,
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

async function installMocks(page, scenario) {
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
    if (url.includes("/journey-stage-eligibility")) {
      await route.fulfill(jsonResponse(eligibilityFixture()));
      return;
    }
    if (url.endsWith(`/opportunities/${opportunityId}`) && method === "GET") {
      await route.fulfill(jsonResponse(opportunityFixture()));
      return;
    }
    if (url.includes(`/opportunities/${opportunityId}/email-drafts`)) {
      if (scenario === "incomplete") {
        await route.fulfill(
          jsonResponse({
            journey_stage: "deepening",
            draft: null,
            send_status: "not_sent",
          }),
        );
        return;
      }
      if (scenario === "confirmed") {
        const subject = "Acme × Borek — proposed pilot and next steps";
        const body = demoDraftBody();
        await route.fulfill(
          jsonResponse({
            journey_stage: "deepening",
            send_status: "not_sent",
            draft: {
              id: "draft-figma-07",
              status: "confirmed",
              selected_length: "medium",
              confirmed_at: "2026-09-25T12:00:00.000Z",
              lengths: {
                short: { subject, body, word_count: 60 },
                medium: { subject, body, word_count: 80 },
                extensive: { subject, body, word_count: 100 },
              },
            },
          }),
        );
        return;
      }
    }

    await route.continue();
  });
}

async function waitForScenario(page, scenario) {
  await page.waitForSelector("[data-testid='auth-ready']", { state: "attached", timeout: 60000 });
  await page.waitForSelector("[data-testid='follow-up-email-workspace']", { timeout: 60000 });

  if (scenario === "incomplete") {
    await page.waitForSelector("[data-testid='follow-up-email-empty']", { timeout: 60000 });
    return;
  }

  await page.waitForSelector("[data-testid='follow-up-subject']", {
    state: "attached",
    timeout: 60000,
  });
  await page.waitForSelector("[data-testid='follow-up-body']", { timeout: 60000 });

  if (scenario === "confirmed") {
    await page.waitForFunction(
      () =>
        document.querySelector("[data-testid='followup-confirm-review']")?.textContent?.includes(
          "Confirmed",
        ),
      undefined,
      { timeout: 60000 },
    );
  } else {
    await page.waitForFunction(
      () =>
        /Confirm email/.test(
          document.querySelector("[data-testid='followup-confirm-review']")?.textContent ?? "",
        ),
      undefined,
      { timeout: 60000 },
    );
  }
}

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();

for (const scenario of [
  { name: "01-draft-ready", mode: "ready", demo: true },
  { name: "02-incomplete", mode: "incomplete", demo: false },
  { name: "03-confirmed", mode: "confirmed", demo: false },
]) {
  for (const viewport of widths) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: 1024 } });
    await installMocks(page, scenario.mode);
    const demoQuery = scenario.demo ? "&demo=1" : "";
    await page.goto(
      `${webBase}/followup-review?opportunityId=${opportunityId}&journeyStage=deepening${demoQuery}`,
      { waitUntil: "networkidle", timeout: 90000 },
    );
    await waitForScenario(page, scenario.mode);
    await page.waitForTimeout(600);
    const file = path.join(outDir, `${scenario.name}-${viewport.name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log(JSON.stringify({ scenario: scenario.name, file, width: viewport.width }));
    await page.close();
  }
}

await browser.close();
