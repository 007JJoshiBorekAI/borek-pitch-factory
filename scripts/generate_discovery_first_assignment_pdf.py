"""Build the discovery-first Jaya / Mayank / Blenard assignment PDF.

Usage:  python scripts/generate_discovery_first_assignment_pdf.py
"""

from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUTPUT = (
    Path(__file__).resolve().parents[1]
    / "docs"
    / "tickets"
    / "Pitch_Factory_Discovery_First_Jaya_Mayank_Blenard.pdf"
)

NAVY = colors.HexColor("#1B2A4A")
ACCENT = colors.HexColor("#2C567A")
PALE = colors.HexColor("#F2F4F7")
LINE = colors.HexColor("#D5DAE3")
WHITE = colors.white
MUTED = colors.HexColor("#595F6B")
JAYA = colors.HexColor("#0D1D51")
MAYANK = colors.HexColor("#1B4F72")
BLENARD = colors.HexColor("#1A5276")
QA = colors.HexColor("#4A235A")


def styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "cover_kicker": ParagraphStyle(
            "cover_kicker",
            parent=base["Normal"],
            fontName="Times-Bold",
            fontSize=9,
            textColor=ACCENT,
            alignment=TA_CENTER,
            letterSpacing=1.2,
            spaceAfter=6,
        ),
        "cover_title": ParagraphStyle(
            "cover_title",
            parent=base["Title"],
            fontName="Times-Bold",
            fontSize=20,
            leading=24,
            textColor=NAVY,
            alignment=TA_CENTER,
            spaceAfter=8,
        ),
        "cover_sub": ParagraphStyle(
            "cover_sub",
            parent=base["Normal"],
            fontName="Times-Italic",
            fontSize=11,
            leading=14,
            textColor=MUTED,
            alignment=TA_CENTER,
            spaceAfter=4,
        ),
        "h1": ParagraphStyle(
            "h1",
            parent=base["Heading1"],
            fontName="Times-Bold",
            fontSize=15,
            leading=19,
            textColor=NAVY,
            spaceBefore=4,
            spaceAfter=8,
        ),
        "h2": ParagraphStyle(
            "h2",
            parent=base["Heading2"],
            fontName="Times-Bold",
            fontSize=12,
            leading=16,
            textColor=NAVY,
            spaceBefore=10,
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["Normal"],
            fontName="Times-Roman",
            fontSize=10,
            leading=13,
            textColor=NAVY,
            alignment=TA_JUSTIFY,
            spaceAfter=6,
        ),
        "note": ParagraphStyle(
            "note",
            parent=base["Normal"],
            fontName="Times-Italic",
            fontSize=9,
            leading=12,
            textColor=MUTED,
            spaceAfter=8,
        ),
        "th": ParagraphStyle(
            "th",
            parent=base["Normal"],
            fontName="Times-Bold",
            fontSize=8,
            leading=10.5,
            textColor=WHITE,
        ),
        "td": ParagraphStyle(
            "td",
            parent=base["Normal"],
            fontName="Times-Roman",
            fontSize=8,
            leading=10.5,
            textColor=NAVY,
        ),
        "td_bold": ParagraphStyle(
            "td_bold",
            parent=base["Normal"],
            fontName="Times-Bold",
            fontSize=8,
            leading=10.5,
            textColor=NAVY,
        ),
        "ticket_title": ParagraphStyle(
            "ticket_title",
            parent=base["Heading3"],
            fontName="Times-Bold",
            fontSize=11,
            leading=14,
            textColor=NAVY,
            spaceBefore=8,
            spaceAfter=3,
        ),
        "meta": ParagraphStyle(
            "meta",
            parent=base["Normal"],
            fontName="Times-Italic",
            fontSize=8.5,
            leading=11,
            textColor=MUTED,
            spaceAfter=3,
        ),
        "person_banner": ParagraphStyle(
            "person_banner",
            parent=base["Normal"],
            fontName="Times-Bold",
            fontSize=14,
            leading=18,
            textColor=WHITE,
        ),
        "person_sub": ParagraphStyle(
            "person_sub",
            parent=base["Normal"],
            fontName="Times-Roman",
            fontSize=9,
            leading=12,
            textColor=WHITE,
        ),
    }


