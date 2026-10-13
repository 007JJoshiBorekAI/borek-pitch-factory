"""Follow-up email from a finalized Master Presentation V2 package.

The email is written from the SAME frozen material the reviewed V2 was generated from: the
findings the owner confirmed, each with its source. Nothing is read from live state here and
nothing is added to it.

What a finding's source does and does not establish:

    source transcript / both   the statement was made IN THE MEETING. It does not say WHO made
                               it: a BOREK employee's suggestion is in the transcript as well.
                               The email therefore reports such statements neutrally, as points
                               noted in the meeting - never as "your requirement", "you said" or
                               "we agreed" - and the owner is asked to check who said what.
    source personal_notes      the owner's own observation. It is left out and flagged.
    excluded findings          are not in the snapshot's findings at all.
    owners, dates, people      only what a confirmed finding itself states.

A draft never exceeds its word cap. Statements are left out whole, never shortened; when not
even one statement fits a length, generation fails with ``ContentDoesNotFit``.

Pure functions: they read their arguments and return plain data.
"""

from __future__ import annotations

import re
from typing import Any

from services.followup.rendering import (
    EXTENSIVE_CONTENT_WORD_CAP,
    MEDIUM_CONTENT_WORD_CAP,
    SHORT_CONTENT_WORD_CAP,
    followup_content_word_count,
    greeting,
)

RENDERER_VERSION = "followup-finalized:v2"
# Said in the meeting. Not: said by the client (see the module text).
MEETING_SOURCES = frozenset({"transcript", "both"})
OWNER_SOURCE = "personal_notes"
HEARD_CATEGORIES = ("requirements", "challenges", "priorities")
DISCUSSED_CATEGORIES = ("discussed_solutions", "opportunities")
WORD_CAPS = {"short": SHORT_CONTENT_WORD_CAP, "medium": MEDIUM_CONTENT_WORD_CAP, "extensive": EXTENSIVE_CONTENT_WORD_CAP}
LENGTHS = ("short", "medium", "extensive")

# Review flags. Each one names something the owner has to check before the email is confirmed.
FLAG_FIXTURE_EXTRACTION = "fixture_extraction"
FLAG_SPEAKER_UNVERIFIED = "speaker_unverified"
FLAG_OWNER_NOTES_OMITTED = "owner_notes_omitted"
FLAG_ACTION_OWNER_UNCONFIRMED = "action_owner_unconfirmed"
FLAG_ACTION_DATE_UNCONFIRMED = "action_date_unconfirmed"
FLAG_MEETING_DATE_UNCONFIRMED = "meeting_date_unconfirmed"
FLAG_NO_NEXT_STEPS = "no_next_steps_confirmed"
FLAG_CONTENT_TRIMMED = "content_trimmed"

_DATE = re.compile(r"\b\d{1,2}\.\d{1,2}\.(?:\d{2}|\d{4})\b|\b\d{4}-\d{2}-\d{2}\b")
_DEADLINE = re.compile(
    r"\b(?:by|until|before|on|next|this)\s+(?:the\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month|end|"
    r"january|february|march|april|may|june|july|august|september|october|november|december|\d)|\b(?:tomorrow|today)\b",
    re.IGNORECASE,
)
# "Dana Weber will send ..." or "Borek: send ..." - an owner the finding itself states.
_OWNER = re.compile(r"^(?:[A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*){0,3})\s+(?:will|sends?|shares?|provides?|prepares?|schedules?)\b|^[A-Z][\w .'()/-]{1,60}:\s+\S")


class NoConfirmedContent(ValueError):
    """The finalized package holds no confirmed meeting statement an email could report."""

    code = "FOLLOWUP_NO_CONFIRMED_CONTENT"


class ContentDoesNotFit(ValueError):
    """Not even one confirmed statement fits a draft's word cap without being shortened."""

    code = "FOLLOWUP_CONTENT_TOO_LONG"


def _texts(findings: dict[str, Any], categories: tuple[str, ...], sources: frozenset[str]) -> list[str]:
    seen: list[str] = []
    for category in categories:
        for item in findings.get(category) or []:
            text = " ".join(str(item.get("text") or "").split())
            if text and item.get("source") in sources and text not in seen:
                seen.append(text)
    return seen


