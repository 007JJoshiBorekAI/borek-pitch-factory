"""Client appendix of the Master Presentation: planning contract, planner and validation.

The appendix is a concise, meeting-oriented synthesis of ONE approved Discovery analysis
(schema 2.0). It is not a slide per white-paper page and it does not repeat what the canonical
deck already says about Borek. Every slide

* uses a layout of the master library (L01-L25),
* cites the parts of the approved analysis it draws on (``source_references``), and
* states nothing about the client that the analysis does not contain: figures must occur in
  the approved analysis, benchmarks stay labelled as benchmarks, unknowns stay open questions.

The planner is deterministic: the same approved version always yields the same appendix. What
it yields depends on the analysis: a generic analysis without client context gets a short
appendix, client context adds the questions and target workflows, and every further area the
context points at adds depth (more opportunity and question slides). Nothing is padded.
"""

from __future__ import annotations

import copy
import hashlib
import json
import re
from typing import Any

from services.presentation.borek_deck.engine import engine
from services.presentation.master_deck.layouts import (
    FILLED_CARD_LAYOUTS,
    LAYOUT_IDS,
    implemented_layouts,
    line_count,
    measured_height,
)

# The planner composes the appendix from these layouts only. Every one of them is implemented;
# a layout that is not can never be selected, so a valid plan can never fail on its layout.
PLANNER_LAYOUTS: tuple[str, ...] = ("L06", "L01", "L25", "L08", "L14", "L07")
MAX_OPPORTUNITY_SLIDES = 3

DISCOVERY_SCHEMA_VERSION = "2.0"
_NUMBER_RE = re.compile(r"\d[\d.,]*\d|\d")
_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")
_COUNTER_RE = re.compile(r"\(\d+/\d+\)")
_STRUCTURAL_KEYS = frozenset({"code", "number", "layout"})
BENCHMARK_NOTE = "Figures are industry benchmarks and working hypotheses from the approved analysis, not commitments."


class AppendixPlanError(ValueError):
    """The appendix violates the planning contract or cannot be built from the approved analysis."""

    code = "MASTER_APPENDIX_INVALID"


def approved_analysis(version_row: dict[str, Any]) -> dict[str, Any]:
    """The frozen paper of an approved Discovery v2 version, or an explicit error."""
    paper = version_row.get("paper_json")
    if str(version_row.get("status")) != "approved":
        raise AppendixPlanError("The Master Presentation needs an approved Discovery version")
    if not isinstance(paper, dict) or paper.get("schema_version") != DISCOVERY_SCHEMA_VERSION:
        raise AppendixPlanError("The Master Presentation needs an approved Discovery analysis (schema 2.0)")
    if not isinstance(paper.get("presentation_brief"), dict) or not isinstance(paper.get("analysis"), dict):
        raise AppendixPlanError("The approved Discovery analysis has no presentation brief")
    return paper


