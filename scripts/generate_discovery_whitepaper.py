"""Render a Discovery Paper in the BOREK White Paper master design (HTML + PDF).

The page modules (M1 cover, M2 contents, M3 chapter opener, M4 content page,
M5 deep dive, M9 closing) reproduce the inline styles of
"Borek White Paper Master October 1.html" 1:1. Only the content changes.

Usage:
  python scripts/generate_discovery_whitepaper.py [paper.json] [-o OUT_DIR]

Defaults to packages/contracts/fixtures/discovery_paper.ready.json and writes
docs/discovery/Discovery_Paper_<client>.html and .pdf (A4, via Chrome/Edge).
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "whitepaper"
DEFAULT_INPUT = ROOT / "packages" / "contracts" / "fixtures" / "discovery_paper.ready.json"
DEFAULT_OUT = ROOT / "docs" / "discovery"

INK = "#0D1240"
SLATE = "#5C6178"
BLUE = "#005099"
RULE = "#E2E4EC"
TINT = "#F3F4F8"
MONO = "ui-monospace,Menlo,Consolas,monospace"
SANS = "'Inter',Verdana,sans-serif"

ORIGIN_LABEL = {
    "USER_INPUT": "Provided by the client team",
    "GROUNDED_TEMPLATE": "Standard Borek wording",
    "UNKNOWN": "Not yet established",
}
UNKNOWN_LABEL = {
    "description": "Company description",
    "headquarters": "Headquarters",
    "employee_headcount": "Employee headcount",
    "decision_makers": "Decision makers",
    "revenue": "Revenue",
}
PENDING = "To be established in the first meeting."


def e(value) -> str:
    return escape(str(value if value is not None else ""), quote=True)


def origin(value) -> str:
    return ORIGIN_LABEL.get(str(value), str(value).replace("_", " ").capitalize())


# --------------------------------------------------------------------------
# Page chrome (identical on every module)
# --------------------------------------------------------------------------

def header(left: str, right: str, dark: bool = False) -> str:
    border = "rgba(255,255,255,.18)" if dark else RULE
    color = "rgba(255,255,255,.6)" if dark else SLATE
    return (
        f'<div style="display:flex;justify-content:space-between;align-items:baseline;padding-bottom:12px;'
        f"border-bottom:1px solid {border};font-family:{MONO};font-size:9.5px;letter-spacing:.08em;"
        f'text-transform:uppercase;color:{color}"><span>{e(left)}</span><span>{e(right)}</span></div>'
    )


def footer(stamp: str, number: int, dark: bool = False) -> str:
    color = "rgba(255,255,255,.7)" if dark else SLATE
    return (
        f'<div style="position:absolute;left:76px;right:76px;bottom:40px;display:flex;justify-content:space-between;'
        f"font-family:{MONO};font-size:9.5px;letter-spacing:.06em;color:{color}\">"
        f"<span>BOREK SOLUTIONS GROUP · {e(stamp)}</span><span>{number:02d}</span></div>"
    )


def page(pid: str, label: str, body: str, dark: bool = False, extra: str = "") -> str:
    bg, fg = (INK, "#FFFFFF") if dark else ("#FFFFFF", INK)
    return (
        f'<section class="page" id="{pid}" data-screen-label="{e(label)}" style="position:relative;background:{bg};'
        f"color:{fg};font-family:{SANS};box-sizing:border-box;overflow:hidden;{extra}\">{body}</section>"
    )


def numbered_point(num: int, heading: str, text: str = "", first: bool = False) -> str:
    top = f"border-top:2px solid {INK};" if first else ""
    para = (
        f'<p style="margin:8px 0 0;font-size:13.5px;line-height:1.6;color:{SLATE};text-wrap:pretty">{e(text)}</p>'
        if text
        else ""
    )
    return (
        f'<div style="display:grid;grid-template-columns:44px 1fr;gap:8px 20px;padding:20px 0;{top}border-bottom:1px solid {RULE}">'
        f'<span style="font-family:{MONO};font-size:11px;color:{BLUE};padding-top:4px">{num:02d}</span>'
        f'<div><div style="font-size:16px;font-weight:500;letter-spacing:-.01em;line-height:1.3">{e(heading)}</div>{para}</div></div>'
    )


def th(text: str, pad: str, width: str = "") -> str:
    w = f";width:{width}" if width else ""
    return (
        f'<th style="text-align:left;font-family:{MONO};font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;'
        f'color:{SLATE};font-weight:500;padding:{pad}{w}">{e(text)}</th>'
    )


def table(headers: list[tuple[str, str]], rows: list[list[str]], widths: list[str], margin_top: int = 36) -> str:
    """Rows: first row ruled in ink, later rows hairline, every second row tinted (highlighted-row rule)."""
    head = "".join(
        th(text, pad, widths[i] if i < len(widths) else "") for i, (text, pad) in enumerate(headers)
    )
    body = []
    last = len(rows) - 1
    for r, cells in enumerate(rows):
        tinted = r % 2 == 1
        top = f"2px solid {INK}" if r == 0 else f"1px solid {RULE}"
        bottom = f"border-bottom:1px solid {RULE};" if r == last else ""
        tds = []
        for c, cell in enumerate(cells):
            if c == 0:
                pad = "12px 14px 12px 12px" if tinted else "12px 14px 12px 0"
                style = "font-weight:500"
            else:
                pad = "12px 12px 12px 0" if tinted and c == len(cells) - 1 else (
                    "12px 0" if c == len(cells) - 1 else "12px 14px 12px 0"
                )
                style = "" if tinted else f"color:{SLATE}"
            tds.append(
                f'<td style="border-top:{top};{bottom}padding:{pad};vertical-align:top;{style}">{e(cell)}</td>'
            )
        bg = f' style="background:{TINT}"' if tinted else ""
        body.append(f"<tr{bg}>{''.join(tds)}</tr>")
    return (
        f'<table style="width:100%;border-collapse:collapse;margin-top:{margin_top}px;font-size:12.5px;line-height:1.5">'
        f"<thead><tr>{head}</tr></thead><tbody>{''.join(body)}</tbody></table>"
    )


def footnotes(notes: list[str]) -> str:
    rows = "".join(f'<span style="color:{BLUE}">{i}</span><span>{e(n)}</span>' for i, n in enumerate(notes, 1))
    return (
        f'<div style="margin-top:28px;border-top:1px solid {RULE};padding-top:14px;font-size:9.5px;line-height:1.6;'
        f'color:{SLATE};display:grid;grid-template-columns:16px 1fr;gap:2px 8px">{rows}</div>'
    )


def sup(n: int, size: int = 10) -> str:
    return f'<sup style="font-size:{size}px;color:{BLUE}">{n}</sup>'


def mono_label(text: str, size: float = 9, pad: str = "padding-top:4px") -> str:
    return (
        f'<span style="font-family:{MONO};font-size:{size}px;letter-spacing:.09em;text-transform:uppercase;'
        f'color:{SLATE};{pad}">{e(text)}</span>'
    )


def deep_dive_item(num: int, title: str, rows: list[tuple[str, str, bool]], note: str) -> str:
    grid = "".join(
        mono_label(label)
        + f'<p style="margin:0;{"font-weight:500" if strong else f"color:{SLATE}"};text-wrap:pretty">{e(text)}</p>'
        for label, text, strong in rows
    )
    return (
        f'<div style="margin-top:26px;border-top:2px solid {INK};padding-top:14px;display:grid;grid-template-columns:44px 1fr;gap:0 20px;align-items:baseline">'
        f'<span style="font-family:{MONO};font-size:11px;color:{BLUE}">{num:02d}</span>'
        f'<div style="font-size:16px;font-weight:500;letter-spacing:-.01em;line-height:1.3">{e(title)}</div></div>'
        f'<div style="margin-top:12px;display:grid;grid-template-columns:44px 1fr;gap:0 20px"><span></span><div>'
        f'<div style="display:grid;grid-template-columns:92px 1fr;gap:10px 16px;padding:12px 0;border-top:1px solid {RULE};'
        f'border-bottom:1px solid {RULE};font-size:12.5px;line-height:1.55">{grid}</div>'
        f'<div style="display:grid;grid-template-columns:92px 1fr;gap:16px;padding:10px 0;border-bottom:1px solid {RULE};font-size:12.5px;line-height:1.5">'
        f'<span style="color:{BLUE}">▸</span><span><b style="font-weight:500">Status:</b> {e(note)}</span></div>'
        f"</div></div>"
    )


# --------------------------------------------------------------------------
# Document
# --------------------------------------------------------------------------

def build_html(paper: dict, font_base: str = "") -> str:
    pages = {p["key"]: p["content"] for p in paper["pages"]}
    intake = paper.get("intake_context", {})
    client = pages["cover"].get("client_name") or intake.get("client_name") or "Client"
    purpose = pages["cover"].get("meeting_purpose") or intake.get("meeting_purpose") or ""
    contact = pages["cover"].get("contact_name") or ""
    website = pages["cover"].get("website_url") or ""
    generated = datetime.fromisoformat(paper["generated_at"].replace("Z", "+00:00"))
    year, mm_yy, mm_yyyy = generated.year, generated.strftime("%m/%y"), generated.strftime("%m/%Y")

    doc_type = f"Discovery Paper {year}"
    running = f"Client discovery · {doc_type}"
    short = f"{client} · Discovery Paper"

    ctx, opp = pages["client_context"], pages["opportunity"]
    approach, usecase = pages["borek_approach"], pages["relevant_use_case"]
    pilot, nxt = pages["pilot_proposal"], pages["next_steps"]

    # ---- M1 cover
    cover = page(
        "m1", "M1 · Cover",
        f'<img src="{ASSETS_URL}/cover.png" alt="" style="position:absolute;left:0;top:0;width:100%;height:100%;display:block;object-fit:cover">'
        f'<div style="position:relative;z-index:2;display:flex;justify-content:space-between;align-items:flex-start">'
        f'<img src="{ASSETS_URL}/logo.svg" alt="BOREK Solutions Group" style="width:168px;height:auto;display:block">'
        f'<div style="text-align:right;font-family:{MONO};font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.7);line-height:1.7">{e(doc_type)}<br>As of {e(mm_yy)}</div></div>'
        f'<div style="position:relative;z-index:2;margin-top:72px">'
        f'<div style="font-family:{MONO};font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.6)">{e(client)} · Discovery Paper</div>'
        f'<h1 style="margin:18px 0 0;font-size:62px;font-weight:300;letter-spacing:-.025em;line-height:1.02;max-width:600px;text-wrap:balance">{e(purpose or client)}</h1>'
        f'<p style="margin:28px 0 0;max-width:520px;font-size:15px;line-height:1.65;color:rgba(255,255,255,.72);text-wrap:pretty">'
        f'Prepared for {e(contact) + " at " if contact else ""}{e(client)} ahead of the first meeting: what we know, what we still need to learn, and how we propose to start.</p></div>'
        f'<div style="position:relative;z-index:2;margin-top:auto;display:flex;justify-content:space-between;padding-top:16px;border-top:1px solid rgba(255,255,255,.18);'
        f'font-family:{MONO};font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.6)">'
        f"<span>Borek Solutions Group · Braunschweig</span><span>boreksolutions.de</span></div>",
        dark=True,
        extra="display:flex;flex-direction:column;padding:64px 76px 60px",
    )

    # ---- M2 contents
    chapters = [
        ("Client context", 3), ("Opportunity", 4), ("Borek approach", 5),
        ("Relevant use case", 5), ("Pilot proposal", 6), ("Next steps", 6),
    ]
    rows = []
    for i, (title, pg) in enumerate(chapters, 1):
        last = ";border-bottom:1px solid " + RULE if i == len(chapters) else ""
        rows.append(
            f'<div style="display:grid;grid-template-columns:36px 1fr auto;gap:16px;align-items:baseline;padding:16px 0;border-top:1px solid {RULE}{last}">'
            f'<span style="font-size:15px;font-weight:300;color:{BLUE}">{i:02d}</span>'
            f'<span style="font-size:15px;font-weight:500;line-height:1.3">{e(title)}</span>'
            f'<span style="font-family:{MONO};font-size:11px;color:{SLATE}">{pg:02d}</span></div>'
        )
    short_stmt = lambda t: f'<p style="margin:20px 0 0;font-size:17px;font-weight:300;line-height:1.4;letter-spacing:-.01em;text-wrap:pretty">{e(t)}</p>'
    unknown_n = len(ctx.get("unknowns", []))
    contents = page(
        "m2", "M2 · Contents",
        header(running, short)
        + f'<h2 style="margin:64px 0 0;font-size:38px;font-weight:300;letter-spacing:-.02em;line-height:1.1">Contents</h2>'
        f'<div style="margin-top:36px;display:grid;grid-template-columns:1fr 1fr;gap:0 56px"><div>{"".join(rows)}</div>'
        f'<div style="border-left:1px solid {RULE};padding-left:32px">'
        f'<div style="font-size:12px;font-weight:600;letter-spacing:.09em;text-transform:uppercase">In short</div>'
        + short_stmt(f"{client} wants to talk about {purpose}." if purpose else f"This paper prepares the first meeting with {client}.")
        + short_stmt(f"{unknown_n} company facts are still open; we list them rather than guess." if unknown_n else "All company facts used here are confirmed.")
        + short_stmt("We propose a discovery pilot. Commercial terms are not part of this paper.")
        + f'<p style="margin:36px 0 0;font-size:13px;line-height:1.6;color:{SLATE};text-wrap:pretty">'
        "Scope note: this paper is written for the first meeting. It uses only the information supplied by the client team and "
        "verified research. Anything not yet known is marked as such and is not filled in. It contains no pricing and is not a commitment.</p></div></div>"
        f'<div style="margin-top:64px;border-top:2px solid {INK};padding-top:20px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:32px">'
        + "".join(
            f'<div><div style="font-family:{MONO};font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:{SLATE}">{k}</div>'
            f'<div style="margin-top:8px;font-size:13px;line-height:1.6">{v}</div></div>'
            for k, v in [
                ("Publisher", "BOREK Solutions Group<br>Altewiekring 20 A · 38102 Braunschweig"),
                ("Prepared for", f"{e(client)}<br>{e(contact) if contact else e(website)}"),
                ("Contact", "T +49 531 283 541 61<br>boreksolutions.de"),
            ]
        )
        + "</div>" + footer(mm_yyyy, 2),
        extra="padding:56px 76px 90px",
    )

    # ---- M4 content page: client context
    facts = ctx.get("known_facts", [])
    fact_points = "".join(
        numbered_point(i, f"{f['label']}: {f['value']}", origin(f.get("origin")), first=(i == 1))
        for i, f in enumerate(facts, 1)
    )
    open_items = [UNKNOWN_LABEL.get(u, str(u).replace("_", " ").capitalize()) for u in ctx.get("unknowns", [])]
    open_table = (
        table([("Open item", "0 14px 10px 0"), ("Status", "0 0 10px 0")], [[o, PENDING] for o in open_items], ["30%"])
        if open_items else ""
    )
    context_page = page(
        "m3", "M3 · Client context",
        header(running, "01 · Client context")
        + f'<p style="margin:40px 0 0;font-size:16px;line-height:1.55;max-width:600px;text-wrap:pretty">{e(ctx.get("summary", ""))}{sup(1)}</p>'
        + f'<div style="margin-top:28px">{fact_points}</div>'
        + open_table
        + footnotes([
            "Facts are shown with their origin. Open items are listed and deliberately left blank until verified; nothing is inferred.",
        ])
        + footer(mm_yyyy, 3),
        extra="padding:56px 76px 90px",
    )

    # ---- M3 chapter opener: opportunity
    statement = opp.get("statement") or ""
    src = (opp.get("meeting_purpose_source") or "").replace("_", " ")
    opportunity_page = page(
        "m4", "M3 · Chapter opener",
        header(running, "02 · Opportunity", dark=True)
        + f'<div style="margin-top:72px;display:flex;align-items:center;gap:44px"><div style="font-size:88px;font-weight:300;line-height:.9;letter-spacing:-.03em;color:#FFFFFF">02</div>'
        f'<div><div style="font-size:12px;font-weight:600;letter-spacing:.09em;text-transform:uppercase">Opportunity</div></div></div>'
        f'<h2 style="margin:40px 0 0;font-size:40px;font-weight:300;letter-spacing:-.02em;line-height:1.1;max-width:600px;text-wrap:balance">{e(opp.get("meeting_purpose") or purpose)}</h2>'
        f'<div style="margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:40px">'
        f'<p style="margin:0;font-size:14px;line-height:1.65;color:rgba(255,255,255,.9);text-wrap:pretty">{e(statement)}</p>'
        f'<p style="margin:0;font-size:14px;line-height:1.65;color:rgba(255,255,255,.7);text-wrap:pretty">'
        f'Source of the meeting purpose: {e(src) if src else "client input"}. Origin: {e(origin(opp.get("origin")))}.</p></div>'
        f'<div style="position:absolute;left:76px;right:76px;bottom:110px;border-top:1px solid rgba(255,255,255,.35);padding-top:24px">'
        f'<div style="font-family:{MONO};font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.7)">Key message</div>'
        f'<p style="margin:14px 0 0;font-size:30px;font-weight:300;letter-spacing:-.02em;line-height:1.2;max-width:620px;text-wrap:balance">'
        f'The first meeting is about {e(opp.get("meeting_purpose") or purpose)}.</p></div>'
        + footer(mm_yyyy, 4, dark=True),
        dark=True,
        extra="padding:56px 76px 90px",
    )

    # ---- M5 deep dive: Borek approach + relevant use case
    def deep_rows(c: dict) -> tuple[list[tuple[str, str, bool]], str]:
        if c.get("availability") == "unknown" or not c.get("statement"):
            return [("Solution", PENDING, False), ("Result", "Not yet established.", True)], "Not yet established"
        return [
            ("Solution", f"{c.get('title') or ''}".strip() or c["statement"], False),
            ("Detail", c["statement"], False),
            ("Result", origin(c.get("origin")), True),
        ], origin(c.get("origin"))

    a_rows, a_note = deep_rows(approach)
    u_rows, u_note = deep_rows(usecase)
    deep = page(
        "m5", "M5 · Deep dive",
        header(running, "03 · Approach and use case")
        + '<h2 style="margin:36px 0 0;font-size:26px;font-weight:300;letter-spacing:-.02em;line-height:1.15">How Borek would approach this</h2>'
        f'<p style="margin:10px 0 0;font-size:13px;line-height:1.55;color:{SLATE};text-wrap:pretty">'
        "Two items: our approach and the most relevant completed use case. Neither is filled in until it is grounded in a verified source.</p>"
        + deep_dive_item(1, approach.get("title") or "Borek approach", a_rows, a_note)
        + deep_dive_item(2, usecase.get("title") or "Relevant use case", u_rows, u_note)
        + footer(mm_yyyy, 5),
        extra="padding:56px 76px 90px",
    )

    # ---- M4 content page: pilot + next steps
    items = sorted(nxt.get("items", []), key=lambda i: i.get("order", 0))
    next_points = "".join(
        numbered_point(i, it["label"], origin(it.get("origin")), first=(n == 0))
        for n, (i, it) in enumerate(((it.get("order", k), it) for k, it in enumerate(items, 1)))
    )
    terms = pilot.get("commercial_terms", "not_included").replace("_", " ").capitalize()
    pilot_page = page(
        "m6", "M4 · Content page",
        header(running, "05 · Pilot proposal · 06 · Next steps")
        + f'<p style="margin:40px 0 0;font-size:16px;line-height:1.55;max-width:600px;text-wrap:pretty">{e(pilot.get("concept", ""))}{sup(1)}</p>'
        + table(
            [("Pilot", "0 14px 10px 0"), ("Scope", "0 0 10px 0")],
            [["Commercial terms", terms], ["Meeting topic", purpose or "—"]],
            ["30%"], margin_top=28,
        )
        + f'<div style="margin-top:36px;font-size:12px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;padding-bottom:14px">Next steps</div>'
        + f'<div style="margin-top:0">{next_points}</div>'
        + footnotes(["This paper is not a commitment. Pricing and duration are discussed only after the first meeting."])
        + footer(mm_yyyy, 6),
        extra="padding:56px 76px 90px",
    )

    # ---- M9 closing
    closing = page(
        "m9", "M9 · Closing",
        header(running, "Conclusion", dark=True)
        + f'<div style="margin-top:72px;display:flex;align-items:center;gap:44px"><div style="font-size:88px;font-weight:300;line-height:.9;letter-spacing:-.03em;color:#FFFFFF">07</div>'
        f'<div><div style="font-size:12px;font-weight:600;letter-spacing:.09em;text-transform:uppercase">Conclusion</div></div></div>'
        f'<h2 style="margin:40px 0 0;font-size:40px;font-weight:300;letter-spacing:-.02em;line-height:1.1;max-width:600px;text-wrap:balance">Start with what is known, learn the rest together.</h2>'
        f'<div style="margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:40px">'
        f'<p style="margin:0;font-size:14px;line-height:1.65;color:rgba(255,255,255,.85);text-wrap:pretty">This paper sets out what we know about {e(client)}, the purpose of the first meeting and a proposed discovery pilot.</p>'
        f'<p style="margin:0;font-size:14px;line-height:1.65;color:rgba(255,255,255,.7);text-wrap:pretty">{unknown_n} open items will be collected in the first meeting, so that the next document rests on facts, not assumptions.</p></div>'
        f'<div style="margin-top:auto"><div style="border-top:1px solid rgba(255,255,255,.18);padding-top:28px">'
        f'<p style="margin:0;font-size:34px;font-weight:300;letter-spacing:-.02em;line-height:1.15;max-width:600px;text-wrap:balance">Let us establish the first baseline together.</p></div>'
        f'<div style="margin-top:56px;display:flex;justify-content:space-between;align-items:flex-end;gap:40px">'
        f'<img src="{ASSETS_URL}/logo.svg" alt="BOREK Solutions Group" style="width:150px;height:auto;display:block">'
        f'<div style="text-align:right;font-size:12.5px;line-height:1.8;color:rgba(255,255,255,.66)"><b style="color:#FFFFFF;font-weight:500">Your AI Department. Delivered, not built.</b><br>'
        f"T +49 531 283 541 61 · boreksolutions.de<br>Altewiekring 20 A · 38102 Braunschweig</div></div>"
        f'<div style="display:flex;justify-content:space-between;margin-top:28px;padding-top:14px;border-top:1px solid rgba(255,255,255,.18);font-family:{MONO};font-size:9.5px;letter-spacing:.06em;color:rgba(255,255,255,.6)">'
        f"<span>BOREK SOLUTIONS GROUP · {e(mm_yyyy)}</span><span>07</span></div></div>",
        dark=True,
        extra="display:flex;flex-direction:column;padding:56px 76px 60px",
    )

    faces = []
    for sub, rng in FONT_SUBSETS:
        faces.append(
            f"@font-face{{font-family:'Inter';font-style:normal;font-weight:300 600;font-display:swap;"
            f"src:url('{ASSETS_URL}/inter-{sub}.woff2') format('woff2');unicode-range:{rng}}}"
        )
    return (
        '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
        f"<title>{e(short)}</title><style>{''.join(faces)}"
        f"@page{{size:210mm 297mm;margin:0}}"
        f"*{{box-sizing:border-box}}"
        f"body{{margin:0;font-family:{SANS};color:{INK};-webkit-font-smoothing:antialiased;background:#e9eaf0}}"
        f"a{{color:{INK}}} ::selection{{background:{INK};color:#FFFFFF}}"
        f"h1,h2{{text-wrap:balance}}"
        f".page{{width:210mm;height:297mm;margin:16px auto;print-color-adjust:exact;-webkit-print-color-adjust:exact;"
        f"box-shadow:0 2px 12px rgba(13,18,64,.15);page-break-after:always;break-after:page}}"
        f"@media print{{body{{background:none}}.page{{margin:0;box-shadow:none}}.page:last-child{{page-break-after:auto;break-after:auto}}}}"
        f"</style></head><body>{cover}{contents}{context_page}{opportunity_page}{deep}{pilot_page}{closing}</body></html>"
    )


ASSETS_URL = ""
FONT_SUBSETS = [
    ("cyrillic-ext", "U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F"),
    ("cyrillic", "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116"),
    ("greek-ext", "U+1F00-1FFF"),
    ("greek", "U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF"),
    ("vietnamese", "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB"),
    ("latin-ext", "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF"),
    ("latin", "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"),
]


def find_browser() -> str | None:
    candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ]
    for c in candidates:
        if Path(c).exists():
            return c
    for name in ("google-chrome", "chromium", "chromium-browser", "chrome", "msedge"):
        found = shutil.which(name)
        if found:
            return found
    return None


def main() -> int:
    global ASSETS_URL
    ap = argparse.ArgumentParser()
    ap.add_argument("paper", nargs="?", default=str(DEFAULT_INPUT))
    ap.add_argument("-o", "--out", default=str(DEFAULT_OUT))
    args = ap.parse_args()

    paper = json.loads(Path(args.paper).read_text(encoding="utf-8"))
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    client = paper.get("intake_context", {}).get("client_name", "client")
    stem = "Discovery_Paper_" + re.sub(r"[^A-Za-z0-9]+", "_", client).strip("_")

    # Copy assets next to the HTML so the downloadable file is portable.
    assets_out = out / "assets"
    shutil.copytree(ASSETS, assets_out, dirs_exist_ok=True)
    ASSETS_URL = "assets"
    html_path = out / f"{stem}.html"
    html_path.write_text(build_html(paper), encoding="utf-8")
    print(f"HTML: {html_path}")

    browser = find_browser()
    if not browser:
        print("No Chrome/Edge found; open the HTML and print to PDF (A4, no margins, background graphics).")
        return 1
    pdf_path = out / f"{stem}.pdf"
    with tempfile.TemporaryDirectory() as profile:
        subprocess.run(
            [browser, "--headless=new", "--disable-gpu", f"--user-data-dir={profile}",
             "--no-pdf-header-footer", "--virtual-time-budget=5000",
             f"--print-to-pdf={pdf_path}", html_path.resolve().as_uri()],
            check=True, capture_output=True, timeout=120,
        )
    print(f"PDF:  {pdf_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
