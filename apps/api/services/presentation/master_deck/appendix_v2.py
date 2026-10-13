"""Post-meeting appendix of Master Presentation V2: planner and validation.

The V2 appendix prepares the SECOND client conversation. It is built from one frozen snapshot
(see ``master_deck/v2.py``) and from nothing else:

* the meeting findings the owner confirmed - never an excluded one,
* the selected, approved Borek use cases,
* the approved Discovery analysis as background.

Every statement keeps its origin visible. Each slide carries exactly one kind of content, named
in its kicker and explained in its notes:

    client     said in the first meeting (found in the transcript) and confirmed by the owner
    owner      an observation from the owner's personal notes - never shown as a client statement
    reference  an approved Borek reference use case
    borek      a Borek recommendation, taken from the approved Discovery analysis
    open       a question of the approved Discovery analysis that is still open

Nothing is invented: every finding is rendered verbatim, figures must occur in the snapshot,
and industry benchmarks from the Discovery analysis stay labelled as benchmarks. The planner is
deterministic and adds a slide only where the snapshot has content for it.
"""

from __future__ import annotations

import copy
import json
import re
from typing import Any

from services.presentation.borek_deck.engine import engine
from services.presentation.master_deck.appendix import (
    BENCHMARK_NOTE,
    _COUNTER_RE,
    _NUMBER_RE,
    _fits,
    _numbered,
    _opportunity_pool,
    _stage_text,
    _texts,
    AppendixPlanError,
    layout_fit_problems,
)
from services.presentation.master_deck.layouts import LAYOUT_IDS, implemented_layouts, measured_height

PLANNER_VERSION = "master-presentation-v2:v2"
PLANNER_LAYOUTS: tuple[str, ...] = ("L06", "L08", "L07")
CATEGORIES = ("requirements", "challenges", "priorities", "opportunities", "discussed_solutions", "decisions", "follow_ups")
CATEGORY_LABEL = {
    "requirements": "Requirement",
    "challenges": "Challenge",
    "priorities": "Priority",
    "opportunities": "Opportunity",
    "discussed_solutions": "Discussed solution",
    "decisions": "Decision",
    "follow_ups": "Follow-up",
}
CATEGORY_CODE = {
    "requirements": "R",
    "challenges": "C",
    "priorities": "P",
    "opportunities": "O",
    "discussed_solutions": "S",
    "decisions": "D",
    "follow_ups": "F",
}
# Findings that occur in the transcript are client statements; "both" was also noted by the owner.
CLIENT_SOURCES = frozenset({"transcript", "both"})
OWNER_SOURCE = "personal_notes"
MAX_OPEN_QUESTIONS = 3
# A recommendation needs this many content words in common with what the client said.
MIN_SHARED_TERMS = 2
MAX_RECOMMENDATIONS = 4
_WORD_RE = re.compile(r"[a-zäöüß]{4,}", re.IGNORECASE)
# Words that say nothing about the subject of a statement. A recommendation must not rest on them.
_STOPWORDS = frozenset(
    "with that this from they them their have will would should could must about into over under than then when what which "
    "your ours ourselves also only more most some such very just need needs want wants start first next before after "
    "every each other another same many much several team teams people company client customer today currently "
    "system systems data process processes work works time times thing things make makes take takes done does".split()
)
_MATRIX_TOP, _MATRIX_BOTTOM = 400.0, 940.0


def confirmed_findings(snapshot: dict[str, Any]) -> list[dict[str, str]]:
    """Every confirmed finding of the snapshot as {category, text, source}, in category order."""
    return [
        {"category": category, "text": str(item["text"]), "source": str(item["source"])}
        for category in CATEGORIES
        for item in snapshot["findings"].get(category, [])
    ]


