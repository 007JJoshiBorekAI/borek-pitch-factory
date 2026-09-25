import { chromium } from "playwright";

const demoOpportunityId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const routes = [
  { name: "upload", url: "/upload" },
  { name: "deepening-review", url: `/deepening/review?opportunityId=${demoOpportunityId}&demo=1` },
  { name: "deck-center", url: `/deck-center?opportunityId=${demoOpportunityId}` },
  { name: "followup-review", url: `/followup-review?opportunityId=${demoOpportunityId}&journeyStage=deepening&demo=1` },
  { name: "clients", url: "/clients" },
  { name: "archive", url: "/archive" },
  { name: "activity", url: "/activity" },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });

for (const route of routes) {
  await page.goto(`http://localhost:3000${route.url}`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForSelector(".workspace-sidebar", { timeout: 60000 });
  await page.waitForTimeout(500);
  const metrics = await page.evaluate(() => {
    const q = (sel) => document.querySelector(sel);
    const rect = (el) => (el ? el.getBoundingClientRect() : null);
    const style = (el) => (el ? getComputedStyle(el) : null);
    const sidebar = q(".workspace-sidebar");
    const topbar = q(".workspace-topbar");
    const content = q(".workspace-content .app-shell, .workspace-content .app-workspace-body");
    const logo = q(".workspace-sidebar-logo-image");
    const product = q(".workspace-sidebar-product");
    const activeLink = q(".workspace-sidebar-link-active");
    const rail = q(".workspace-sidebar-active-rail");
    const title = q(".workspace-topbar-title");
    const langActive = q(".workspace-lang-option-active");
    const splash = q(".workspace-topbar-splash");
    const segments = [...document.querySelectorAll(".workspace-topbar-splash-segment")];

    return {
      url: location.pathname + location.search,
      redirectedToLogin: location.pathname === "/login",
      sidebarWidth: rect(sidebar)?.width ?? null,
      topbarHeight: rect(topbar)?.height ?? null,
      contentPaddingLeft: style(content)?.paddingLeft ?? null,
      logoWidth: rect(logo)?.width ?? null,
      logoHeight: rect(logo)?.height ?? null,
      logoTop: rect(logo)?.top ?? null,
      productTop: rect(product)?.top ?? null,
      firstNavTop: rect(q(".workspace-sidebar-link"))?.top ?? null,
      activeNav: activeLink?.textContent?.trim() ?? null,
      activeBg: style(activeLink)?.backgroundColor ?? null,
      railWidth: rect(rail)?.width ?? null,
      railHeight: rect(rail)?.height ?? null,
      pageTitle: title?.textContent?.trim() ?? null,
      titleFontSize: style(title)?.fontSize ?? null,
      titleFontWeight: style(title)?.fontWeight ?? null,
      titleColor: style(title)?.color ?? null,
      fontFamily: getComputedStyle(document.body).fontFamily,
      langActiveBg: style(langActive)?.backgroundColor ?? null,
      splashWidths: segments.map((el) => Math.round(el.getBoundingClientRect().width)),
      profileName: q(".workspace-profile-name")?.textContent?.trim() ?? null,
    };
  });
  console.log(JSON.stringify({ route: route.name, ...metrics }));
}

await browser.close();