def header_footer(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, A4[1] - 12 * mm, A4[0], 12 * mm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont("Times-Bold", 8)
    canvas.drawString(
        18 * mm,
        A4[1] - 7.5 * mm,
        "Borek Pitch Factory  ·  Discovery-first assignment",
    )
    canvas.setFont("Times-Roman", 8)
    canvas.drawRightString(A4[0] - 18 * mm, A4[1] - 7.5 * mm, "Jaya  ·  Mayank  ·  Blenard")
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, A4[0], 10 * mm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont("Times-Roman", 8)
    canvas.drawString(18 * mm, 4 * mm, "2 October 2026  ·  Pre-meeting + post-meeting only")
    canvas.drawRightString(A4[0] - 18 * mm, 4 * mm, f"Page {doc.page}")
    canvas.restoreState()


def p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(text.replace("\n", "<br/>"), style)


def table(headers: list[str], rows: list[list[str]], s: dict, col_widths: list[float]) -> Table:
    head = [p(h, s["th"]) for h in headers]
    body = [
        [p(row[i], s["td_bold"] if i == 0 else s["td"]) for i in range(len(row))]
        for row in rows
    ]
    data = [head, *body]
    t = Table(data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("GRID", (0, 0), (-1, -1), 0.3, LINE),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), PALE))
    t.setStyle(TableStyle(style_cmds))
    return t


def person_banner(name: str, role: str, tickets: str, s: dict, fill: colors.Color) -> Table:
    inner = Table(
        [
            [p(name, s["person_banner"])],
            [p(f"{role}<br/>Tickets: {tickets}", s["person_sub"])],
        ],
        colWidths=[174 * mm],
    )
    inner.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), fill),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (0, 0), 10),
                ("BOTTOMPADDING", (0, -1), (-1, -1), 10),
            ]
        )
    )
    return inner


def ticket_block(s, ticket, title, meta, goal, done, deps):
    return KeepTogether(
        [
            p(f"{ticket}  —  {title}", s["ticket_title"]),
            p(meta, s["meta"]),
            p(f"<b>Goal.</b> {goal}", s["body"]),
            p(f"<b>Done when.</b> {done}", s["body"]),
            p(f"<b>Depends on.</b> {deps}", s["note"]),
        ]
    )