def plan_v2_appendix(snapshot: dict[str, Any], *, first_order: int) -> list[dict[str, Any]]:
    """Appendix slides for one frozen post-meeting snapshot, numbered from ``first_order``."""
    if not set(PLANNER_LAYOUTS) <= implemented_layouts():
        raise AppendixPlanError("The V2 appendix planner refers to a layout that is not implemented")
    findings = confirmed_findings(snapshot)
    if not findings:
        raise AppendixPlanError("Master Presentation V2 needs at least one confirmed meeting finding")
    paper = snapshot["approved_discovery"]
    analysis = paper["analysis"]
    client = str(snapshot.get("client_name") or "").strip()
    named = client or "the client"
    slides: list[tuple[str, str, dict[str, Any], list[str]]] = []
    omitted: list[str] = []

    slides.append(
        (
            "L06",
            "Open the post-meeting appendix",
            {
                "kicker": "Appendix · After our first meeting",
                "title": client if client and _fits(client, 105, 300, 1690, 1, -2.5) else "After our first meeting",
                "text": "What we heard in our first conversation, what we suggest on that basis, and what is still open.",
            },
            ["meeting_review"],
        )
    )

    client_notes = [
        {
            "title": "Said in the meeting",
            "text": "Each point is taken word for word from the transcript of our first conversation and was confirmed for this presentation.",
        },
        {
            "title": "Please correct us",
            "text": "If we misunderstood a point, tell us. This page is the basis for everything that follows.",
        },
    ]
    discussed_notes = [
        {"title": "Discussed, not decided", "text": "Solutions marked as discussed were mentioned in the conversation. Decisions are listed separately."},
        client_notes[0],
    ]
    needs = _finding_rows(findings, ("requirements", "priorities"), CLIENT_SOURCES, omitted)
    situation = _finding_rows(findings, ("challenges", "opportunities"), CLIENT_SOURCES, omitted)
    discussed = _finding_rows(findings, ("discussed_solutions",), CLIENT_SOURCES, omitted)
    heard = needs + situation + discussed
    if heard and _fits_one_matrix(heard):
        # A short meeting record reads better on one page than on three nearly empty ones.
        _matrix_slides(
            slides,
            heard,
            kicker="From the meeting · Client statements",
            title="What we heard in our first meeting",
            lead=f"The points {named} raised in our first meeting, in their own words.",
            notes=discussed_notes if discussed else client_notes,
            purpose="Client statements confirmed from the first meeting",
        )
    else:
        _matrix_slides(
            slides,
            needs,
            kicker="From the meeting · Client statements",
            title="What you need and what comes first",
            lead=f"Requirements and priorities as {named} described them in our first meeting.",
            notes=client_notes,
            purpose="Requirements and priorities confirmed in the first meeting",
        )
        _matrix_slides(
            slides,
            situation,
            kicker="From the meeting · Client statements",
            title="Where it is difficult today and where you see potential",
            lead=f"Challenges and opportunities as {named} described them in our first meeting.",
            notes=client_notes,
            purpose="Challenges and opportunities confirmed in the first meeting",
        )
        # Solutions that were talked about: discussed, not agreed.
        _matrix_slides(
            slides,
            discussed,
            kicker="From the meeting · Solutions discussed",
            title="Solutions we talked about",
            lead="Approaches that came up in our first meeting. They were discussed, not agreed.",
            notes=discussed_notes,
            purpose="Solutions discussed in the first meeting",
        )
    # What Borek adds - none of it a client statement, all of it labelled row by row:
    #   the owner's own observations, the approved references selected for this client, and
    #   Discovery opportunities with clear support in what the client said (the recommendation).
    # Fewer than MIN_SHARED_TERMS shared subject words means no recommendation rather than a weak one.
    observations = _finding_rows(findings, CATEGORIES, frozenset({OWNER_SOURCE}), omitted, prefix="N", title="Our observation")
    references = _use_case_rows(snapshot, omitted)
    matches = _matching_opportunities(analysis, findings)
    recommended = _recommended(matches)
    recommendation_rows = [
        {
            "code": f"A{position}",
            "title": match["item"]["title"],
            "text": match["item"]["result"],
            "reference": f"discovery.opportunity:{match['area']['id']}/{match['item']['id']}",
        }
        for position, match in enumerate(recommended, start=1)
    ]
    recommendation_rows = [row for row in recommendation_rows if _row_height(row) <= _MATRIX_BOTTOM - _MATRIX_TOP]
    evidence = sorted({reference for match in recommended for reference in match["evidence"]})
    observation_note = {"title": "Our observations", "text": "From our own notes after the meeting, not from the transcript. We would like to verify each of them with you."}
    reference_note = {"title": "Borek references", "text": "From Borek's approved reference library: examples of comparable work, not statements about your company."}
    own = observations + references
    before = len(slides)
    if len(own) == 1 and recommendation_rows and _fits_one_matrix(own + recommendation_rows):
        # A single observation or reference does not fill a page: it opens the recommendation page.
        _matrix_slides(
            slides,
            own + recommendation_rows,
            kicker="From Borek · Not client statements",
            title="What we add and where we would start",
            lead=(
                f"Our own {'observation' if observations else 'reference'} and opportunities from the approved Discovery analysis. "
                "Figures are industry benchmarks, not commitments."
            ),
            notes=[observation_note if observations else reference_note, {"title": "Why these starting points", "text": _evidence_sentence(evidence)}],
            purpose="Borek's own observation or reference and the recommended starting points",
        )
    else:
        if observations and references and _fits_one_matrix(own):
            _matrix_slides(
                slides,
                own,
                kicker="From Borek · Not client statements",
                title="What we add from our side",
                lead=f"Our own observations after the meeting and approved Borek references. None of this was said by {named}.",
                notes=[observation_note, reference_note],
                purpose="Owner observations and selected approved Borek use cases",
            )
        else:
            _matrix_slides(
                slides,
                observations,
                kicker="Our observations · Not client statements",
                title="What we noted for ourselves",
                lead=f"Observations by the Borek team after the meeting. They are our reading, not statements by {named}.",
                notes=[observation_note, {"title": "Not from the transcript", "text": "None of these points was said in this form during the meeting."}],
                purpose="Owner observations from the personal notes",
            )
            _matrix_slides(
                slides,
                references,
                kicker="Borek references · Not client statements",
                title="Borek references that fit what we heard",
                lead="Approved Borek reference use cases selected for this conversation.",
                notes=[reference_note, {"title": "How we use them", "text": "As examples of how comparable work was delivered, to be checked against your situation."}],
                purpose="Selected approved Borek use cases",
            )
        before = len(slides)
        _matrix_slides(
            slides,
            recommendation_rows,
            kicker="Borek recommendation",
            title="Where we would start, given what we heard",
            lead="Opportunities from the approved Discovery analysis that relate to points you raised in the meeting.",
            notes=[
                {"title": "Why these", "text": _evidence_sentence(evidence) if evidence else ""},
                {"title": "Benchmarks, not commitments", "text": BENCHMARK_NOTE},
            ],
            purpose="Recommended starting points in light of the meeting",
        )
    # A page with recommendations cites the client statements they rest on.
    for index in range(before, len(slides)):
        layout_id, purpose, content, cited = slides[index]
        if any(row["code"].startswith("A") for row in content["rows"]):
            slides[index] = (layout_id, purpose, content, cited + evidence)

    # What was decided, what follows, and what is still open. Open questions are the Discovery
    # analysis' own questions for the opportunities that relate to the meeting - full questions,
    # never a bare topic label.
    closing_rows = _finding_rows(findings, ("decisions", "follow_ups"), CLIENT_SOURCES, omitted)
    questions: list[dict[str, str]] = []
    for match in matches:
        question = next(
            (q for q in match["item"]["discovery_questions"] if str(q).strip().endswith("?") and len(str(q).split()) >= 5),
            None,
        )
        row = {
            "code": f"Q{len(questions) + 1}",
            "title": "Open question",
            "text": str(question or ""),
            "reference": f"discovery.opportunity:{match['area']['id']}/{match['item']['id']}",
        }
        if question and row["text"] not in [entry["text"] for entry in questions] and _row_height(row) <= _MATRIX_BOTTOM - _MATRIX_TOP:
            questions.append(row)
        if len(questions) == MAX_OPEN_QUESTIONS:
            break
    closing_notes = [{"title": "Decisions and follow-ups", "text": "Taken word for word from the transcript of our first conversation."}]
    closing_notes.append(
        {"title": "Open questions", "text": "Questions from the approved Discovery analysis for the topics you raised. We would like to clarify them with you."}
        if questions
        else {"title": "Please correct us", "text": "If a decision or follow-up is missing or wrong, tell us. We will update this page."}
    )
    _matrix_slides(
        slides,
        closing_rows + questions,
        kicker="Decisions · Next steps · Open questions" if questions else "From the meeting · Decisions and next steps",
        title="What was agreed and what is still open" if questions else "What was agreed",
        lead=(
            "Decisions and follow-ups come from the meeting. Open questions come from the Discovery analysis."
            if closing_rows and questions
            else "Open questions from the Discovery analysis for the topics you raised."
            if questions
            else "Decisions and follow-ups as they were stated in our first meeting."
        ),
        notes=closing_notes,
        purpose="Decisions, follow-ups and open questions",
    )

    # Proposed way forward: a Borek recommendation from the approved analysis.
    closing = analysis["closing"]
    decision = next((item for item in findings if item["category"] == "decisions" and item["source"] in CLIENT_SOURCES), None)
    statement = {"kicker": "Borek recommendation", "text": closing["headline"]}
    references_for_closing = ["discovery.closing"]
    if decision and _fits(decision["text"], 25, 500, 1776 - 72, 2):
        statement = {"kicker": "Decided in the meeting", "text": decision["text"]}
        references_for_closing.append(_finding_reference(findings, decision))
    slides.append(
        (
            "L07",
            "Proposed approach for the next phase",
            {
                "kicker": "Borek recommendation · Next phase",
                "title": "How we suggest to continue",
                "lead": analysis["framing"]["leads"]["closing_steps"],
                "stages": [
                    {"number": f"{position:02d}", "title": step["title"], "text": _stage_text(step["text"])}
                    for position, step in enumerate(closing["steps"], start=1)
                ],
                "statement": statement,
            },
            references_for_closing,
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
    validate_v2_appendix(planned, snapshot, first_order=first_order, omitted=omitted)
    return planned


# ---------------------------------------------------------------------------------- building blocks


def _finding_reference(findings: list[dict[str, str]], finding: dict[str, str]) -> str:
    position = [item for item in findings if item["category"] == finding["category"]].index(finding)
    return f"finding:{finding['category']}:{position}"


def _row_height(row: dict[str, str]) -> float:
    """Height of one matrix row, exactly as the L08 layout computes it."""
    code_width = engine().bp.text_w(row["code"], 22, 600) + 16
    title_height = measured_height(row["title"], 22, 600, 360 - code_width - 12, 1.3)
    return 20 + max(title_height, measured_height(row["text"], 22, 400, 720, 1.3)) + 20


def _finding_rows(
    findings: list[dict[str, str]],
    categories: tuple[str, ...],
    sources: frozenset[str],
    omitted: list[str],
    *,
    prefix: str | None = None,
    title: str | None = None,
) -> list[dict[str, str]]:
    """Matrix rows for the confirmed findings of the given categories and sources, verbatim.

    A finding that cannot fit one slide on its own is left out and reported - it is never cut,
    because a shortened client statement is no longer the statement that was confirmed.
    """
    rows: list[dict[str, str]] = []
    for category in categories:
        position = 0
        for index, item in enumerate(entry for entry in findings if entry["category"] == category):
            if item["source"] not in sources:
                continue
            position += 1
            code = f"{prefix}{len(rows) + 1}" if prefix else f"{CATEGORY_CODE[category]}{position}"
            row = {"code": code, "title": title or CATEGORY_LABEL[category], "text": item["text"], "reference": f"finding:{category}:{index}"}
            if _row_height(row) > _MATRIX_BOTTOM - _MATRIX_TOP:
                omitted.append(row["reference"])
                continue
            rows.append(row)
    return rows


def _use_case_rows(snapshot: dict[str, Any], omitted: list[str]) -> list[dict[str, str]]:
    rows = []
    for item in snapshot["use_cases"]:
        row = {
            "code": f"B{len(rows) + 1}",
            "title": "Borek reference",
            "text": str(item["statement"]),
            "reference": f"use_case:{item['fact_id']}",
        }
        if _row_height(row) > _MATRIX_BOTTOM - _MATRIX_TOP:
            omitted.append(row["reference"])
            continue
        rows.append(row)
    return rows


def _matrix_slides(
    slides: list[tuple[str, str, dict[str, Any], list[str]]],
    rows: list[dict[str, str]],
    *,
    kicker: str,
    title: str,
    lead: str,
    notes: list[dict[str, str]],
    purpose: str,
) -> None:
    """Add as many matrix slides as the rows need: at most six rows and never past the content zone."""
    groups: list[list[dict[str, str]]] = []
    current: list[dict[str, str]] = []
    height = 0.0
    for row in rows:
        needed = _row_height(row) + (1 if current else 0)
        if current and (len(current) == 6 or _MATRIX_TOP + height + needed > _MATRIX_BOTTOM):
            groups.append(current)
            current, height, needed = [], 0.0, _row_height(row)
        current.append(row)
        height += needed
    if current:
        groups.append(current)
    for index, group in enumerate(groups):
        slides.append(
            (
                "L08",
                purpose,
                {
                    "kicker": kicker,
                    "title": _numbered(title, index, len(groups)),
                    "lead": lead,
                    "rows": [{"code": row["code"], "title": row["title"], "text": row["text"]} for row in group],
                    "notes": copy.deepcopy(notes),
                },
                [row["reference"] for row in group],
            )
        )


def _fits_one_matrix(rows: list[dict[str, str]]) -> bool:
    return len(rows) <= 6 and _MATRIX_TOP + sum(_row_height(row) for row in rows) + len(rows) - 1 <= _MATRIX_BOTTOM


def _keywords(text: str) -> set[str]:
    """Content words of a text, reduced to a simple stem so that "quotes" meets "quote"."""
    stems = set()
    for word in _WORD_RE.findall(text):
        word = word.lower()
        if word in _STOPWORDS:
            continue
        if word.endswith("ies") and len(word) > 5:
            word = word[:-3] + "y"
        elif word.endswith("s") and not word.endswith("ss") and len(word) > 4:
            word = word[:-1]
        for suffix in ("ing", "ed"):
            if word.endswith(suffix) and len(word) - len(suffix) >= 4:
                word = word[: -len(suffix)]
                break
        stems.add(word)
    return stems - _STOPWORDS


def _matching_opportunities(analysis: dict[str, Any], findings: list[dict[str, str]]) -> list[dict[str, Any]]:
    """Discovery opportunities clearly supported by what the client said, best supported first.

    Only client statements count: an owner observation never steers a recommendation. Every
    returned opportunity shares at least one subject word with the client's statements and is
    therefore related; it is recommended only with ``MIN_SHARED_TERMS`` or more (see
    ``_recommended``) - one shared word is a coincidence, not a reason. Each match names the
    statements it rests on, so a recommendation can show its evidence.
    """
    heard = [
        (reference, _keywords(item["text"]))
        for reference, item in ((_finding_reference(findings, item), item) for item in findings)
        if item["source"] in CLIENT_SOURCES
    ]
    scored = []
    for position, (area, item) in enumerate(_opportunity_pool(analysis)):
        words = _keywords(" ".join([item["title"], item["result"], item["opportunity_signal"]]))
        shared = set().union(*(terms & words for _reference, terms in heard), set())
        if not shared:
            continue
        evidence = [reference for reference, terms in heard if terms & words]
        scored.append((-len(shared), position, {"area": area, "item": item, "evidence": evidence, "shared_terms": sorted(shared)}))
    return [match for _score, _position, match in sorted(scored, key=lambda entry: entry[:2])]


def _recommended(matches: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The matches with enough support to be recommended, at most ``MAX_RECOMMENDATIONS``."""
    return [match for match in matches if len(match["shared_terms"]) >= MIN_SHARED_TERMS][:MAX_RECOMMENDATIONS]


def _evidence_sentence(references: list[str]) -> str:
    """Which kinds of client statements a recommendation rests on, in plain words."""
    names = {
        "requirements": "requirements",
        "challenges": "challenges",
        "priorities": "priorities",
        "opportunities": "opportunities",
        "discussed_solutions": "solutions we discussed",
        "decisions": "decisions",
        "follow_ups": "follow-ups",
    }
    kinds = [names[category] for category in CATEGORIES if any(reference.startswith(f"finding:{category}:") for reference in references)]
    listed = kinds[0] if len(kinds) == 1 else ", ".join(kinds[:-1]) + " and " + kinds[-1]
    return f"They relate to the {listed} you described in our first meeting. Whether they fit is for you to confirm."


# ---------------------------------------------------------------------------------- validation


def resolve_v2_reference(snapshot: dict[str, Any], reference: str) -> Any:
    """The part of the frozen snapshot a reference points at; ``None`` when it does not exist."""
    analysis = snapshot["approved_discovery"]["analysis"]
    kind, _, ref = reference.partition(":")
    if kind == "meeting_review":
        return snapshot["meeting_review"]
    if kind == "finding":
        category, _, position = ref.partition(":")
        items = snapshot["findings"].get(category, [])
        return items[int(position)] if position.isdigit() and int(position) < len(items) else None
    if kind == "use_case":
        return next((item for item in snapshot["use_cases"] if item["fact_id"] == ref), None)
    if kind == "discovery.closing":
        return analysis["closing"]
    if kind == "discovery.opportunity":
        area_id, _, opportunity_id = ref.partition("/")
        area = next((item for item in analysis["areas"] if item["id"] == area_id), None)
        return next((item for item in (area or {}).get("opportunities", []) if item["id"] == opportunity_id), None)
    return None


def shown_finding_references(slides: list[dict[str, Any]], snapshot: dict[str, Any]) -> set[str]:
    """References of the confirmed findings whose text is actually on a slide."""
    on_slides = {str(row.get("text")) for slide in slides for row in slide.get("content", {}).get("rows", [])}
    return {
        f"finding:{category}:{position}"
        for category in CATEGORIES
        for position, item in enumerate(snapshot["findings"].get(category, []))
        if str(item["text"]) in on_slides
    }


def validate_v2_appendix(
    slides: list[dict[str, Any]],
    snapshot: dict[str, Any],
    *,
    first_order: int,
    omitted: list[str] | None = None,
) -> None:
    """Planning contract, source integrity, provenance separation and layout rules."""
    problems: list[str] = []
    findings = confirmed_findings(snapshot)
    client_texts = {item["text"] for item in findings if item["source"] in CLIENT_SOURCES}
    owner_texts = {item["text"] for item in findings if item["source"] == OWNER_SOURCE}
    reference_texts = {str(item["statement"]) for item in snapshot["use_cases"]}
    excluded = {str(text) for text in snapshot.get("excluded_findings", [])} - {item["text"] for item in findings}
    source_numbers = set(
        _NUMBER_RE.findall(
            json.dumps(
                {
                    "findings": snapshot["findings"],
                    "use_cases": snapshot["use_cases"],
                    "analysis": snapshot["approved_discovery"]["analysis"],
                    "brief": snapshot["approved_discovery"]["presentation_brief"],
                    "client": snapshot.get("client_name"),
                },
                ensure_ascii=False,
            )
        )
    )
    used_references: set[str] = set()
    if not slides:
        problems.append("the appendix has no slides")
    for index, slide in enumerate(slides):
        where = f"appendix slide {index + 1}"
        missing = [key for key in ("order", "layout_id", "purpose", "content", "source_references") if key not in slide]
        if missing:
            problems.append(f"{where} lacks {', '.join(missing)}")
            continue
        layout_id = str(slide["layout_id"])
        if slide["order"] != first_order + index:
            problems.append(f"{where} has order {slide['order']}, expected {first_order + index}")
        if layout_id not in LAYOUT_IDS or layout_id not in implemented_layouts():
            problems.append(f"{where} uses '{layout_id}', which is not an implemented master layout")
            continue
        if slide["content"].get("layout") != layout_id:
            problems.append(f"{where}: content does not belong to layout {layout_id}")
        references = slide["source_references"]
        if not isinstance(references, list) or not references:
            problems.append(f"{where} cites no source in the frozen snapshot")
            references = []
        for reference in references:
            if resolve_v2_reference(snapshot, str(reference)) is None:
                problems.append(f"{where} cites '{reference}', which is not part of the frozen snapshot")
        used_references.update(str(reference) for reference in references)
        texts = _texts(slide["content"])
        if excluded & set(texts):
            problems.append(f"{where} uses a finding the owner excluded")
        invented = sorted({n for text in texts for n in _NUMBER_RE.findall(_COUNTER_RE.sub("", text))} - source_numbers)
        if invented:
            problems.append(f"{where} states figures that are not in the frozen sources: {', '.join(invented)}")
        # One kind of content per slide: an owner observation never sits on a client-statement page.
        kicker = str(slide["content"].get("kicker") or "")
        row_texts = {str(row.get("text")) for row in slide["content"].get("rows", [])}
        if kicker.startswith("From the meeting") and row_texts & (owner_texts - client_texts):
            problems.append(f"{where} presents an owner observation as a client statement")
        if kicker.startswith("Our observations") and row_texts - owner_texts:
            problems.append(f"{where} mixes other content into the owner observations")
        if "Not client statements" in kicker and row_texts & (client_texts - owner_texts - reference_texts):
            problems.append(f"{where} presents a client statement as Borek's own content")
        recommends = any(str(row.get("code", "")).startswith("A") for row in slide["content"].get("rows", []))
        if (kicker == "Borek recommendation" or recommends) and not any(str(reference).startswith("finding:") for reference in references):
            problems.append(f"{where} recommends without naming the client statements it rests on")
        for row in slide["content"].get("rows", []):
            if row.get("title") == "Open question" and (not str(row.get("text")).strip().endswith("?") or len(str(row.get("text")).split()) < 5):
                problems.append(f"{where} lists a topic label as an open question: '{row.get('text')}'")
    # Every confirmed finding is either shown or reported as omitted - none disappears silently.
    # "Shown" means its text is on a slide: being cited as evidence for a recommendation is not enough.
    shown = shown_finding_references(slides, snapshot)
    for category in CATEGORIES:
        for position, _item in enumerate(snapshot["findings"].get(category, [])):
            reference = f"finding:{category}:{position}"
            if reference not in shown and reference not in (omitted or []):
                problems.append(f"confirmed finding {reference} is neither shown nor reported as omitted")
    if not problems:
        problems.extend(layout_fit_problems(slides))
    if problems:
        raise AppendixPlanError("; ".join(problems))