def appendix_source_hash(paper: dict[str, Any]) -> str:
    """Checksum of exactly the content the appendix may draw on."""
    source = {"presentation_brief": paper["presentation_brief"], "analysis": paper["analysis"]}
    return hashlib.sha256(json.dumps(source, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------------- references


def resolve_reference(paper: dict[str, Any], reference: str) -> Any:
    """The part of the approved analysis a reference id points at; ``None`` when it does not exist."""
    analysis = paper["analysis"]
    kind, _, ref = reference.partition(":")
    if kind == "brief.core_thesis":
        return paper["presentation_brief"]["core_thesis"]
    if kind == "brief.document_title":
        return paper["presentation_brief"]["document_title"]
    if kind == "research.known_facts":
        return analysis["research"]["known_facts"]
    if kind == "research.unknown_facts":
        return analysis["research"]["unknown_facts"]
    if kind == "closing":
        return analysis["closing"]
    if kind == "target_picture":
        return analysis["target_picture"]
    if kind == "framing.chapter":
        return analysis["framing"]["chapters"].get(ref)
    if kind == "framing.lead":
        return analysis["framing"]["leads"].get(ref)
    if kind == "area":
        return next((area for area in analysis["areas"] if area["id"] == ref), None)
    if kind == "workflow":
        return next((item for item in analysis["target_workflows"] if item["id"] == ref), None)
    if kind == "opportunity":
        area_id, _, opportunity_id = ref.partition("/")
        area = next((item for item in analysis["areas"] if item["id"] == area_id), None)
        return next((item for item in (area or {}).get("opportunities", []) if item["id"] == opportunity_id), None)
    return None


# ---------------------------------------------------------------------------------- planner


def plan_appendix(paper: dict[str, Any], *, first_order: int) -> list[dict[str, Any]]:
    """Appendix slides for one approved analysis, numbered from ``first_order``."""
    analysis = paper["analysis"]
    brief = paper["presentation_brief"]
    research = analysis["research"]
    chapters = analysis["framing"]["chapters"]
    leads = analysis["framing"]["leads"]
    client = str(brief.get("client_name") or "").strip()
    if not set(PLANNER_LAYOUTS) <= implemented_layouts():
        raise AppendixPlanError("The appendix planner refers to a layout that is not implemented")
    pool = _opportunity_pool(analysis)
    in_focus = sum(1 for area, _item in pool if area["priority"])
    # A stated meeting purpose, or areas it points at, make the conversation concrete.
    has_context = bool(paper["intake_context"]["meeting_purpose"]) or in_focus > 0
    # One slide of four by default; every further four opportunities in the client's focus
    # areas add a slide, up to the cap.
    opportunity_slides = min(max(1, in_focus // 4), MAX_OPPORTUNITY_SLIDES, len(pool) // 4)
    featured = pool[: opportunity_slides * 4]
    slides: list[tuple[str, str, dict[str, Any], list[str]]] = []

    # Divider: where the client-specific part begins.
    title = client if client and _fits(client, 105, 300, 1690, 1, -2.5) else "Your AI opportunities"
    slides.append(
        (
            "L06",
            "Open the client-specific appendix",
            {
                "kicker": "Appendix · Client view",
                "title": title,
                "text": "A discussion basis from the approved Discovery analysis — working hypotheses to validate together.",
            },
            ["brief.document_title"],
        )
    )

    # Client context: what was provided, what is open, and the core thesis as a hypothesis.
    known = _bullets([f"{fact['label']}: {fact['value']}" for fact in research["known_facts"]])
    researched = bool(research["web_research"]["performed"])
    slides.append(
        (
            "L01",
            "Client context and business thesis",
            {
                "kicker": "Client context",
                "title": "What we know — and what we want to validate",
                "lead": (
                    "Based on the information provided for this conversation and cited research."
                    if researched
                    else "Based on the information provided for this conversation. No company research was performed, so open points stay open."
                ),
                "left": {
                    "label": "Known",
                    "title": "Provided information",
                    "bullets": known or ["No client information was provided for this analysis."],
                },
                "right": {
                    "label": "Open",
                    "title": "To validate together",
                    "bullets": _bullets(research["unknown_facts"]),
                },
                "statement": {"kicker": "Working hypothesis", "text": _without_label(brief["core_thesis"], "Working hypothesis")},
                "footnote": BENCHMARK_NOTE,
            },
            ["research.known_facts", "research.unknown_facts", "brief.core_thesis"],
        )
    )

    # Priority opportunities: four per slide. Areas the client's context points at are shown in
    # depth, so more context means more slides; without context it is one slide across areas.
    for index in range(opportunity_slides):
        group = featured[index * 4 : index * 4 + 4]
        focus = sorted({area["name"] for area, _item in group if area["priority"]})
        slides.append(
            (
                "L25",
                "Most important opportunities",
                {
                    "kicker": "Priority opportunities",
                    "title": _numbered("Where we would start", index, opportunity_slides),
                    "lead": (
                        "Opportunities in the areas your context points at — to be confirmed in the conversation."
                        if focus
                        else "The opportunities the approved analysis ranks first — one per area, to be confirmed in the conversation."
                    ),
                    "cards": [{"title": item["title"], "text": item["result"]} for _area, item in group],
                    "statement": {"kicker": "Signal to listen for", "text": group[0][1]["opportunity_signal"]},
                    "footnote": BENCHMARK_NOTE,
                },
                [f"opportunity:{area['id']}/{item['id']}" for area, item in group],
            )
        )

    # Areas in scope with their typical impact: six rows per slide, as many slides as needed.
    areas = _ranked_areas(analysis)
    per_slide = -(-len(areas) // (-(-len(areas) // 6)))  # balanced: seven areas are 4 + 3, not 6 + 1
    area_groups = [areas[index : index + per_slide] for index in range(0, len(areas), per_slide)]
    for index, group in enumerate(area_groups):
        offset = index * per_slide
        slides.append(
            (
                "L08",
                "Priority business areas",
                {
                    "kicker": "Priority areas",
                    "title": _numbered("Areas in scope and their typical impact", index, len(area_groups)),
                    "lead": leads["business_case"],
                    "rows": [
                        {"code": f"{offset + position:02d}", "title": area["name"], "text": _impact_line(area["business_case"])}
                        for position, area in enumerate(group, start=1)
                    ],
                    "notes": [
                        {
                            "title": "Benchmarks, not commitments",
                            "text": "All ranges are industry benchmarks used as working hypotheses. They are validated against real metrics in the baseline workshop.",
                        },
                        {
                            "title": "People keep every decision",
                            "text": "AI drafts, checks and orchestrates. Approvals, releases and sign-offs stay with your teams.",
                        },
                    ],
                },
                ["framing.lead:business_case", *[f"area:{area['id']}" for area in group]],
            )
        )

    # Questions and target workflows are prepared for a concrete conversation. A generic analysis
    # (no client context at all) stops at the overview and the next steps.
    if has_context:
        asked = _questions(featured)
        question_slides = len(asked) // 4
        for index in range(question_slides):
            group = asked[index * 4 : index * 4 + 4]
            slides.append(
                (
                    "L14",
                    "Open questions and decisions to validate",
                    {
                        "kicker": "Questions for the conversation",
                        "title": _numbered("What we would like to understand", index, question_slides),
                        "lead": "Each question belongs to one priority opportunity. The answer shows whether a deep dive is worth it.",
                        "items": [{"question": question, "answer": item["opportunity_signal"]} for _area, item, question in group],
                        "support": chapters["deep_dive"]["key_message"],
                    },
                    ["framing.chapter:deep_dive", *[f"opportunity:{area['id']}/{item['id']}" for area, item, _q in group]],
                )
            )
        workflows = analysis["target_workflows"][:6]
        gates = " · ".join(item["human_decision_gate"] for item in workflows[:3])
        slides.append(
            (
                "L08",
                "Selected target workflows",
                {
                    "kicker": "Target picture",
                    "title": "How the building blocks chain into workflows",
                    "lead": "Each chain runs through automated blocks to a human decision gate.",
                    "rows": [
                        {"code": f"{position:02d}", "title": item["name"], "text": " → ".join(item["stages"])}
                        for position, item in enumerate(workflows, start=1)
                    ],
                    "notes": [
                        {"title": "Decisions that stay human", "text": gates},
                        {"title": "Learning loop", "text": analysis["target_picture"]["learning_loop"]},
                    ],
                },
                ["target_picture", *[f"workflow:{item['id']}" for item in workflows]],
            )
        )

    # Validation approach: baseline workshop, pilot, scaling.
    closing = analysis["closing"]
    slides.append(
        (
            "L07",
            "First pilot and validation approach",
            {
                "kicker": "Next steps",
                "title": "From this discussion to a measured result",
                "lead": leads["closing_steps"],
                "stages": [
                    {"number": f"{position:02d}", "title": step["title"], "text": _stage_text(step["text"])}
                    for position, step in enumerate(closing["steps"], start=1)
                ],
                "statement": {"kicker": closing["name"], "text": closing["headline"]},
            },
            ["closing", "framing.lead:closing_steps"],
        )
    )

    planned = [
        {
            "order": first_order + index,
            "layout_id": layout_id,
            "purpose": purpose,
            "content": {"layout": layout_id, **content},
            "source_references": references,
        }
        for index, (layout_id, purpose, content, references) in enumerate(slides)
    ]
    validate_appendix(planned, paper, first_order=first_order)
    return planned


def _ranked_areas(analysis: dict[str, Any]) -> list[dict[str, Any]]:
    """Areas the client's own context points at first, then quick wins - the analysis' own ranking."""
    return sorted(
        analysis["areas"],
        key=lambda area: (not area["priority"], area["business_case"]["payback_type"] != "quick_win"),
    )


def _opportunity_pool(analysis: dict[str, Any]) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    """Opportunities worth a slide, most relevant first.

    Every opportunity of an area the client's own context points at, then the lead opportunity
    of each remaining area. Only cards that fit the open-cards layout are kept.
    """
    ranked = _ranked_areas(analysis)
    pool = [(area, item) for area in ranked if area["priority"] for item in area["opportunities"]]
    pool += [(area, area["opportunities"][0]) for area in ranked if not area["priority"]]
    return [
        (area, item)
        for area, item in pool
        if _fits(item["title"], 28, 600, 414, 2) and measured_height(item["result"], 21, 400, 414, 1.5) <= 330
    ]


def _numbered(title: str, index: int, total: int) -> str:
    return f"{title} ({index + 1}/{total})" if total > 1 else title


def _impact_line(case: dict[str, Any]) -> str:
    payback = "Quick win" if case["payback_type"] == "quick_win" else "Strategic"
    for item in case["impact_ranges"]:
        return f"{item['metric']} {item['range']} ({item['basis'].replace('_', ' ')}) · {payback}"
    return f"{case['outcome'][:1].upper()}{case['outcome'][1:]} · {payback}"


def _questions(featured: list[tuple[dict[str, Any], dict[str, Any]]]) -> list[tuple[dict[str, Any], dict[str, Any], str]]:
    """Per featured opportunity the first discovery question whose card fits the FAQ layout.

    Two rows of cards share 460 px, so a card (question, signal, padding) may be 215 px high.
    An opportunity without a fitting question is left out rather than cut.
    """
    chosen = []
    for area, item in featured:
        answer = measured_height(item["opportunity_signal"], 21, 400, 790, 1.45)
        question = next(
            (q for q in item["discovery_questions"] if 34 + measured_height(q, 32, 300, 790, 1.25, italic=True) + 16 + answer + 34 <= 212),
            None,
        )
        if question:
            chosen.append((area, item, question))
    return chosen


def _bullets(items: list[str]) -> list[str]:
    """Leading bullets that fit a comparison card (at most four; fewer when one needs two lines)."""
    chosen: list[str] = []
    height = 0.0
    for item in items:
        needed = measured_height(item, 23, 400, 740, 1.4) + (16 if chosen else 0)
        if len(chosen) == 4 or height + needed > 190:
            break
        chosen.append(item)
        height += needed
    return chosen


def _stage_text(text: str) -> str:
    """The step text, or its leading sentence when the whole text does not fit a stage card."""
    fits = lambda candidate: measured_height(candidate, 21, 400, 488, 1.45) <= 5 * 21 * 1.45 + 1  # noqa: E731
    return text if fits(text) else _SENTENCE_RE.split(text)[0]


def _without_label(text: str, label: str) -> str:
    prefix = f"{label}: "
    if text.lower().startswith(prefix.lower()) and len(text) > len(prefix):
        return text[len(prefix)].upper() + text[len(prefix) + 1 :]
    return text


def _fits(text: str, size: float, weight: int, width: float, max_lines: int, ls: float = 0.0) -> bool:
    return line_count(text, size, weight, width, ls) <= max_lines


# ---------------------------------------------------------------------------------- validation


def validate_appendix(slides: list[dict[str, Any]], paper: dict[str, Any], *, first_order: int) -> None:
    """Planning contract, source integrity and layout rules. Raises with every finding."""
    problems: list[str] = []
    if not slides:
        problems.append("the appendix has no slides")
    source_numbers = set(_NUMBER_RE.findall(json.dumps({"a": paper["analysis"], "b": paper["presentation_brief"]}, ensure_ascii=False)))
    previous_filled = False
    for index, slide in enumerate(slides):
        where = f"appendix slide {index + 1}"
        missing = [key for key in ("order", "layout_id", "purpose", "content", "source_references") if key not in slide]
        if missing:
            problems.append(f"{where} lacks {', '.join(missing)}")
            continue
        layout_id = str(slide["layout_id"])
        if slide["order"] != first_order + index:
            problems.append(f"{where} has order {slide['order']}, expected {first_order + index}")
        if layout_id not in LAYOUT_IDS:
            problems.append(f"{where} uses '{layout_id}', which is not a master layout (L01-L25)")
            continue
        if layout_id not in implemented_layouts():
            problems.append(f"{where} uses {layout_id}, which is not implemented yet")
        if slide["content"].get("layout") != layout_id:
            problems.append(f"{where}: content does not belong to layout {layout_id}")
        if not str(slide["purpose"]).strip():
            problems.append(f"{where} has no purpose")
        references = slide["source_references"]
        if not isinstance(references, list) or not references:
            problems.append(f"{where} cites no source in the approved Discovery analysis")
        else:
            for reference in references:
                if resolve_reference(paper, str(reference)) is None:
                    problems.append(f"{where} cites '{reference}', which is not part of the approved analysis")
        # "(1/2)" in a title is a slide counter, not a figure about the client.
        invented = sorted(
            {n for text in _texts(slide["content"]) for n in _NUMBER_RE.findall(_COUNTER_RE.sub("", text))} - source_numbers
        )
        if invented:
            problems.append(f"{where} states figures that are not in the approved analysis: {', '.join(invented)}")
        filled = layout_id in FILLED_CARD_LAYOUTS
        if filled and previous_filled:
            problems.append(f"{where}: two filled-card layouts in a row break the master's card-variety rule")
        previous_filled = filled
    if not problems:  # only a structurally valid appendix can be laid out
        problems.extend(layout_fit_problems(slides))
    if problems:
        raise AppendixPlanError("; ".join(problems))


def layout_fit_problems(slides: list[dict[str, Any]]) -> list[str]:
    """Lay every slide out once in memory: text that does not fit is reported, never shrunk."""
    from services.presentation.master_deck.assembly import fit_problems

    return fit_problems([copy.deepcopy(slide["content"]) for slide in slides if "content" in slide])


def _texts(node: Any) -> list[str]:
    if isinstance(node, str):
        return [node]
    if isinstance(node, list):
        return [text for item in node for text in _texts(item)]
    if isinstance(node, dict):
        return [text for key, item in node.items() if key not in _STRUCTURAL_KEYS for text in _texts(item)]
    return []
