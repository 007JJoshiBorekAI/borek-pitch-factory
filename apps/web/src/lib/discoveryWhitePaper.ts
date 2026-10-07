// Renders Discovery Paper pages in the BOREK White Paper master design
// ("Borek White Paper Master October 1.html"). Inline styles are copied 1:1 from the master modules:
// M1 cover, M2 contents, M3 chapter opener, M4 content page, M5 deep dive, M9 closing.
import type { DiscoveryWorkspacePage, DiscoveryWorkspaceVersion } from "./discoveryWorkspace";

export const SHEET_W = 794; // A4 at 96 dpi
export const SHEET_H = 1123;

const INK = "#0D1240";
const SLATE = "#5C6178";
const BLUE = "#005099";
const RULE = "#E2E4EC";
const TINT = "#F3F4F8";
const MONO = "ui-monospace,Menlo,Consolas,monospace";
const SANS = "'Inter',Verdana,sans-serif";
const PENDING = "To be established in the first meeting.";

type Obj = Record<string, unknown>;

const ORIGIN: Record<string, string> = {
  USER_INPUT: "Provided by the client team",
  GROUNDED_TEMPLATE: "Standard Borek wording",
  UNKNOWN: "Not yet established",
};
const UNKNOWN_LABEL: Record<string, string> = {
  description: "Company description",
  headquarters: "Headquarters",
  employee_headcount: "Employee headcount",
  decision_makers: "Decision makers",
  revenue: "Revenue",
};

export interface SheetContext {
  client: string;
  contact: string;
  purpose: string;
  stamp: string; // MM/YYYY
  asOf: string; // MM/YY
  year: number;
  base: string; // asset base URL, e.g. "/whitepaper" or "https://host/whitepaper"
}

export const esc = (v: unknown): string =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const origin = (v: unknown): string => ORIGIN[s(v)] ?? (s(v) ? s(v).replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()) : "");

function header(left: string, right: string, dark = false): string {
  const border = dark ? "rgba(255,255,255,.18)" : RULE;
  const color = dark ? "rgba(255,255,255,.6)" : SLATE;
  return `<div style="display:flex;justify-content:space-between;align-items:baseline;padding-bottom:12px;border-bottom:1px solid ${border};font-family:${MONO};font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:${color}"><span>${esc(left)}</span><span>${esc(right)}</span></div>`;
}

function footer(c: SheetContext, n: number, dark = false): string {
  const color = dark ? "rgba(255,255,255,.7)" : SLATE;
  return `<div style="position:absolute;left:76px;right:76px;bottom:40px;display:flex;justify-content:space-between;font-family:${MONO};font-size:9.5px;letter-spacing:.06em;color:${color}"><span>BOREK SOLUTIONS GROUP · ${esc(c.stamp)}</span><span>${String(n).padStart(2, "0")}</span></div>`;
}

function sheet(id: string, label: string, body: string, dark: boolean, extra: string): string {
  return `<section class="page" id="${id}" data-screen-label="${esc(label)}" style="position:relative;width:${SHEET_W}px;height:${SHEET_H}px;background:${dark ? INK : "#FFFFFF"};color:${dark ? "#FFFFFF" : INK};font-family:${SANS};box-sizing:border-box;overflow:hidden;${extra}">${body}</section>`;
}

const PAD = "padding:56px 76px 90px";
const para = (t: string) => `<p style="margin:8px 0 0;font-size:13.5px;line-height:1.6;color:${SLATE};text-wrap:pretty">${esc(t)}</p>`;

function point(n: number, heading: string, text = "", first = false): string {
  return `<div style="display:grid;grid-template-columns:44px 1fr;gap:8px 20px;padding:20px 0;${first ? `border-top:2px solid ${INK};` : ""}border-bottom:1px solid ${RULE}"><span style="font-family:${MONO};font-size:11px;color:${BLUE};padding-top:4px">${String(n).padStart(2, "0")}</span><div><div style="font-size:16px;font-weight:500;letter-spacing:-.01em;line-height:1.3">${esc(heading)}</div>${text ? para(text) : ""}</div></div>`;
}

