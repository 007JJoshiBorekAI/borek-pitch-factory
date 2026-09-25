"""Master prompt and German discussion-paper structure for PPT generation."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

MASTER_PROMPT_PATH = (
    Path(__file__).resolve().parents[2]
    / "llm"
    / "claude"
    / "prompts"
    / "opportunity_analysis_master_v1.txt"
)

# Which discussion-paper part each registered layout must carry.
LAYOUT_SECTIONS: dict[str, str] = {
    "COVER_01": (
        "Cover of the discussion paper. The title is the AI opportunity analysis "
        "for this customer. The subtitle says this is a discussion basis: map, "
        "business case, and the questions for the meeting. Stat badges stay "
        "grounded labels or counts already present in the chapter."
    ),
    "EXECUTIVE_SUMMARY_01": (
        "Part 1 opener. The headline is the core thesis: where margin or the "
        "bottleneck arises. Highlights are the short version: areas and "
        "opportunities the chapters actually name, that each opportunity carries "
        "a discovery question and a signal, and that impact figures are "
        "benchmarks rather than commitments."
    ),
    "CONTEXT_01": (
        "Part 1 situation. Problem and current state are the work that still "
        "runs on experience, Excel, mail, and hand-offs. Solution and target "
        "state are the assistance layer and semi-autonomy, with people at the "
        "decision gates."
    ),
    "SCOPE_01": (
        "Part 1 opportunity map. Included items are the concrete opportunities "
        "along the value chain. Later items are only those the chapters "
        "explicitly defer. Do not invent opportunities to fill a quota."
    ),
    "PROBLEM_SOLUTION_01": (
        "Part 2 deep dive. The problem is the current manual or shadow step. "
        "The solution names the AI technology and how it works: data in, a draft "
        "or decision, exceptions to a person with context, and the result. Do "
        "not add a capability the chapters do not state."
    ),
    "REQUIREMENTS_MATRIX_01": (
        "Part 2 discovery questions and opportunity signals. Each item is a "
        "question the meeting should ask, or an 'Opportunity if' signal taken "
        "from the chapters. Included means the source treats it as in play; "
        "later means it is not yet a pilot candidate."
    ),
    "PROCESS_FLOW_01": (
        "Part 4 workflow chain, and only when the chapters describe a real "
        "ordered flow. Steps interlock so the output of one is the input of the "
        "next, and a human decision gate is visible. Omit invention of phases."
    ),
    "ARCHITECTURE_01": (
        "Part 4 and the manual edges of existing systems. Components are an "
        "assistance layer on systems the chapters already name: data in, a "
        "draft, a human gate. Do not propose replacing the system."
    ),
    "COMPLIANCE_01": (
        "Human control from the discussion paper. Negotiation, release, and "
        "exceptions stay with people; AI prepares. Include knowledge "
        "preservation only when the chapter states it. Do not invent guardrails."
    ),
    "TIMELINE_01": (
        "Closing roadmap from the chapters: baseline workshop, then pilot, then "
        "scaling. Maturity levels (assist, semi-autonomous, autonomous) may "
        "appear as phases only when chapter 10 states them."
    ),
    "MILESTONES_01": (
        "Closing milestones: baseline workshop, pilot, and the scaling roadmap. "
        "Use only checkpoints the chapter already gives."
    ),
    "TEAM_FTE_01": (
        "Part 5 roles. Each role is the process world today, the routine AI "
        "takes over, and what the time is freed up for. Relief, not replacement. "
        "Do not invent roles or headcount."
    ),
    "SUCCESS_METRICS_01": (
        "Part 1 operating outcomes the chapters already measure. Keep this slide "
        "non-commercial: no currency, pricing, ROI, payback, investment, cost, "
        "or savings. A quick-win versus strategic distinction is allowed only "
        "in those non-commercial words when the chapters support it."
    ),
    "OPEN_QUESTIONS_01": (
        "Discovery questions on one side and assumptions or opportunity signals "
        "on the other. These are the questions the meeting must answer. Do not "
        "invent questions."
    ),
    "NEXT_STEPS_01": (
        "Closing three-step approach: baseline workshop, pilot within weeks, "
        "scaling as a roadmap. The close invites marking two quick wins. Do not "
        "invent owners or dates."
    ),
}

_FRAMEWORK_CHAPTER_AIM = """
OPPORTUNITY ANALYSIS CHAPTER AIM (substance for the discussion-paper PPT; acceptance rules above still apply):
- Chapter 1 carries the core thesis and a short company profile drawn only from supplied knowledge.
- Chapter 2 carries the shadow processes: decisions that run on experience, Excel, mail, and shouted hand-offs.
- Chapter 3 carries measurable aims as ranges and working hypotheses, never false precision.
- Chapter 4 carries the to-be picture as interlocking workflow chains with a human decision gate on each chain.
- Chapter 5 carries how it works: data in, AI drafts or decides the routine, exceptions go to a person with context, plus discovery questions and an opportunity signal.
- Chapter 6 carries the AI technology as an assistance layer on existing systems. The ai_split list stays the only canonical used-for / not-used-for list.
- Chapter 7 carries what the customer must provide, including structured interviews where the source supports them.
- Chapter 8 carries human control: people keep negotiation, release, and exceptions.
- Chapter 9 carries the business case as industry-benchmark ranges. Missing payback stays an open item. Never a commitment.
- Chapter 10 carries the three-step close: baseline workshop, pilot, scaling roadmap.
- Chapter 11 carries open discovery questions and signals that are not yet answered.
- Chapter 12 carries the three maturity levels: assist, semi-autonomous, autonomous.
- Chapter 13 carries the next steps in that same three-step order.
""".strip()


@lru_cache(maxsize=1)
def load_opportunity_master_prompt() -> str:
    """Return the canonical opportunity-analysis master prompt."""
    try:
        text = MASTER_PROMPT_PATH.read_text(encoding="utf-8").strip()
    except OSError as exc:
        raise RuntimeError(
            f"Unable to load opportunity analysis master prompt from {MASTER_PROMPT_PATH}: {exc}"
        ) from exc
    if "Your AI Department. Delivered, not built." not in text:
        raise RuntimeError("Opportunity analysis master prompt is missing the Borek positioning line.")
    return text


def slide_writing_guidance(layout_id: str) -> str:
    """Prepend master-prompt and discussion-paper rules to one slide writer."""
    section = LAYOUT_SECTIONS.get(
        layout_id,
        "Write this slide as one part of the discussion-paper analysis. "
        "Use only the supplied chapters.",
    )
    return (
        f"{load_opportunity_master_prompt()}\n\n"
        f"THIS SLIDE ({layout_id}): {section}\n"
        "Confirmed framework chapters remain the only facts. "
        "Layout bans on commercial wording override the master prompt.\n\n"
    )


def framework_synthesis_master_block() -> str:
    """Append the master prompt to framework synthesis without dropping acceptance rules."""
    return (
        "\n\nOPPORTUNITY ANALYSIS MASTER PROMPT "
        "(governs the substance of the discussion basis; schema, checklist, and "
        "confirm-gate rules above still bind):\n"
        f"{load_opportunity_master_prompt()}\n\n"
        f"{_FRAMEWORK_CHAPTER_AIM}\n"
    )