def _sentence(text: str) -> str:
    return text if text.endswith((".", "!", "?")) else f"{text}."


def has_deadline(text: str) -> bool:
    return bool(_DATE.search(text) or _DEADLINE.search(text))


def states_owner(text: str) -> bool:
    return bool(_OWNER.search(text))


def content_from_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    """What the email may say, taken from the frozen V2 sources, and what the owner must check."""
    findings = snapshot.get("findings") or {}
    heard = _texts(findings, HEARD_CATEGORIES, MEETING_SOURCES)
    decisions = _texts(findings, ("decisions",), MEETING_SOURCES)
    discussed = _texts(findings, DISCUSSED_CATEGORIES, MEETING_SOURCES)
    by_category = {name: _texts(findings, (name,), MEETING_SOURCES) for name in (*HEARD_CATEGORIES, *DISCUSSED_CATEGORIES)}
    actions = _texts(findings, ("follow_ups",), MEETING_SOURCES)
    if not (heard or decisions or discussed or actions):
        raise NoConfirmedContent("The finalized package contains no confirmed statement from the meeting.")
    owner_only = _texts(findings, (*HEARD_CATEGORIES, *DISCUSSED_CATEGORIES, "decisions", "follow_ups"), frozenset({OWNER_SOURCE}))
    flags: list[str] = []
    if (snapshot.get("meeting_extraction") or {}).get("execution_mode") != "live":
        flags.append(FLAG_FIXTURE_EXTRACTION)
    # The package records that a statement was made in the meeting, not who made it or who agreed.
    flags.append(FLAG_SPEAKER_UNVERIFIED)
    # No source in the package states the day of the meeting, so the email does not name one.
    flags.append(FLAG_MEETING_DATE_UNCONFIRMED)
    if owner_only:
        flags.append(FLAG_OWNER_NOTES_OMITTED)
    if not actions:
        flags.append(FLAG_NO_NEXT_STEPS)
    if any(not states_owner(text) for text in actions):
        flags.append(FLAG_ACTION_OWNER_UNCONFIRMED)
    if any(not has_deadline(text) for text in actions):
        flags.append(FLAG_ACTION_DATE_UNCONFIRMED)
    return {
        "heard": heard,
        "decisions": decisions,
        "discussed": discussed,
        "by_category": by_category,
        "actions": actions,
        "owner_only_count": len(owner_only),
        "review_flags": flags,
    }


def _action_line(text: str) -> str:
    line = _sentence(text)
    return line if has_deadline(text) else f"{line[:-1]} (date to be confirmed)."


def _body(statics: dict[str, Any], blocks: list[tuple[str, list[str]]], *, intro: str) -> str:
    lines = [greeting(statics), "", intro]
    for title, items in blocks:
        if items:
            lines.extend(["", title, *[f"- {item}" for item in items]])
    sender = statics.get("sender_profile") or {}
    lines.extend(
        [
            "",
            "If anything here does not match your understanding, just let me know and I will correct it.",
            "",
            "Best regards",
            str(sender.get("name") or "").strip(),
            f"{sender.get('role') or ''} - BOREK".strip(),
        ]
    )
    return "\n".join(lines)


