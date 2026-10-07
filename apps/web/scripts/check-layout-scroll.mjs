// Browser check for page layout and scrolling across laptop and desktop viewports.
// Needs a running web app in development sign-in mode and its API:
//   WEB_BASE_URL (default http://localhost:3000), API_BASE_URL (default http://localhost:8000)
// Exits 1 when a page overflows horizontally, cannot be scrolled to its end, clips content,
// or leaves an action outside the reachable area.
import { chromium } from "playwright";

const base = process.env.WEB_BASE_URL ?? "http://localhost:3000";
const api = process.env.API_BASE_URL ?? "http://localhost:8000";
const viewports = [[1920, 1080], [1536, 864], [1440, 900], [1366, 768], [1280, 720], [1024, 768]];
const headers = { Authorization: "Bearer dev-bypass", "Content-Type": "application/json" };
const CLIENT = "Layout Check GmbH";

async function opportunityId() {
  const listed = await (await fetch(`${api}/opportunities`, { headers })).json();
  const existing = listed.find((row) => row.client_name === CLIENT);
  if (existing) return existing.id;
  const created = await (await fetch(`${api}/opportunities`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      client_name: CLIENT,
      opportunity_name: "Layout check",
      department: "Sales",
      stage1_intake: {
        client_web_page: "https://layout-check.example",
        poc_name: "Lena Layout",
        poc_position: "COO",
        sales_topic_description: "Support automation review for a distributor with several regional warehouses.",
        about_company: "Synthetic company used only for the layout check.",
      },
    }),
  })).json();
  await fetch(`${api}/opportunities/${created.id}/discovery-paper/generate`, { method: "POST", headers });
  return created.id;
}

function measure() {
  const doc = document.documentElement;
  const width = window.innerWidth;
  const name = (el) => `${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/).slice(0, 2).join(".")}`;
  const problems = [];
  if (doc.scrollWidth > doc.clientWidth + 1) problems.push(`horizontal overflow of ${doc.scrollWidth - doc.clientWidth}px`);
  for (const root of [doc, document.body]) {
    if (/hidden|clip/.test(getComputedStyle(root).overflowY)) problems.push(`${root.tagName.toLowerCase()} blocks vertical scrolling`);
  }
  for (const el of document.querySelectorAll(".app-workspace *")) {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    if (/hidden|clip/.test(style.overflowY) && el.clientHeight > 60 && el.scrollHeight > el.clientHeight + 4) {
      problems.push(`${name(el)} cuts off ${el.scrollHeight - el.clientHeight}px of content`);
    }
    if (el.matches("button, a.btn") && rect.right > width + 2 && rect.left < width) {
      problems.push(`${name(el)} extends past the right edge`);
    }
  }
  window.scrollTo(0, doc.scrollHeight);
  const reached = window.scrollY;
  const end = doc.scrollHeight - window.innerHeight;
  window.scrollTo(0, 0);
  if (end > 2 && reached < end - 2) problems.push(`page stops scrolling at ${Math.round(reached)} of ${end}px`);
  return problems;
}

// The login screen is designed as one full-screen frame: nothing may need scrolling.
function measureLogin() {
  const doc = document.documentElement;
  const problems = [];
  if (doc.scrollHeight > window.innerHeight + 1) problems.push(`needs ${doc.scrollHeight - window.innerHeight}px of vertical scrolling`);
  if (doc.scrollWidth > window.innerWidth) problems.push(`horizontal overflow of ${doc.scrollWidth - window.innerWidth}px`);
  const required = {
    artwork: ".auth-brand-visual",
    headline: ".auth-brand-headline",
    "supporting copy": ".auth-tagline",
    "brand footer": ".auth-footer-brand",
    welcome: ".auth-main-header h1",
    "sign-in button": "button.auth-microsoft",
    "language selector": ".auth-language",
    "support copy": ".auth-support",
  };
  const boxes = {};
  for (const [label, selector] of Object.entries(required)) {
    const el = document.querySelector(selector);
    if (!el) { problems.push(`${label} is missing`); continue; }
    const rect = el.getBoundingClientRect();
    boxes[label] = rect;
    if (rect.height < 2 || rect.top < 0 || rect.left < 0 || rect.bottom > window.innerHeight + 1 || rect.right > window.innerWidth + 1) {
      problems.push(`${label} is not fully inside the viewport`);
    }
  }
  // Only shown where Microsoft sign-in (or the deployed preview) is active.
  const remember = document.querySelector(".auth-remember");
  if (remember && remember.getBoundingClientRect().bottom > window.innerHeight + 1) problems.push("keep-me-signed-in is below the fold");
  const order = ["headline", "supporting copy", "brand footer"];
  for (let index = 1; index < order.length; index += 1) {
    const above = boxes[order[index - 1]];
    const below = boxes[order[index]];
    if (above && below && below.top < above.bottom - 1) problems.push(`${order[index]} overlaps ${order[index - 1]}`);
  }
  const image = document.querySelector(".auth-artwork");
  const frame = document.querySelector(".auth-brand-visual");
  if (image && frame) {
    const a = image.getBoundingClientRect();
    const b = frame.getBoundingClientRect();
    if (Math.abs(a.height - b.height) > 1 || Math.abs(a.width - b.width) > 1) problems.push("artwork does not fill its panel");
    if (getComputedStyle(image).objectFit !== "cover") problems.push("artwork may be distorted (object-fit is not cover)");
  }
  return problems;
}

const id = await opportunityId();
const browser = await chromium.launch();
const failures = [];
let checked = 0;

for (const [width, height] of viewports) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const record = async (label) => {
    await page.waitForTimeout(300);
    checked += 1;
    for (const problem of await page.evaluate(measure)) failures.push(`${width}x${height} ${label}: ${problem}`);
  };

  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  checked += 1;
  for (const problem of await page.evaluate(measureLogin)) failures.push(`${width}x${height} login: ${problem}`);
  await page.locator("main button.auth-microsoft").click();
  await page.waitForURL((url) => url.pathname === "/clients", { timeout: 20000 });
  await record("clients");

  await page.goto(`${base}/opportunities/new/client-information`, { waitUntil: "networkidle" });
  await record("add client, step 1");
  await page.getByRole("button", { name: "Save client information" }).click();
  await record("add client, step 1 with errors");
  await page.locator('input[name="company_name"]').fill("Viewport Check GmbH");
  await page.locator('input[name="website_url"]').fill("https://example.com");
  await page.locator("main select").first().selectOption({ index: 1 });
  await page.locator('input[name="contact_person"]').fill("Vera Viewport");
  await page.locator("#contact_position").fill("COO");
  await page.locator('input[type="tel"]').fill("+49 30 1234 5678");
  await page.locator('textarea[name="additional_information"]').fill("Synthetic. ".repeat(40));
  await page.getByRole("button", { name: "Save client information" }).click();
  await record("add client, step 2");

  for (const route of ["client-information", "discovery", "presentations", "meeting", "review", "follow-up", "post-meeting-presentation"]) {
    await page.goto(`${base}/opportunities/${id}/${route}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    await record(route);
  }
  await page.goto(`${base}/profile`, { waitUntil: "networkidle" });
  await record("profile");
  await context.close();
}
await browser.close();

for (const failure of failures) console.error(`FAIL ${failure}`);
console.log(`${checked} page/viewport combinations checked, ${failures.length} problem(s)`);
process.exit(failures.length ? 1 : 0);