def build() -> Path:
    s = styles()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=20 * mm,
        bottomMargin=16 * mm,
        title="Borek Pitch Factory — Discovery-first assignment",
        author="Jaya Joshi · Mayank Somwani · Blenard Tahiraj",
    )
    usable = A4[0] - 32 * mm
    story: list = []

    story.append(p("PITCH FACTORY  ·  DISCOVERY-FIRST WORKFLOW", s["cover_kicker"]))
    story.append(p("Task assignment: Jaya · Mayank · Blenard", s["cover_title"]))
    story.append(
        p(
            "Jaya Joshi (Gamma + PPT)  ·  Mayank Somwani (core workflow)  ·  "
            "Blenard Tahiraj (UI, email, approvals)",
            s["cover_sub"],
        )
    )
    story.append(
        p(
            "Scope is pre-meeting and post-meeting only. Concretisation / priced proposal "
            "is out of the owner path. A Discovery Paper is generated and approved before "
            "PPT #1. PPT #1 is at most 8 slides, personalised from the approved Discovery "
            "Paper onto the locked Gamma master. PPT #2 uses the same master, mapped to "
            "Ai Tech Borek Presentation EN.pptx, with first-meeting transcript, personal "
            "notes, and selected existing use cases. Email is drafted and exported after "
            "owner review; the app does not send mail.",
            s["body"],
        )
    )
    story.append(
        p(
            "Split rule: main generation path sits with Mayank and Jaya. Blenard owns "
            "remaining surfaces (Figma/brand UI, forms, editors, checkpoints, Elena email). "
            "Requirement 25 is unused. Figma: AI-Pitch node 259-2.",
            s["note"],
        )
    )

    story.append(p("1. Distribution at a glance", s["h1"]))
    story.append(
        table(
            ["Owner", "Vertical", "Tickets", "Count"],
            [
                [
                    "Jaya Joshi",
                    "Gamma, master template, PPT #1, PPT #2, editable PPTX/PDF",
                    "JJ-33 – JJ-37",
                    "5",
                ],
                [
                    "Mayank Somwani",
                    "Intake store, Discovery Paper gen, gates, transcript AI, context, versions, status",
                    "BT-40 – BT-48",
                    "9",
                ],
                [
                    "Blenard Tahiraj",
                    "Figma/brand UI, forms, discovery editor, post-meeting UX, approvals, email",
                    "MS-40 – MS-47",
                    "8",
                ],
                [
                    "Shared",
                    "End-to-end sample-client validation",
                    "QA-26",
                    "1",
                ],
            ],
            s,
            [32 * mm, 68 * mm, 42 * mm, 32 * mm],
        )
    )

    story.append(p("2. Target workflow", s["h1"]))
    story.append(
        p(
            "Client Information → Discovery Prepared → PPT #1 Ready → First Meeting "
            "Completed → Transcript Added → PPT #2 Generated → Owner Review → Finalized.",
            s["body"],
        )
    )
    story.append(
        table(
            ["Stage", "Primary output", "Gate"],
            [
                [
                    "Pre-meeting",
                    "Discovery Paper (7 pages) then PPT #1 (max 8 slides)",
                    "Discovery approved before PPT #1 job starts",
                ],
                [
                    "Post-meeting",
                    "PPT #2 on Ai Tech master + follow-up email draft",
                    "Transcript/notes processed; use cases selected; owner review",
                ],
            ],
            s,
            [32 * mm, 78 * mm, usable - 110 * mm],
        )
    )
    story.append(
        p(
            "Discovery Paper pages (Figma): Cover, Client context, Opportunity, Borek "
            "approach, Relevant use case, Pilot proposal, Next steps. Pages appear as they "
            "generate. PDF download unlocks when all pages are ready. PPT #1 and PPT #2 "
            "are separate versioned artifacts; generating PPT #2 must not overwrite PPT #1.",
            s["body"],
        )
    )

    story.append(p("3. Requirements 1–26 mapped to owners", s["h1"]))
    story.append(
        table(
            ["Req", "Title", "Owner", "Ticket"],
            [
                ["1", "New finalized design (Figma)", "Blenard", "MS-40"],
                ["2", "Apply brand book to platform UI", "Blenard", "MS-40"],
                ["3", "Client information input form", "Blenard UI / Mayank store", "MS-41 / BT-40"],
                ["4", "Generate Discovery Paper / white paper", "Mayank gen / Blenard UI", "BT-41 / MS-42"],
                ["5", "Make Discovery Paper editable", "Blenard UI / Mayank persist", "MS-42 / BT-42"],
                ["6", "Store Master PPT as Gamma template", "Jaya", "JJ-33"],
                ["7", "Generate PPT #1 from Discovery Document", "Jaya (gate: Mayank)", "JJ-34 / BT-43"],
                ["8", "Post-meeting transcript input", "Blenard UI / Mayank store", "MS-44 / BT-44"],
                ["9", "Personal meeting notes input", "Blenard UI / Mayank store", "MS-44 / BT-44"],
                ["10", "Process transcript and notes (AI)", "Mayank", "BT-44"],
                ["11", "Connect existing use cases to workflow", "Mayank API / Blenard picker", "BT-45 / MS-45"],
                ["12", "Unified context for PPT #2", "Mayank", "BT-46"],
                ["13", "Generate PPT #2 — second meeting", "Jaya", "JJ-35"],
                ["14", "Build PPT #2 on Master PPT", "Jaya", "JJ-33 / JJ-35"],
                ["15", "Generate discovery-specific PPT #2 slides", "Jaya", "JJ-35"],
                ["16", "Map existing use cases into PPT #2", "Jaya + Mayank", "JJ-35 / BT-45"],
                ["17", "Editable generated presentations (PPTX)", "Jaya", "JJ-36"],
                ["18", "Final documents after owner review", "Mayank", "BT-48"],
                ["19", "Generate client follow-up email", "Blenard", "MS-47"],
                ["20", "Make generated email editable", "Blenard", "MS-47"],
                ["21", "Final documents as email attachments", "Blenard UI / Mayank files", "MS-47 / BT-48"],
                ["22", "End-to-end owner approval logic", "Blenard UX / Mayank gates", "MS-46 / BT-43"],
                ["23", "Workflow status tracking", "Mayank / Blenard stepper", "BT-47 / MS-46"],
                ["24", "Document version management", "Mayank", "BT-42 / BT-47"],
                ["25", "(unused)", "—", "—"],
                ["26", "Validate complete client workflow", "Shared", "QA-26"],
            ],
            s,
            [12 * mm, 72 * mm, 48 * mm, 42 * mm],
        )
    )

    story.append(PageBreak())
    story.append(person_banner(
        "Jaya Joshi",
        "Gamma part — master template, PPT #1 (≤8), PPT #2 (Ai Tech structure), editable exports",
        "JJ-33, JJ-34, JJ-35, JJ-36, JJ-37",
        s,
        JAYA,
    ))
    story.append(Spacer(1, 8))
    story.append(
        ticket_block(
            s,
            "JJ-33",
            "Lock Master PPT as Gamma template",
            "P0 · Reqs 6, 14 · Type: implementation",
            "Configure the existing generic Master Presentation as the reusable Gamma "
            "template. Preserve slide structure, branding, layouts, fonts, and visual "
            "components. Branding stays locked; only named content slots vary per client.",
            "gamma_template.json remains the SSOT. PPT #1 and PPT #2 both render from this "
            "master rather than a from-scratch deck. Locked keys still reject brand_color / "
            "theme / font overrides.",
            "Existing JJ-26 template contract.",
        )
    )
    story.append(
        ticket_block(
            s,
            "JJ-34",
            "Generate PPT #1 from approved Discovery Paper (max 8 slides)",
            "P0 · Reqs 7, 17 · Type: implementation",
            "Personalise the first-call deck from the approved Discovery Paper. Insert "
            "client/company information into slots without changing master structure. "
            "Replace FIRST_CONTACT_SLIDE_COUNT = 3 and the current 5-card first_contact "
            "profile with a profile of at most 8 cards. Slot text comes from Discovery "
            "sections, not a competing LLM rewrite.",
            "A first-contact Gamma payload has ≤8 cards, no pricing, and traces to the "
            "approved Discovery version. UI copy no longer says “3-slide profile”.",
            "BT-43 (Discovery approved gate), JJ-33.",
        )
    )
    story.append(
        ticket_block(
            s,
            "JJ-35",
            "Generate PPT #2 on Ai Tech master + use cases",
            "P0 · Reqs 13–16 · Type: implementation",
            "Inventory Ai Tech Borek Presentation EN.pptx and map the deepening Gamma "
            "profile to that outline. PPT #2 is more client-specific than PPT #1: Discovery "
            "findings, transcript, notes, and selected completed use cases. Reuse use-case "
            "bodies; do not regenerate them. Client logo allowed on PPT #2.",
            "A deepening payload follows the Ai Tech structure, includes mapped use cases "
            "where needs match, and writes a new presentation version (does not overwrite PPT #1).",
            "BT-46 unified context, BT-45 use-case attach, JJ-33.",
        )
    )
    story.append(
        ticket_block(
            s,
            "JJ-36",
            "Editable presentation outputs",
            "P0 · Req 17 · Type: implementation",
            "Owners must receive editable presentation content, not only a static PDF or "
            "preview image. Gamma PPTX is first-class; PDF is the companion download.",
            "Deck center / Presentation tab offers PPTX download for PPT #1 and PPT #2. "
            "Preview images are not the only artifact.",
            "JJ-34, JJ-35.",
        )
    )
    story.append(
        ticket_block(
            s,
            "JJ-37",
            "Preview raster without exposing Gamma",
            "P1 · Supports MS-42 progressive UI · Type: implementation",
            "Keep preview/raster working for the Figma “page generating” experience. "
            "User-facing copy stays engine-neutral (existing readyScreenEngineNeutral tests).",
            "Progressive page/slide previews work in fixture and live modes; UI never shows "
            "the word Gamma.",
            "JJ-34, JJ-35, MS-42/MS-43.",
        )
    )

    story.append(PageBreak())
    story.append(person_banner(
        "Mayank Somwani",
        "Core backend — persistence, Discovery generation, gates, AI processing, versions, status",
        "BT-40, BT-41, BT-42, BT-43, BT-44, BT-45, BT-46, BT-47, BT-48",
        s,
        MAYANK,
    ))
    story.append(Spacer(1, 8))
    story.append(
        ticket_block(
            s,
            "BT-40",
            "Client / opportunity intake persistence",
            "P0 · Req 3 · Type: implementation",
            "Store Company Name, Contact Person, Website URL, Meeting Purpose, and "
            "Additional Information on the client/project record so later steps reuse them.",
            "A created opportunity returns the same fields on later reads; PPT and Discovery "
            "generation consume this record, not a one-off form blob.",
            "Existing opportunities / stage1_intake_store.",
        )
    )
    story.append(
        ticket_block(
            s,
            "BT-41",
            "Generate Discovery Paper (structured template)",
            "P0 · Req 4 · Type: implementation",
            "New artifact type (not discovery_questions). Seven sections matching Figma: "
            "Cover, Client context, Opportunity, Borek approach, Relevant use case, Pilot "
            "proposal, Next steps. LLM fills the template from intake + company background.",
            "API returns a structured Discovery Paper; pages can be marked ready as they "
            "complete. Unstructured free-form-only output is not accepted.",
            "BT-40.",
        )
    )
    story.append(
        ticket_block(
            s,
            "BT-42",
            "Discovery edit, approve, and version",
            "P0 · Reqs 5, 24 · Type: implementation",
            "Persist owner edits. Drafts vs approved versions are distinct. The latest "
            "approved version is the only source for PPT #1.",
            "PATCH saves a draft; approve stamps a version id; PPT #1 jobs fail if they "
            "point at a draft.",
            "BT-41.",
        )
    )
    story.append(
        ticket_block(
            s,
            "BT-43",
            "Hard gate: Discovery approved before PPT #1",
            "P0 · Reqs 7, 22 · Type: implementation",
            "Presentation engine must not start first-contact rendering until Discovery is approved.",
            "Unauthorized PPT #1 request returns a clear eligibility error; happy path starts "
            "only after approve.",
            "BT-42, JJ-34.",
        )
    )
    story.append(
        ticket_block(
            s,
            "BT-44",
            "Transcript, notes, and AI extraction",
            "P0 · Reqs 8–10 · Type: implementation",
            "Store transcript separately from original company input. Store personal notes "
            "separately. AI extracts requirements, challenges, priorities, opportunities, "
            "discussed solutions, decisions, and follow-ups.",
            "Both inputs persist on the same opportunity; extraction JSON is available for "
            "BT-46 and PPT #2.",
            "BT-40.",
        )
    )
    story.append(
        ticket_block(
            s,
            "BT-45",
            "Attach existing use cases (no regenerate)",
            "P0 · Reqs 11, 16 · Type: implementation",
            "Owner selects previously completed use cases. Bodies are reused, not rewritten.",
            "API lists attachable use cases and stores selected ids on the opportunity for PPT #2.",
            "Existing use-case corpus / AT-59 path.",
        )
    )
    story.append(
        ticket_block(
            s,
            "BT-46",
            "Unified PPT #2 generation context",
            "P0 · Req 12 · Type: implementation",
            "Build a tagged context: approved Discovery + transcript extract + personal "
            "notes + selected use cases. Confirmed/owner-approved information wins.",
            "JJ-35 can consume one context object with source tags and priority; missing "
            "sources are explicit, not silently omitted without a flag.",
            "BT-42, BT-44, BT-45.",
        )
    )
    story.append(
        ticket_block(
            s,
            "BT-47",
            "Workflow status and document lineage",
            "P0 · Reqs 18, 23, 24 · Type: implementation",
            "Track the eight statuses. Keep PPT #1, PPT #2, Discovery drafts, and finals "
            "as separate versions.",
            "Opportunity status endpoint matches the stepper; presentation_versions never "
            "clobber PPT #1 when PPT #2 is written.",
            "Existing presentation_versions / job FSM.",
        )
    )
    story.append(
        ticket_block(
            s,
            "BT-48",
            "Finalize from latest approved inputs; drop concretisation from owner path",
            "P0 · Req 18 · Type: implementation",
            "Regeneration uses latest approved Discovery, notes, and transcript extract. "
            "Disable/hide concretisation routes and jobs on the owner workflow.",
            "A stale draft cannot be marked final. Concretisation is not selectable in the "
            "owner UI/API for this workflow.",
            "BT-47.",
        )
    )

    story.append(PageBreak())
    story.append(person_banner(
        "Blenard Tahiraj",
        "Platform UI, Figma Creating-your-pitch, forms, editors, approvals, Elena email",
        "MS-40, MS-41, MS-42, MS-43, MS-44, MS-45, MS-46, MS-47",
        s,
        BLENARD,
    ))
    story.append(Spacer(1, 8))
    story.append(
        ticket_block(
            s,
            "MS-40",
            "Figma design + brand book on platform UI",
            "P0 · Reqs 1–2 · Type: design/implementation",
            "Apply approved typography, spacing, components, colors, and logos. Implement "
            "Creating your pitch: Discovery Document / Presentation tabs, page list with "
            "status (Ready / Generating / Waiting).",
            "Pre-meeting and post-meeting screens match Figma node 259-2 and the client "
            "brand book on the surfaces in this workflow.",
            "Figma AI-Pitch file; borekBrand.ts tokens.",
        )
    )
    story.append(
        ticket_block(
            s,
            "MS-41",
            "Client information input screen",
            "P0 · Req 3 · Type: implementation",
            "Structured fields: Company Name, Contact Person, Website URL, Meeting Purpose, "
            "Additional Information. Bound to BT-40.",
            "Owner can create/edit the record and see it reused on later steps.",
            "BT-40.",
        )
    )
    story.append(
        ticket_block(
            s,
            "MS-42",
            "Discovery Paper UI: progressive generate, edit, approve, PDF",
            "P0 · Reqs 4–5 · Type: implementation",
            "Show pages as they become ready. Owner edits generated text. Approve is explicit. "
            "Download PDF stays disabled until all pages are ready.",
            "Matches the Figma generating-page-04 pattern; edits round-trip via BT-42.",
            "BT-41, BT-42, MS-40.",
        )
    )
    story.append(
        ticket_block(
            s,
            "MS-43",
            "Presentation tab for PPT #1 and PPT #2 (separate versions)",
            "P0 · Reqs 7, 13, 17 · Type: implementation",
            "Presentation tab never mixes PPT #1 and PPT #2. Downloads use Jaya’s PPTX/PDF.",
            "Switching clients/stages shows the correct versioned deck.",
            "JJ-34, JJ-35, JJ-36, BT-47.",
        )
    )
    story.append(
        ticket_block(
            s,
            "MS-44",
            "Transcript upload + personal notes",
            "P0 · Reqs 8–9 · Type: implementation",
            "Separate areas for meeting transcript and owner notes after the first call.",
            "Both save to the same opportunity via BT-44.",
            "BT-44.",
        )
    )
    story.append(
        ticket_block(
            s,
            "MS-45",
            "Use-case picker for PPT #2",
            "P0 · Req 11 · Type: implementation",
            "Owner selects relevant completed use cases before PPT #2 generation.",
            "Selected ids persist; list does not invent new use-case copy.",
            "BT-45.",
        )
    )
    story.append(
        ticket_block(
            s,
            "MS-46",
            "Owner checkpoints and workflow stepper",
            "P0 · Reqs 22–23 · Type: implementation",
            "Checkpoints at client information, Discovery Paper, PPT #2 / final presentation, "
            "final documents, and generated email. Stepper shows the eight statuses.",
            "Next critical step is blocked until the current checkpoint is reviewed.",
            "BT-43, BT-47.",
        )
    )
    story.append(
        ticket_block(
            s,
            "MS-47",
            "Elena follow-up email: generate, edit, attachments",
            "P0 · Reqs 19–21 · Type: implementation",
            "Generate after relevant documents are prepared. Editable subject and body. "
            "Show which final files will be attached before export. No SMTP send.",
            "Email uses finalized client + meeting context; attachment list is only approved "
            "Discovery PDF and/or PPT #1 / PPT #2.",
            "BT-48, existing follow-up rendering.",
        )
    )

    story.append(Spacer(1, 10))
    story.append(person_banner(
        "Shared — QA-26",
        "End-to-end validation with sample client data",
        "QA-26",
        s,
        QA,
    ))
    story.append(Spacer(1, 8))
    story.append(
        ticket_block(
            s,
            "QA-26",
            "Validate complete client workflow",
            "P0 · Req 26 · Type: QA",
            "Enter client information → generate Discovery Paper → prepare PPT #1 → add "
            "first-call transcript/notes → select use cases → generate PPT #2 → owner review "
            "→ finalize documents → generate client email. Confirm information stays "
            "consistent and PPT #1 is not overwritten.",
            "Jaya proves both decks (≤8 then Ai Tech-mapped PPT #2). Mayank proves gates "
            "and versions. Blenard proves UI, stepper, and email attachments.",
            "All tickets above.",
        )
    )

    story.append(p("4. Out of scope", s["h1"]))
    story.append(
        p(
            "Concretisation / priced proposal. SMTP send. Redesigning Gamma CI from scratch "
            "if the locked theme already matches the brand book (Blenard applies brand to "
            "platform UI; Jaya adjusts the template only if Figma or the Ai Tech master diverge).",
            s["body"],
        )
    )
    story.append(
        p(
            "Closure rule: do not close a ticket until Done when is met with proof "
            "(test, fixture, or recorded sample-client run).",
            s["note"],
        )
    )

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    return OUTPUT


if __name__ == "__main__":
    path = build()
    print(path)
