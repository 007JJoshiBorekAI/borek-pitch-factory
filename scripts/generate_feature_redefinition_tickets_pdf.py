"""Build the Mayank / Blenard / Jaya-QA feature redefinition ticket PDF.

Aligned to Pitch Factory input_output.docx (Stage 1 Pre-meeting, Stage 2 After 1st meeting).

Usage:  python scripts/generate_feature_redefinition_tickets_pdf.py
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
    / "Pitch_Factory_Feature_Redefinition_Mayank_Blenard_QA.pdf"
)

NAVY = colors.HexColor("#1B2A4A")
ACCENT = colors.HexColor("#2C567A")
PALE = colors.HexColor("#F2F4F7")
LINE = colors.HexColor("#D5DAE3")
WHITE = colors.white
MUTED = colors.HexColor("#595F6B")
MAYANK = colors.HexColor("#1B4F72")
BLENARD = colors.HexColor("#1A5276")
QA = colors.HexColor("#4A235A")


def styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "cover_kicker": ParagraphStyle(
            "cover_kicker", parent=base["Normal"], fontName="Times-Bold",
            fontSize=9, textColor=ACCENT, alignment=TA_CENTER, letterSpacing=1.2, spaceAfter=6,
        ),
        "cover_title": ParagraphStyle(
            "cover_title", parent=base["Title"], fontName="Times-Bold",
            fontSize=21, leading=25, textColor=NAVY, alignment=TA_CENTER, spaceAfter=8,
        ),
        "cover_sub": ParagraphStyle(
            "cover_sub", parent=base["Normal"], fontName="Times-Italic",
            fontSize=11, leading=14, textColor=MUTED, alignment=TA_CENTER, spaceAfter=4,
        ),
        "h1": ParagraphStyle(
            "h1", parent=base["Heading1"], fontName="Times-Bold",
            fontSize=16, leading=20, textColor=NAVY, spaceBefore=4, spaceAfter=8,
        ),
        "h2": ParagraphStyle(
            "h2", parent=base["Heading2"], fontName="Times-Bold",
            fontSize=13, leading=16, textColor=NAVY, spaceBefore=10, spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "body", parent=base["Normal"], fontName="Times-Roman",
            fontSize=10, leading=13, textColor=NAVY, alignment=TA_JUSTIFY, spaceAfter=6,
        ),
        "note": ParagraphStyle(
            "note", parent=base["Normal"], fontName="Times-Italic",
            fontSize=9, leading=12, textColor=MUTED, spaceAfter=8,
        ),
        "th": ParagraphStyle(
            "th", parent=base["Normal"], fontName="Times-Bold",
            fontSize=8.5, leading=11, textColor=WHITE,
        ),
        "td": ParagraphStyle(
            "td", parent=base["Normal"], fontName="Times-Roman",
            fontSize=8.5, leading=11, textColor=NAVY,
        ),
        "td_bold": ParagraphStyle(
            "td_bold", parent=base["Normal"], fontName="Times-Bold",
            fontSize=8.5, leading=11, textColor=NAVY,
        ),
        "ticket_title": ParagraphStyle(
            "ticket_title", parent=base["Heading3"], fontName="Times-Bold",
            fontSize=11, leading=14, textColor=NAVY, spaceBefore=8, spaceAfter=3,
        ),
        "meta": ParagraphStyle(
            "meta", parent=base["Normal"], fontName="Times-Italic",
            fontSize=8.5, leading=11, textColor=MUTED, spaceAfter=3,
        ),
        "person_banner": ParagraphStyle(
            "person_banner", parent=base["Normal"], fontName="Times-Bold",
            fontSize=14, leading=18, textColor=WHITE,
        ),
        "person_sub": ParagraphStyle(
            "person_sub", parent=base["Normal"], fontName="Times-Roman",
            fontSize=9, leading=12, textColor=WHITE,
        ),
    }


def header_footer(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, A4[1] - 12 * mm, A4[0], 12 * mm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont("Times-Bold", 8)
    canvas.drawString(18 * mm, A4[1] - 7.5 * mm, "Borek Pitch Factory  ·  Feature redefinition sprint")
    canvas.setFont("Times-Roman", 8)
    canvas.drawRightString(A4[0] - 18 * mm, A4[1] - 7.5 * mm, "Mayank  ·  Blenard  ·  Jaya (QA)")
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, A4[0], 10 * mm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont("Times-Roman", 8)
    canvas.drawString(18 * mm, 4 * mm, "Source: Pitch Factory input_output.docx  ·  21 September 2026")
    canvas.drawRightString(A4[0] - 18 * mm, 4 * mm, f"Page {doc.page}")
    canvas.restoreState()


def p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(text.replace("\n", "<br/>"), style)


def table(headers: list[str], rows: list[list[str]], s: dict, col_widths: list[float]) -> Table:
    head = [p(h, s["th"]) for h in headers]
    body = [[p(row[i], s["td_bold"] if i == 0 else s["td"]) for i in range(len(row))] for row in rows]
    data = [head, *body]
    t = Table(data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("GRID", (0, 0), (-1, -1), 0.3, LINE),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), PALE))
    t.setStyle(TableStyle(style_cmds))
    return t


def person_banner(name: str, role: str, tickets: str, s: dict, fill: colors.Color) -> Table:
    inner = Table(
        [[p(name, s["person_banner"])], [p(f"{role}<br/>Tickets: {tickets}", s["person_sub"])]],
        colWidths=[170 * mm],
    )
    inner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), fill),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (0, 0), 10),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 10),
    ]))
    return inner


def ticket_block(s, ticket, title, meta, goal, done, deps):
    return KeepTogether([
        p(f"{ticket}  —  {title}", s["ticket_title"]),
        p(meta, s["meta"]),
        p(f"<b>Goal.</b> {goal}", s["body"]),
        p(f"<b>Done when.</b> {done}", s["body"]),
        p(f"<b>Depends on.</b> {deps}", s["note"]),
    ])


def build() -> Path:
    s = styles()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT), pagesize=A4,
        leftMargin=16 * mm, rightMargin=16 * mm,
        topMargin=20 * mm, bottomMargin=16 * mm,
        title="Borek Pitch Factory — Feature Redefinition Sprint",
    )
    usable = A4[0] - 32 * mm
    story: list = []

    story.append(p("PITCH FACTORY  ·  CLIENT RESEARCH & FIRST-MEETING WORKFLOW", s["cover_kicker"]))
    story.append(p("Feature redefinition tickets", s["cover_title"]))
    story.append(p("Mayank Somwani  ·  Blenard Tahiraj  ·  Jaya Joshi (QA)", s["cover_sub"]))
    story.append(p(
        "Aligned to Pitch Factory input_output.docx plus Control Tower board TSK-008–016. "
        "Development: Mayank (pipeline + Jamie/email/MOM), Blenard (UI + design/content "
        "agents). QA and Control Tower: Jaya. MS-33–35 switched to Blenard; BT-34–36 "
        "switched to Mayank. Docx stages map to First contact and Deepening. "
        "Concretisation keeps the existing priced-proposal path with email added.",
        s["body"],
    ))
    story.append(p(
        "Closure rule: do not close until every Done when condition and required proof is "
        "satisfied. QA-03 is the release gate.",
        s["note"],
    ))

    story.append(p("1. Docx stage mapping", s["h1"]))
    story.append(table(
        ["Docx stage", "App journey stage", "Purpose"],
        [
            ["Stage 1 — Pre-meeting", "First contact", "Research, first-meeting PPT, agenda"],
            ["Stage 2 — After 1st meeting", "Deepening", "Summary, MOM, email, adjusted PPT"],
            ["(not in docx)", "Concretisation", "Priced proposal + optional email"],
        ], s, [38 * mm, 38 * mm, usable - 76 * mm],
    ))

    story.append(Spacer(1, 8))
    story.append(p("2. Stage 1 — Pre-meeting (First contact)", s["h1"]))
    story.append(p("Information provided by the sales team (docx):", s["h2"]))
    story.append(table(
        ["Input", "Ticket"],
        [
            ["Client name", "Existing opportunity field"],
            ["Client web page, POC name, POC position", "MS-33"],
            ["Sales topic description + optional voice recording", "MS-33"],
            ["About company (free text)", "MS-33 / BT-34"],
            ["Client documents — not meeting transcripts", "MS-34 / BT-35"],
        ], s, [usable * 0.55, usable * 0.45],
    ))
    story.append(Spacer(1, 6))
    story.append(p("Expected output (docx):", s["h2"]))
    story.append(table(
        ["Output", "Ticket"],
        [
            ["Brief company description, headcount, HQ, decision makers, revenue", "BT-34 / BT-36"],
            ["Hypothesis for Borek support", "BT-36"],
            ["Relevance to product offering", "BT-36"],
            ["10–15 probing / discovery questions", "BT-36"],
            ["Use case relevance (past Borek use cases)", "BT-36"],
            ["First-meeting PPT: AI-tech, hypothesis, use-case slides", "BT-36 / MS-35"],
            ["1st-meeting agenda", "BT-36 / MS-35"],
            ["Draft email (optional — all stages)", "MS-35 / BT-36"],
        ], s, [usable * 0.55, usable * 0.45],
    ))

    story.append(Spacer(1, 8))
    story.append(p("3. Stage 2 — After 1st meeting (Deepening)", s["h1"]))
    story.append(p("Sales team will provide (docx):", s["h2"]))
    story.append(table(
        ["Input", "Ticket"],
        [
            ["Jamie / meeting transcript", "MS-35 (existing transcript upload)"],
            ["Meeting feedback — rep learnings", "MS-35"],
            ["Additional documents (optional)", "MS-35"],
        ], s, [usable * 0.55, usable * 0.45],
    ))
    story.append(Spacer(1, 6))
    story.append(p("Expected output (docx):", s["h2"]))
    story.append(table(
        ["Output", "Ticket"],
        [
            ["Call summary", "BT-36"],
            ["MOM (minutes of meeting)", "BT-36"],
            ["Draft email after the call", "BT-36 / MS-35"],
            ["Adjusted PPT from meeting discussion", "BT-36 / MS-35"],
            ["14-chapter Framework (review / confirm before Present)", "BT-36 / MS-35"],
        ], s, [usable * 0.55, usable * 0.45],
    ))

    story.append(Spacer(1, 8))
    story.append(p("3.1 Concretisation", s["h1"]))
    story.append(p(
        "Existing priced-proposal deck path is unchanged. This sprint adds optional draft email only.",
        s["body"],
    ))
    story.append(table(
        ["Output", "Ticket"],
        [
            ["Priced proposal deck", "Existing pipeline — not re-scoped in this sprint"],
            ["Optional draft email after proposal", "MS-35 / BT-36"],
        ], s, [usable * 0.55, usable * 0.45],
    ))

    story.append(Spacer(1, 8))
    story.append(p("4. Global rule — transcript → summary before LLM", s["h1"]))
    story.append(p(
        "Whenever the pipeline consumes meeting transcript input (Deepening, "
        "Concretisation, follow-up extraction, framework paths), raw speaker turns are "
        "stored for audit and human review but never sent to LLM prompts. A "
        "TRANSCRIPT_SUMMARIZING job stage produces a structured summary; only that "
        "summary is injected as TRANSCRIPT_SUMMARY_BEGIN…END into extraction, synthesis, "
        "follow-up, and Stage 2 generation prompts. Voice recordings transcribed on "
        "intake follow the same rule. Owner: BT-36 (Mayank). Verified: QA-03 scenario 13.",
        s["body"],
    ))
    story.append(table(
        ["Step", "Behaviour"],
        [
            ["Store", "Raw transcript (speaker turns) unchanged — API + MS-32 review"],
            ["Summarize", "TRANSCRIPT_SUMMARIZING → transcript_summary.schema.json"],
            ["Inject", "TRANSCRIPT_SUMMARY block only — never raw dialogue in LLM calls"],
        ], s, [28 * mm, usable - 28 * mm],
    ))

    story.append(Spacer(1, 8))
    story.append(p("5. Work items by API bundle", s["h1"]))
    story.append(p(
        "Bundle names match docs/Borek_Pitch_Factory_Documentation.pdf §5 (HTTP) and §6 "
        "(worker). Only this sprint’s tickets are listed.",
        s["note"],
    ))
    story.append(table(
        ["Bundle", "Mayank", "Blenard", "Jaya (QA)"],
        [
            ["§5.4 Upload — intake, documents, logo", "BT-34, BT-35", "MS-33, MS-34", "QA-01"],
            ["§6.1 First contact worker", "BT-34, BT-35, BT-36", "MS-35", "QA-02"],
            ["§5.6 Plan + §5.7 Deck — first-meeting PPT", "BT-36", "MS-35", "QA-02"],
            ["§5.5 Framework review + §6.2 Deepening", "BT-36", "MS-35", "QA-03"],
            ["§5.8 Draft email (all stages)", "BT-36, TSK-013", "MS-35", "QA-03"],
            ["§5.3 Eligibility markers", "BT-36 → BT-31", "—", "QA-03, TSK-011"],
            ["§6.3 Concretisation optional email", "BT-36", "MS-35", "QA-03"],
            ["Login / SSO / activity (D3)", "—", "—", "TSK-008"],
            ["Control Tower + MP approval (D5, D11)", "—", "—", "TSK-011, TSK-016"],
            ["Jamie connector + MOM (D8, D10)", "TSK-009, TSK-015", "—", "—"],
            ["CI tokens + content/design agents", "—", "TSK-010, TSK-012, TSK-014", "—"],
        ], s, [36 * mm, 34 * mm, 34 * mm, usable - 104 * mm],
    ))

    story.append(Spacer(1, 8))
    story.append(p("6. Ticket distribution", s["h1"]))
    story.append(table(
        ["Owner", "Role", "Tickets", "Count"],
        [
            ["Mayank Somwani", "Pipeline + Jamie/email/MOM", "BT-34–36, TSK-009, TSK-013, TSK-015", "6"],
            ["Blenard Tahiraj", "UI + design/content agents", "MS-33–35, TSK-010, TSK-012, TSK-014", "6"],
            ["Jaya Joshi", "QA + Control Tower", "QA-01–03, TSK-008, TSK-011, TSK-016", "6"],
        ], s, [32 * mm, 30 * mm, usable - 74 * mm, 12 * mm],
    ))

    story.append(PageBreak())

    story.append(person_banner(
        "Mayank Somwani",
        "Pipeline + Jamie / follow-up email / minutes",
        "BT-34 · BT-35 · BT-36 · TSK-009 · TSK-013 · TSK-015",
        s, MAYANK,
    ))
    story.append(Spacer(1, 8))
    story.append(ticket_block(s, "BT-34",
        "Intake context + company research in main prompts",
        "Phase 3  ·  P0  ·  docs/tickets/BT34_ABOUT_COMPANY_PROMPT_INJECTION.md",
        "Persist Stage 1 intake fields. Inject STAGE1_INTAKE block in prompts. Generate research "
        "JSON: company brief, hypothesis, relevance. Transcribe optional voice recording.",
        "Research schema frozen. Prompts logged. No invented company facts.",
        "None — freeze schema day one.",
    ))
    story.append(ticket_block(s, "BT-35",
        "First contact client document pipeline",
        "Phase 3  ·  P0  ·  docs/tickets/BT35_FIRST_CONTACT_DOCUMENT_PIPELINE.md",
        "Client documents as Stage 1 primary source. Reject transcript-only First contact. "
        "Deepening requires meeting transcript.",
        "Stage 1 runs from documents + intake. Integration test passes.",
        "BT-34.",
    ))
    story.append(ticket_block(s, "BT-36",
        "Stage 1 & 2 output pipelines + transcript summarization",
        "Phase 4  ·  P0  ·  docs/tickets/BT36_FIRST_CONTACT_EMAIL_ONLY_PIPELINE.md",
        "Stage 1: research, questions, use cases, 3-slide PPT, agenda, optional email. "
        "Stage 2: summary, MOM, email, adjusted PPT. Global: TRANSCRIPT_SUMMARIZING before "
        "any LLM call — summary only, not raw turns. Concretisation: optional email.",
        "Every docx output on fixture path. LLM logs show TRANSCRIPT_SUMMARY not raw "
        "dialogue. transcript_summary.schema.json frozen. BT-31 markers updated.",
        "BT-34, BT-35, BT-33, JJ-31 first-meeting profile.",
    ))
    story.append(ticket_block(s, "TSK-009",
        "Build Jamie AI connector (D8)",
        "Implementation  ·  Critical  ·  docs/tickets/TSK009_JAMIE_AI_CONNECTOR.md",
        "A finished Jamie meeting is picked up automatically; transcript, participants and "
        "actions feed Control Tower / Pitch Factory.",
        "Transcript, participants and actions available within ten minutes of meeting end.",
        "Microsoft 365 / Jamie access.",
    ))
    story.append(ticket_block(s, "TSK-013",
        "Build follow-up e-mail in three lengths (D9)",
        "Implementation  ·  Critical  ·  docs/tickets/TSK013_FOLLOWUP_EMAIL_THREE_LENGTHS.md",
        "From one test meeting produce a short, a medium and an extensive follow-up draft, "
        "with the option to attach a generated deck.",
        "Three length variants exist for one test meeting; deck attach is optional.",
        "BT-36 / TSK-012 content; TSK-014 deck.",
    ))
    story.append(ticket_block(s, "TSK-015",
        "Build automated minutes of meeting (D10)",
        "Implementation  ·  High  ·  docs/tickets/TSK015_AUTOMATED_MINUTES.md",
        "Minutes with participants, decisions, actions, owners and dates generated and "
        "filed automatically.",
        "MOM generated and filed without manual transcription for the test meeting.",
        "TSK-009 transcript.",
    ))

    story.append(PageBreak())

    story.append(person_banner(
        "Blenard Tahiraj",
        "User surface + CI tokens / content & design agents",
        "MS-33 · MS-34 · MS-35 · TSK-010 · TSK-012 · TSK-014",
        s, BLENARD,
    ))
    story.append(Spacer(1, 8))
    story.append(ticket_block(s, "MS-33",
        "Stage 1 sales intake (docx fields + About Company + voice)",
        "Phase 3  ·  P0  ·  docs/tickets/MS33_ABOUT_COMPANY_INTAKE.md",
        "Pre-meeting form: client web page, POC name/position, sales topic, optional voice "
        "recording, About company. No transcript on First contact.",
        "All docx Stage 1 inputs persist and reload. Voice optional. Transcript panel hidden "
        "on First contact.",
        "BT-34 schema freeze.",
    ))
    story.append(ticket_block(s, "MS-34",
        "Client document upload for First contact",
        "Phase 3  ·  P0  ·  docs/tickets/MS34_FIRST_CONTACT_DOCUMENT_UPLOAD.md",
        "Replace transcript upload with client documents (.pdf, .docx, .txt) on First contact. "
        "Transcripts belong to Deepening (Stage 2).",
        "Document upload on First contact; transcript upload on Deepening; clear errors.",
        "BT-35 upload API.",
    ))
    story.append(ticket_block(s, "MS-35",
        "Stage output review UI + email on all 3 stages",
        "Phase 4  ·  P0  ·  docs/tickets/MS35_EMAIL_ALL_STAGES_NO_PPT_FIRST_CONTACT.md",
        "Review/download for every docx output. Stage 2 intake: transcript + meeting feedback "
        "+ optional docs. Email review on First contact, Deepening, and Concretisation.",
        "All docx outputs have UI surfaces. Deepening collects meeting feedback. Email on all "
        "three stages; confirm does not auto-send.",
        "BT-36 outputs, MS-32 email review.",
    ))
    story.append(ticket_block(s, "TSK-010",
        "Translate the CI sheet into design tokens",
        "Design  ·  High  ·  docs/tickets/TSK010_CI_DESIGN_TOKENS.md",
        "CI sheet received from Euron translated into the design tokens used by the design agent.",
        "Tokens consumed by TSK-014 with no one-off colour/type overrides.",
        "Euron CI sheet.",
    ))
    story.append(ticket_block(s, "TSK-012",
        "Build content agent for the three journey stages (D6)",
        "Implementation  ·  Critical  ·  docs/tickets/TSK012_CONTENT_AGENT.md",
        "For each journey stage a factually complete draft is produced from a test transcript "
        "without manual editing.",
        "First contact, Deepening and Concretisation drafts exist from one test transcript.",
        "TSK-009 / BT-36 transcript path.",
    ))
    story.append(ticket_block(s, "TSK-014",
        "Build design agent on the design tokens (D7)",
        "Implementation  ·  Critical  ·  docs/tickets/TSK014_DESIGN_AGENT.md",
        "Output carries the CI and is judged sendable without rework against the reference deck.",
        "Reference-deck comparison passes for the test output.",
        "TSK-010 tokens; TSK-012 content.",
    ))

    story.append(PageBreak())

    story.append(person_banner(
        "Jaya Joshi",
        "QA sign-off + login / Control Tower / approval",
        "QA-01 · QA-02 · QA-03 · TSK-008 · TSK-011 · TSK-016",
        s, QA,
    ))
    story.append(Spacer(1, 8))
    story.append(ticket_block(s, "QA-01",
        "Stage 1 intake + research outputs",
        "Phase 3  ·  P0  ·  docs/tickets/QA01_ABOUT_COMPANY_VERIFICATION.md",
        "Verify docx Stage 1 inputs and research brief (description, headcount, HQ, decision "
        "makers, revenue, hypothesis, relevance). Voice recording path.",
        "Five scenarios signed off. No transcript on Stage 1.",
        "MS-33, BT-34, BT-35 deployed.",
    ))
    story.append(ticket_block(s, "QA-02",
        "Stage 1 documents + first-meeting PPT and agenda",
        "Phase 3  ·  P0  ·  docs/tickets/QA02_FIRST_CONTACT_DOCUMENT_UPLOAD.md",
        "Verify documents drive generation; 10–15 questions; use case relevance; 3-slide PPT; "
        "meeting agenda.",
        "Six scenarios pass. PPT slide types match docx.",
        "MS-34, BT-36 Stage 1 path deployed.",
    ))
    story.append(ticket_block(s, "QA-03",
        "Stage 2 outputs + email all stages + transcript summary rule",
        "Phase 4  ·  P0  ·  docs/tickets/QA03_EMAIL_ALL_STAGES_NO_PPT_FIRST_CONTACT.md",
        "Verify Stage 2 outputs, email on all three stages, journey unlock, Concretisation "
        "pricing, and scenario 13: LLM payload has TRANSCRIPT_SUMMARY not raw speaker turns; "
        "raw transcript still retrievable for review.",
        "Seventeen scenarios documented. Blocks MS-35 / BT-36 release.",
        "MS-35, BT-36, QA-01, QA-02 complete.",
    ))
    story.append(ticket_block(s, "TSK-008",
        "Build employee login, role model and activity log (D3)",
        "Implementation  ·  Critical  ·  docs/tickets/TSK008_EMPLOYEE_LOGIN_ACTIVITY_LOG.md",
        "Sign-in via Microsoft 365 SSO. Role model for generate / edit / release. Activity "
        "log for every generation, edit and release.",
        "SSO works; every generation, edit and release is logged with user, time and document ID.",
        "Microsoft 365 tenant.",
    ))
    story.append(ticket_block(s, "TSK-011",
        "Build Control Tower routing, versioning and logging (D5)",
        "Implementation  ·  Critical  ·  docs/tickets/TSK011_CONTROL_TOWER_ROUTING.md",
        "Journey stage and output type selectable; request routed, versioned and logged end-to-end.",
        "A request can be selected, routed, versioned and audited from intake to output.",
        "TSK-008 session.",
    ))
    story.append(ticket_block(s, "TSK-016",
        "Build approval workflow and automatic filing (D11)",
        "Implementation  ·  Critical  ·  docs/tickets/TSK016_APPROVAL_AND_FILING.md",
        "No document reaches ready to send without a Managing Partner release; released "
        "documents are filed automatically.",
        "Unreleased output cannot be sent; released output is filed with lineage.",
        "TSK-011 routing; AT-61 filing shape.",
    ))

    story.append(Spacer(1, 10))
    story.append(p("7. Contracts to freeze (week one)", s["h1"]))
    story.append(table(
        ["Handoff", "Freeze", "Consumer"],
        [
            ["BT-34 → MS-33", "Stage 1 intake API + stage1_research.schema.json", "Blenard intake UI"],
            ["BT-35 → MS-34", "Client document upload response", "Blenard upload panel"],
            ["BT-36 → MS-35", "stage1_outputs + stage2_outputs schemas", "Blenard review screens"],
            ["BT-36 → all LLM paths", "transcript_summary.schema.json", "Extraction, synthesis, follow-up, Stage 2"],
            ["BT-36 → JJ-31", "First-meeting 3-slide PPT profile", "Gamma / PPTX rendering"],
            ["BT-36 → BT-31", "Completion markers per stage artefact set", "Journey unlock"],
            ["TSK-010 → TSK-014", "CI design tokens from Euron sheet", "Design agent"],
            ["TSK-009 → TSK-012 / TSK-015", "Jamie transcript + participants + actions", "Content agent, MOM"],
        ], s, [28 * mm, 58 * mm, usable - 86 * mm],
    ))

    story.append(Spacer(1, 8))
    story.append(p("8. Suggested sequence", s["h1"]))
    story.append(table(
        ["Wave", "Mayank", "Blenard", "Jaya"],
        [
            ["1 — Stage 1 intake", "BT-34 freeze + build", "MS-33", "QA-01, TSK-008"],
            ["2 — Documents + research", "BT-35, TSK-009", "MS-34, TSK-010", "QA-02, TSK-011"],
            ["3 — Outputs + agents + email", "BT-36, TSK-013, TSK-015", "MS-35, TSK-012, TSK-014", "QA-03, TSK-016"],
        ], s, [28 * mm, 40 * mm, 40 * mm, usable - 108 * mm],
    ))
    story.append(Spacer(1, 6))
    story.append(p(
        "Specs: docs/tickets/FEATURE_REDEFINITION_SPRINT.md, TSK_ASSIGNMENT.md, MS33–MS35, "
        "BT34–BT36, QA01–QA03, TSK008–TSK016. "
        "Regenerate: python scripts/generate_feature_redefinition_tickets_pdf.py",
        s["note"],
    ))

    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    return OUTPUT


if __name__ == "__main__":
    print(build())
