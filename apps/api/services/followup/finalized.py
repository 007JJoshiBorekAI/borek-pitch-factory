"""Follow-up email from a finalized Master Presentation V2 package.

The email is written from the SAME frozen material the reviewed V2 was generated from: the
findings the owner confirmed, each with its source. Nothing is read from live state here and
nothing is added to it:

    client statements (source transcript or both)   may be reported as what the client said
    owner observations (source personal_notes)      are never written as client statements;
                                                    they are left out and flagged for review
    excluded findings                                are not in the snapshot's findings at all
    decisions                                        only confirmed "decisions" are called agreed
    discussed solutions / opportunities              are reported as discussed, never as agreed
    owners, dates, participants                      only what a confirmed finding states

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

RENDERER_VERSION = "followup-finalized:v1"
CLIENT_SOURCES = frozenset({"transcript", "both"})
OWNER_SOURCE = "personal_notes"
HEARD_CATEGORIES = ("requirements", "challenges", "priorities")
DISCUSSED_CATEGORIES = ("discussed_solutions", "opportunities")
WORD_CAPS = {"short": SHORT_CONTENT_WORD_CAP, "medium": MEDIUM_CONTENT_WORD_CAP, "extensive": EXTENSIVE_CONTENT_WORD_CAP}
LENGTHS = ("short", "medium", "extensive")

# Review flags. Each one names something the owner has to check before the email is confirmed.
FLAG_FIXTURE_EXTRACTION = "fixture_extraction"
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
    """The finalized package holds no confirmed client statement an email could report."""

    code = "FOLLOWUP_NO_CONFIRMED_CONTENT"


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
    heard = _texts(findings, HEARD_CATEGORIES, CLIENT_SOURCES)
    decisions = _texts(findings, ("decisions",), CLIENT_SOURCES)
    discussed = _texts(findings, DISCUSSED_CATEGORIES, CLIENT_SOURCES)
    by_category = {name: _texts(findings, (name,), CLIENT_SOURCES) for name in (*HEARD_CATEGORIES, *DISCUSSED_CATEGORIES)}
    actions = _texts(findings, ("follow_ups",), CLIENT_SOURCES)
    if not (heard or decisions or discussed or actions):
        raise NoConfirmedContent("The finalized package contains no confirmed statement from the meeting.")
    owner_only = _texts(findings, (*HEARD_CATEGORIES, *DISCUSSED_CATEGORIES, "decisions", "follow_ups"), frozenset({OWNER_SOURCE}))
    flags: list[str] = []
    if (snapshot.get("meeting_extraction") or {}).get("execution_mode") != "live":
        flags.append(FLAG_FIXTURE_EXTRACTION)
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


def _fit(statics: dict[str, Any], blocks: list[tuple[str, list[str]]], *, intro: str, cap: int) -> tuple[str, bool]:
    """Drop whole items, last block first, until the content fits the cap. Never cuts a sentence."""
    blocks = [(title, list(items)) for title, items in blocks]
    trimmed = False
    body = _body(statics, blocks, intro=intro)
    while followup_content_word_count(body) > cap:
        # The longest block gives way first so that every block keeps at least its first item.
        candidates = [index for index, (_title, items) in enumerate(blocks) if len(items) > 1]
        if not candidates:
            candidates = [index for index, (_title, items) in enumerate(blocks) if items]
            if len(candidates) <= 1:
                break
        index = max(candidates, key=lambda position: (len(blocks[position][1]), position))
        blocks[index][1].pop()
        trimmed = True
        body = _body(statics, blocks, intro=intro)
    return body, trimmed


def render_finalized_lengths(content: dict[str, Any], statics: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], list[str]]:
    """Three drafts from the same confirmed material: each longer one adds supported detail only.

    short      the first key points and next steps
    medium     what was heard, the decisions, what was also discussed, all next steps
    extensive  every confirmed client statement under its own heading (requirements, challenges,
               priorities), the decisions, discussed solutions and raised opportunities apart

    The extensive draft is longer only where the package holds more confirmed statements than the
    medium draft shows. With little material the two stay close; nothing is added to fill space.
    """
    heard, decisions, discussed = content["heard"], content["decisions"], content["discussed"]
    actions = [_action_line(text) for text in content["actions"]]
    plain = [_sentence(text) for text in heard]
    agreed = [_sentence(text) for text in decisions]
    talked = [_sentence(text) for text in discussed]
    grouped = {name: [_sentence(text) for text in items] for name, items in content["by_category"].items()}
    seen: set[str] = set()
    for name in (*HEARD_CATEGORIES, *DISCUSSED_CATEGORIES):  # a statement confirmed twice is listed once
        grouped[name] = [item for item in grouped[name] if not (item in seen or seen.add(item))]
    project = str(statics.get("project_name") or "").strip()
    subject = f"{project} — Follow-up to our meeting" if project else "Follow-up to our meeting"
    plans = {
        "short": (
            "thank you for your time in our meeting. Here is a short summary so that we work from the same picture.",
            [("Key points", (plain + agreed)[:3]), ("Next steps", actions[:5])],
        ),
        "medium": (
            "thank you for your time in our meeting. Below is a summary of what we heard and what we agreed, so that we all work from the same picture.",
            [("What we heard", plain[:5]), ("Decisions", agreed), ("Also discussed", talked[:3]), ("Next steps", actions)],
        ),
        "extensive": (
            "thank you for your time in our meeting. Below is the full summary of what we heard, what we agreed and what we discussed, so that we all work from the same picture.",
            [
                ("Your requirements", grouped["requirements"]),
                ("Challenges you described", grouped["challenges"]),
                ("Your priorities", grouped["priorities"]),
                ("Decisions", agreed),
                ("Discussed, not yet decided", grouped["discussed_solutions"]),
                ("Opportunities you raised", grouped["opportunities"]),
                ("Next steps", actions),
            ],
        ),
    }
    lengths: dict[str, dict[str, Any]] = {}
    flags = list(content["review_flags"])
    for name in LENGTHS:
        intro, blocks = plans[name]
        body, trimmed = _fit(statics, blocks, intro=intro, cap=WORD_CAPS[name])
        if trimmed and name == "extensive" and FLAG_CONTENT_TRIMMED not in flags:
            flags.append(FLAG_CONTENT_TRIMMED)
        lengths[name] = {"subject": subject, "body": body, "word_count": max(1, followup_content_word_count(body)), "edited": False}
    return lengths, flags