function table(headers: [string, string][], rows: string[][], widths: string[], top = 36): string {
  const head = headers
    .map(([t, pad], i) => `<th style="text-align:left;font-family:${MONO};font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;color:${SLATE};font-weight:500;padding:${pad}${widths[i] ? `;width:${widths[i]}` : ""}">${esc(t)}</th>`)
    .join("");
  const body = rows
    .map((cells, r) => {
      const tinted = r % 2 === 1;
      const bt = r === 0 ? `2px solid ${INK}` : `1px solid ${RULE}`;
      const bb = r === rows.length - 1 ? `border-bottom:1px solid ${RULE};` : "";
      const tds = cells
        .map((cell, c) => {
          const lastCol = c === cells.length - 1;
          const pad = c === 0 ? (tinted ? "12px 14px 12px 12px" : "12px 14px 12px 0") : lastCol ? (tinted ? "12px 12px 12px 0" : "12px 0") : "12px 14px 12px 0";
          const style = c === 0 ? "font-weight:500" : tinted ? "" : `color:${SLATE}`;
          return `<td style="border-top:${bt};${bb}padding:${pad};vertical-align:top;${style}">${esc(cell)}</td>`;
        })
        .join("");
      return `<tr${tinted ? ` style="background:${TINT}"` : ""}>${tds}</tr>`;
    })
    .join("");
  return `<table style="width:100%;border-collapse:collapse;margin-top:${top}px;font-size:12.5px;line-height:1.5"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

const notes = (list: string[]) =>
  `<div style="margin-top:28px;border-top:1px solid ${RULE};padding-top:14px;font-size:9.5px;line-height:1.6;color:${SLATE};display:grid;grid-template-columns:16px 1fr;gap:2px 8px">${list.map((n, i) => `<span style="color:${BLUE}">${i + 1}</span><span>${esc(n)}</span>`).join("")}</div>`;
const sup = (n: number) => `<sup style="font-size:10px;color:${BLUE}">${n}</sup>`;
const lead = (t: string, fn = true) => `<p style="margin:40px 0 0;font-size:16px;line-height:1.55;max-width:600px;text-wrap:pretty">${esc(t)}${fn ? sup(1) : ""}</p>`;
const mono = (t: string) => `<span style="font-family:${MONO};font-size:9px;letter-spacing:.09em;text-transform:uppercase;color:${SLATE};padding-top:4px">${esc(t)}</span>`;

function deepItem(n: number, title: string, rows: [string, string, boolean][], status: string): string {
  const grid = rows.map(([l, t, strong]) => `${mono(l)}<p style="margin:0;${strong ? "font-weight:500" : `color:${SLATE}`};text-wrap:pretty">${esc(t)}</p>`).join("");
  return `<div style="margin-top:26px;border-top:2px solid ${INK};padding-top:14px;display:grid;grid-template-columns:44px 1fr;gap:0 20px;align-items:baseline"><span style="font-family:${MONO};font-size:11px;color:${BLUE}">${String(n).padStart(2, "0")}</span><div style="font-size:16px;font-weight:500;letter-spacing:-.01em;line-height:1.3">${esc(title)}</div></div><div style="margin-top:12px;display:grid;grid-template-columns:44px 1fr;gap:0 20px"><span></span><div><div style="display:grid;grid-template-columns:92px 1fr;gap:10px 16px;padding:12px 0;border-top:1px solid ${RULE};border-bottom:1px solid ${RULE};font-size:12.5px;line-height:1.55">${grid}</div><div style="display:grid;grid-template-columns:92px 1fr;gap:16px;padding:10px 0;border-bottom:1px solid ${RULE};font-size:12.5px;line-height:1.5"><span style="color:${BLUE}">▸</span><span><b style="font-weight:500">Status:</b> ${esc(status)}</span></div></div></div>`;
}

// A missing company name stays missing: the sheet is labelled without one instead of with a stand-in.
const paperLabel = (c: SheetContext) => (c.client ? `${c.client} · Discovery Paper` : "Discovery Paper");
const preparedFor = (c: SheetContext) => {
  const audience = c.contact && c.client ? `${c.contact} at ${c.client}` : c.contact || c.client;
  return `Prepared ${audience ? `for ${audience} ` : ""}ahead of the first meeting: what we know, what we still need to learn, and how we propose to start.`;
};

const running = (c: SheetContext) => `Client discovery · Discovery Paper ${c.year}`;

// ---------------------------------------------------------------- modules
function cover(c: SheetContext, subtitle?: string): string {
  const body = `<img src="${c.base}/cover.png" alt="" style="position:absolute;left:0;top:0;width:100%;height:100%;display:block;object-fit:cover"><div style="position:relative;z-index:2;display:flex;justify-content:space-between;align-items:flex-start"><img src="${c.base}/logo.svg" alt="BOREK Solutions Group" style="width:168px;height:auto;display:block"><div style="text-align:right;font-family:${MONO};font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.7);line-height:1.7">Discovery Paper ${c.year}<br>As of ${esc(c.asOf)}</div></div><div style="position:relative;z-index:2;margin-top:72px"><div style="font-family:${MONO};font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.6)">${esc(paperLabel(c))}</div><h1 style="margin:18px 0 0;font-size:62px;font-weight:300;letter-spacing:-.025em;line-height:1.02;max-width:600px;text-wrap:balance">${esc(c.purpose || c.client || "Discovery Paper")}</h1><p style="margin:28px 0 0;max-width:520px;font-size:15px;line-height:1.65;color:rgba(255,255,255,.72);text-wrap:pretty">${esc(subtitle ?? preparedFor(c))}</p></div><div style="position:relative;z-index:2;margin-top:auto;display:flex;justify-content:space-between;padding-top:16px;border-top:1px solid rgba(255,255,255,.18);font-family:${MONO};font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.6)"><span>Borek Solutions Group · Braunschweig</span><span>boreksolutions.de</span></div>`;
  return sheet("cover", "M1 · Cover", body, true, "display:flex;flex-direction:column;padding:64px 76px 60px");
}

function opener(c: SheetContext, n: number, chapter: string, headline: string, p1: string, p2: string, key: string, pageNo: number): string {
  const body = `${header(running(c), `${String(n).padStart(2, "0")} · ${chapter}`, true)}<div style="margin-top:72px;display:flex;align-items:center;gap:44px"><div style="font-size:88px;font-weight:300;line-height:.9;letter-spacing:-.03em;color:#FFFFFF">${String(n).padStart(2, "0")}</div><div><div style="font-size:12px;font-weight:600;letter-spacing:.09em;text-transform:uppercase">${esc(chapter)}</div></div></div><h2 style="margin:40px 0 0;font-size:40px;font-weight:300;letter-spacing:-.02em;line-height:1.1;max-width:600px;text-wrap:balance">${esc(headline)}</h2><div style="margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:40px"><p style="margin:0;font-size:14px;line-height:1.65;color:rgba(255,255,255,.9);text-wrap:pretty">${esc(p1)}</p><p style="margin:0;font-size:14px;line-height:1.65;color:rgba(255,255,255,.7);text-wrap:pretty">${esc(p2)}</p></div><div style="position:absolute;left:76px;right:76px;bottom:110px;border-top:1px solid rgba(255,255,255,.35);padding-top:24px"><div style="font-family:${MONO};font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.7)">Key message</div><p style="margin:14px 0 0;font-size:30px;font-weight:300;letter-spacing:-.02em;line-height:1.2;max-width:620px;text-wrap:balance">${esc(key)}</p></div>${footer(c, pageNo, true)}`;
  return sheet(`ch-${n}`, "M3 · Chapter opener", body, true, PAD);
}

function clientContext(c: SheetContext, ct: Obj, pageNo: number): string {
  const facts = arr(ct.known_facts).map(obj);
  const unknowns = arr(ct.unknowns).map((u) => UNKNOWN_LABEL[s(u)] ?? s(u).replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase()));
  const body = `${header(running(c), "01 · Client context")}${lead(s(ct.summary))}<div style="margin-top:28px">${facts.map((f, i) => point(i + 1, `${s(f.label)}: ${s(f.value)}`, origin(f.origin), i === 0)).join("")}</div>${unknowns.length ? table([["Open item", "0 14px 10px 0"], ["Status", "0 0 10px 0"]], unknowns.map((u) => [u, PENDING]), ["30%"]) : ""}${notes(["Facts are shown with their origin. Open items are listed and deliberately left blank until verified; nothing is inferred."])}${footer(c, pageNo)}`;
  return sheet("client_context", "M4 · Content page", body, false, PAD);
}

function deepDive(c: SheetContext, n: number, chapter: string, ct: Obj, fallbackTitle: string, intro: string, pageNo: number): string {
  const known = ct.availability !== "unknown" && s(ct.statement);
  const rows: [string, string, boolean][] = known
    ? [["Solution", s(ct.statement), false], ["Source", origin(ct.origin) || "—", true]]
    : [["Solution", PENDING, false], ["Result", "Not yet established.", true]];
  const body = `${header(running(c), `${String(n).padStart(2, "0")} · ${chapter}`)}<h2 style="margin:36px 0 0;font-size:26px;font-weight:300;letter-spacing:-.02em;line-height:1.15">${esc(chapter)}</h2><p style="margin:10px 0 0;font-size:13px;line-height:1.55;color:${SLATE};text-wrap:pretty">${esc(intro)}</p>${deepItem(1, s(ct.title) || fallbackTitle, rows, known ? origin(ct.origin) : "Not yet established")}${footer(c, pageNo)}`;
  return sheet(`deep-${n}`, "M5 · Deep dive", body, false, PAD);
}

function pilot(c: SheetContext, ct: Obj, pageNo: number): string {
  const terms = s(ct.commercial_terms || "not_included").replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase());
  const body = `${header(running(c), "05 · Pilot proposal")}${lead(s(ct.concept))}${table([["Pilot", "0 14px 10px 0"], ["Scope", "0 0 10px 0"]], [["Commercial terms", terms], ["Meeting topic", c.purpose || "—"]], ["30%"], 28)}${notes(["This paper is not a commitment. Pricing and duration are discussed only after the first meeting."])}${footer(c, pageNo)}`;
  return sheet("pilot_proposal", "M4 · Content page", body, false, PAD);
}

function nextSteps(c: SheetContext, ct: Obj, pageNo: number): string {
  const items = arr(ct.items).map(obj).sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
  const body = `${header(running(c), "06 · Next steps")}${lead("What happens before and at the first meeting:", false)}<div style="margin-top:28px">${items.map((it, i) => point(i + 1, s(it.label), origin(it.origin), i === 0)).join("")}</div>${notes(["Next steps are proposals for the first meeting and are not a commitment."])}${footer(c, pageNo)}`;
  return sheet("next_steps", "M4 · Content page", body, false, PAD);
}

function plain(c: SheetContext, p: DiscoveryWorkspacePage, index: number, pageNo: number): string {
  const paras = p.body.split(/\n\s*\n/).filter(Boolean);
  const body = `${header(running(c), `${String(index).padStart(2, "0")} · ${p.label}`)}<h2 style="margin:36px 0 0;font-size:26px;font-weight:300;letter-spacing:-.02em;line-height:1.15">${esc(p.title || p.label)}</h2><div style="margin-top:24px;border-top:2px solid ${INK}">${paras.map((t) => `<p style="margin:0;padding:16px 0;border-bottom:1px solid ${RULE};font-size:13.5px;line-height:1.6;color:${SLATE};white-space:pre-wrap;text-wrap:pretty">${esc(t)}</p>`).join("")}</div>${footer(c, pageNo)}`;
  return sheet(p.id, "M4 · Content page", body, false, PAD);
}

function contents(c: SheetContext, unknownCount: number): string {
  const chapters: [string, number][] = [["Client context", 3], ["Opportunity", 4], ["Borek approach", 5], ["Relevant use case", 6], ["Pilot proposal", 7], ["Next steps", 8]];
  const rows = chapters
    .map(([t, pg], i) => `<div style="display:grid;grid-template-columns:36px 1fr auto;gap:16px;align-items:baseline;padding:16px 0;border-top:1px solid ${RULE}${i === chapters.length - 1 ? `;border-bottom:1px solid ${RULE}` : ""}"><span style="font-size:15px;font-weight:300;color:${BLUE}">${String(i + 1).padStart(2, "0")}</span><span style="font-size:15px;font-weight:500;line-height:1.3">${esc(t)}</span><span style="font-family:${MONO};font-size:11px;color:${SLATE}">${String(pg).padStart(2, "0")}</span></div>`)
    .join("");
  const stmt = (t: string) => `<p style="margin:20px 0 0;font-size:17px;font-weight:300;line-height:1.4;letter-spacing:-.01em;text-wrap:pretty">${esc(t)}</p>`;
  const meta = (k: string, v: string) => `<div><div style="font-family:${MONO};font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:${SLATE}">${k}</div><div style="margin-top:8px;font-size:13px;line-height:1.6">${v}</div></div>`;
  const body = `${header(running(c), paperLabel(c))}<h2 style="margin:64px 0 0;font-size:38px;font-weight:300;letter-spacing:-.02em;line-height:1.1">Contents</h2><div style="margin-top:36px;display:grid;grid-template-columns:1fr 1fr;gap:0 56px"><div>${rows}</div><div style="border-left:1px solid ${RULE};padding-left:32px"><div style="font-size:12px;font-weight:600;letter-spacing:.09em;text-transform:uppercase">In short</div>${stmt(c.purpose ? `${c.client} wants to talk about ${c.purpose}.` : `This paper prepares the first meeting with ${c.client}.`)}${stmt(unknownCount ? `${unknownCount} company facts are still open; we list them rather than guess.` : "All company facts used here are confirmed.")}${stmt("We propose a discovery pilot. Commercial terms are not part of this paper.")}<p style="margin:36px 0 0;font-size:13px;line-height:1.6;color:${SLATE};text-wrap:pretty">Scope note: this paper is written for the first meeting. It uses only the information supplied by the client team and verified research. Anything not yet known is marked as such and is not filled in. It contains no pricing and is not a commitment.</p></div></div><div style="margin-top:64px;border-top:2px solid ${INK};padding-top:20px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:32px">${meta("Publisher", "BOREK Solutions Group<br>Altewiekring 20 A · 38102 Braunschweig")}${meta("Prepared for", `${esc(c.client)}<br>${esc(c.contact)}`)}${meta("Contact", "T +49 531 283 541 61<br>boreksolutions.de")}</div>${footer(c, 2)}`;
  return sheet("contents", "M2 · Contents", body, false, PAD);
}

function closing(c: SheetContext, unknownCount: number, pageNo: number): string {
  const body = `${header(running(c), "Conclusion", true)}<div style="margin-top:72px;display:flex;align-items:center;gap:44px"><div style="font-size:88px;font-weight:300;line-height:.9;letter-spacing:-.03em;color:#FFFFFF">07</div><div><div style="font-size:12px;font-weight:600;letter-spacing:.09em;text-transform:uppercase">Conclusion</div></div></div><h2 style="margin:40px 0 0;font-size:40px;font-weight:300;letter-spacing:-.02em;line-height:1.1;max-width:600px;text-wrap:balance">Start with what is known, learn the rest together.</h2><div style="margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:40px"><p style="margin:0;font-size:14px;line-height:1.65;color:rgba(255,255,255,.85);text-wrap:pretty">This paper sets out what we know about ${esc(c.client || "the client")}, the purpose of the first meeting and a proposed discovery pilot.</p><p style="margin:0;font-size:14px;line-height:1.65;color:rgba(255,255,255,.7);text-wrap:pretty">${unknownCount} open items will be collected in the first meeting, so that the next document rests on facts, not assumptions.</p></div><div style="margin-top:auto"><div style="border-top:1px solid rgba(255,255,255,.18);padding-top:28px"><p style="margin:0;font-size:34px;font-weight:300;letter-spacing:-.02em;line-height:1.15;max-width:600px;text-wrap:balance">Let us establish the first baseline together.</p></div><div style="margin-top:56px;display:flex;justify-content:space-between;align-items:flex-end;gap:40px"><img src="${c.base}/logo.svg" alt="BOREK Solutions Group" style="width:150px;height:auto;display:block"><div style="text-align:right;font-size:12.5px;line-height:1.8;color:rgba(255,255,255,.66)"><b style="color:#FFFFFF;font-weight:500">Your AI Department. Delivered, not built.</b><br>T +49 531 283 541 61 · boreksolutions.de<br>Altewiekring 20 A · 38102 Braunschweig</div></div><div style="display:flex;justify-content:space-between;margin-top:28px;padding-top:14px;border-top:1px solid rgba(255,255,255,.18);font-family:${MONO};font-size:9.5px;letter-spacing:.06em;color:rgba(255,255,255,.6)"><span>BOREK SOLUTIONS GROUP · ${esc(c.stamp)}</span><span>${String(pageNo).padStart(2, "0")}</span></div></div>`;
  return sheet("closing", "M9 · Closing", body, true, "display:flex;flex-direction:column;padding:56px 76px 60px");
}

// ---------------------------------------------------------------- public API
export function buildContext(version: DiscoveryWorkspaceVersion, client: string | undefined, base: string): SheetContext {
  const byId = (id: string) => obj(version.pages.find((p) => p.id === id)?.content);
  const cv = byId("cover");
  const opp = byId("opportunity");
  const known = arr(byId("client_context").known_facts).map(obj);
  const fact = (label: string) => s(known.find((f) => s(f.label) === label)?.value);
  const now = new Date();
  return {
    client: s(cv.client_name) || client || fact("Company Name"),
    contact: s(cv.contact_name) || fact("Contact Person"),
    purpose: s(cv.meeting_purpose) || s(opp.meeting_purpose),
    stamp: `${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`,
    asOf: `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getFullYear()).slice(2)}`,
    year: now.getFullYear(),
    base,
  };
}

/** One Discovery page as a white-paper A4 sheet. `pageNo` is the printed folio. */
export function renderDiscoverySheet(page: DiscoveryWorkspacePage, c: SheetContext, index: number, pageNo = index + 1): string {
  const ct = obj(page.content);
  if (!page.content) return page.id === "cover" ? cover(c) : plain(c, page, index, pageNo);
  switch (page.id) {
    case "cover":
      return cover(c);
    case "client_context":
      return clientContext(c, ct, pageNo);
    case "opportunity": {
      const purpose = s(ct.meeting_purpose) || c.purpose;
      const src = s(ct.meeting_purpose_source).replace(/_/g, " ");
      return opener(c, 2, "Opportunity", purpose, s(ct.statement), `Source of the meeting purpose: ${src || "client input"}. Origin: ${origin(ct.origin) || "client input"}.`, `The first meeting is about ${purpose}.`, pageNo);
    }
    case "borek_approach":
      return deepDive(c, 3, "Borek approach", ct, "Borek approach", "How Borek would approach this. Nothing is filled in until it is grounded in a verified source.", pageNo);
    case "relevant_use_case":
      return deepDive(c, 4, "Relevant use case", ct, "Relevant use case", "The most relevant completed use case. Nothing is filled in until it is grounded in a verified source.", pageNo);
    case "pilot_proposal":
      return pilot(c, ct, pageNo);
    case "next_steps":
      return nextSteps(c, ct, pageNo);
    default:
      return plain(c, page, index, pageNo);
  }
}

export function discoveryPrintCss(base: string): string {
  const subsets = ["cyrillic-ext", "cyrillic", "greek-ext", "greek", "vietnamese", "latin-ext", "latin"];
  const faces = subsets.map((n) => `@font-face{font-family:'Inter';font-style:normal;font-weight:300 600;font-display:swap;src:url('${base}/inter-${n}.woff2') format('woff2')}`).join("");
  return `${faces}@page{size:210mm 297mm;margin:0}*{box-sizing:border-box}body{margin:0;font-family:${SANS};color:${INK};-webkit-font-smoothing:antialiased}.page{print-color-adjust:exact;-webkit-print-color-adjust:exact;page-break-after:always;break-after:page}.page:last-child{page-break-after:auto;break-after:auto}h1,h2{text-wrap:balance}`;
}

/** Full document: cover, contents, the Discovery pages, closing. Used for the PDF. */
export function renderDiscoveryDocument(version: DiscoveryWorkspaceVersion, client: string | undefined, base: string): string {
  const c = buildContext(version, client, base);
  const unknownCount = arr(obj(version.pages.find((p) => p.id === "client_context")?.content).unknowns).length;
  const sheets: string[] = [];
  version.pages.forEach((p, i) => {
    sheets.push(renderDiscoverySheet(p, c, i + 1, i === 0 ? 1 : i + 2));
    if (i === 0) sheets.push(contents(c, unknownCount));
  });
  sheets.push(closing(c, unknownCount, version.pages.length + 2));
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(paperLabel(c))}</title><style>${discoveryPrintCss(base)}</style></head><body>${sheets.join("")}</body></html>`;
}

/** Opens the browser print dialog on the white-paper document (choose "Save as PDF"). */
export function printDiscoveryPdf(version: DiscoveryWorkspaceVersion, client?: string): void {
  const html = renderDiscoveryDocument(version, client, `${window.location.origin}/whitepaper`);
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  const done = () => setTimeout(() => frame.remove(), 1000);
  const run = async () => {
    try {
      await doc.fonts?.ready;
      await Promise.all(Array.from(doc.images).map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = () => r(null); }))));
    } catch { /* print anyway */ }
    frame.contentWindow!.addEventListener("afterprint", done);
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
  };
  void run();
}
