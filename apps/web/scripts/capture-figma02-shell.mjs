import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "screenshots", "figma-02");
const demoOpportunityId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const routes = [
  { name: "01-upload", url: "/upload" },
  {
    name: "02-deepening-review",
    url: `/deepening/review?opportunityId=${demoOpportunityId}&demo=1`,
  },
  {
    name: "03-deck-center",
    url: `/deck-center?opportunityId=${demoOpportunityId}`,
  },
  {
    name: "04-followup-review",
    url: `/followup-review?opportunityId=${demoOpportunityId}&journeyStage=deepening&demo=1`,
  },
  { name: "05-clients", url: "/clients" },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
const base = process.env.WEB_BASE_URL ?? "http://localhost:3000";

fs.mkdirSync(outDir, { recursive: true });

const results = [];

for (const route of routes) {
  await page.goto(`${base}${route.url}`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForSelector(".workspace-sidebar", { timeout: 60000 });
  await page.waitForTimeout(1000);

  const shellMetrics = await page.evaluate(() => {
    const sidebar = document.querySelector(".workspace-sidebar");
    const topbar = document.querySelector(".workspace-topbar");
    const content = document.querySelector(".workspace-content .app-shell, .workspace-content .app-workspace-body");
    const activeLink = document.querySelector(".workspace-sidebar-link-active");
    const title = document.querySelector(".workspace-topbar-title");
    const styles = (el) => (el ? getComputedStyle(el) : null);

    const sidebarStyle = styles(sidebar);
    const topbarStyle = styles(topbar);
    const contentStyle = styles(content);
    const bodyStyle = getComputedStyle(document.body);

    return {
      finalUrl: window.location.href,
      hasShell: Boolean(sidebar && topbar),
      sidebarWidth: sidebar ? sidebar.getBoundingClientRect().width : null,
      topbarHeight: topbar ? topbar.getBoundingClientRect().height : null,
      contentPaddingLeft: contentStyle?.paddingLeft ?? null,
      activeNav: activeLink?.textContent?.trim() ?? null,
      pageTitle: title?.textContent?.trim() ?? null,
      fontFamily: bodyStyle.fontFamily,
      sidebarBg: sidebarStyle?.backgroundColor ?? null,
      topbarTitleColor: styles(title)?.color ?? null,
    };
  });

  const file = path.join(outDir, `${route.name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  results.push({ route: route.name, file, ...shellMetrics });
  console.log(JSON.stringify({ route: route.name, file, ...shellMetrics }));
}

await browser.close();