def _fit(
    statics: dict[str, Any],
    plan: list[tuple[str, list[str], int | None]],
    *,
    intro: str,
    cap: int,
    name: str,
) -> tuple[str, bool]:
    """Leave out whole statements until the content fits the cap. Never shortens a statement.

    ``plan`` lists (heading, statements, how many of them this length shows at most).
    A statement that could not fit this length even on its own is left out first, so that it does
    not push shorter ones out. Then blocks with several statements give way, so every block keeps
    its first statement as long as possible; after that the longest remaining statement goes,
    then the next, until the draft fits. If nothing is left, no statement fits this length.
    """
    trimmed = False
    blocks: list[tuple[str, list[str]]] = []
    for title, items, limit in plan:
        alone = [item for item in items if followup_content_word_count(_body(statics, [(title, [item])], intro=intro)) <= cap]
        trimmed = trimmed or len(alone) < len(items)
        blocks.append((title, alone if limit is None else alone[:limit]))

    def words() -> int:
        return followup_content_word_count(_body(statics, blocks, intro=intro))

    while words() > cap:
        several = [index for index, (_title, items) in enumerate(blocks) if len(items) > 1]
        if several:
            index = max(several, key=lambda position: (len(blocks[position][1]), position))
            blocks[index][1].pop()
        else:
            single = [index for index, (_title, items) in enumerate(blocks) if items]
            if not single:
                break
            index = max(single, key=lambda position: (len(blocks[position][1][0].split()), position))
            blocks[index][1].clear()
        trimmed = True
    if words() > cap or not any(items for _title, items in blocks):
        raise ContentDoesNotFit(
            f"No confirmed statement fits the {name} draft ({cap} content words) without being shortened. "
            "A single confirmed finding is longer than this draft allows."
        )
    return _body(statics, blocks, intro=intro), trimmed


def render_finalized_lengths(content: dict[str, Any], statics: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], list[str]]:
    """Three drafts from the same confirmed material: each longer one adds supported detail only.

    short      the first points and next steps
    medium     the points from the meeting, the decisions noted, what was also discussed, all next steps
    extensive  every confirmed statement under its own heading (requirements, challenges,
               priorities), the decisions noted, discussed solutions and opportunities apart

    Wording is neutral about who said what: the headings name the kind of statement, not a
    speaker, and no sentence says that the client stated, required or agreed something.

    The extensive draft is longer only where the package holds more confirmed statements than the
    medium draft shows. With little material the two stay close; nothing is added to fill space.
    """
    heard, decisions, discussed = content["heard"], content["decisions"], content["discussed"]
    actions = [_action_line(text) for text in content["actions"]]
    plain = [_sentence(text) for text in heard]
    noted = [_sentence(text) for text in decisions]
    talked = [_sentence(text) for text in discussed]
    grouped = {name: [_sentence(text) for text in items] for name, items in content["by_category"].items()}
    seen: set[str] = set()
    for name in (*HEARD_CATEGORIES, *DISCUSSED_CATEGORIES):  # a statement confirmed twice is listed once
        grouped[name] = [item for item in grouped[name] if not (item in seen or seen.add(item))]
    project = str(statics.get("project_name") or "").strip()
    subject = f"{project} — Follow-up to our meeting" if project else "Follow-up to our meeting"
    plans = {
        "short": (
            "thank you for your time in our meeting. Here is a short summary of the points we noted, so that we work from the same picture.",
            [("Key points", plain + noted, 3), ("Next steps", actions, 5)],
        ),
        "medium": (
            "thank you for your time in our meeting. Below is a summary of the points and next steps we noted, so that we all work from the same picture.",
            [("Points from the meeting", plain, 5), ("Decisions noted", noted, None), ("Also discussed", talked, 3), ("Next steps", actions, None)],
        ),
        "extensive": (
            "thank you for your time in our meeting. Below is the full summary of the points, decisions and next steps we noted, so that we all work from the same picture.",
            [
                ("Requirements", grouped["requirements"], None),
                ("Challenges", grouped["challenges"], None),
                ("Priorities", grouped["priorities"], None),
                ("Decisions noted", noted, None),
                ("Discussed, not yet decided", grouped["discussed_solutions"], None),
                ("Opportunities mentioned", grouped["opportunities"], None),
                ("Next steps", actions, None),
            ],
        ),
    }
    lengths: dict[str, dict[str, Any]] = {}
    flags = list(content["review_flags"])
    for name in LENGTHS:
        intro, plan = plans[name]
        body, trimmed = _fit(statics, plan, intro=intro, cap=WORD_CAPS[name], name=name)
        if trimmed and name == "extensive" and FLAG_CONTENT_TRIMMED not in flags:
            flags.append(FLAG_CONTENT_TRIMMED)
        lengths[name] = {"subject": subject, "body": body, "word_count": max(1, followup_content_word_count(body)), "edited": False}
    return lengths, flags
