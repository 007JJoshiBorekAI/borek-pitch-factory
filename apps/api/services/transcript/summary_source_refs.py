"""BT-36 — validate TranscriptSummary source_refs against persisted turns."""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from services.transcript.conversation_ids import CONVERSATION_ID_RE

EXCERPT_POINTER_RE = re.compile(r"^turn:(\d+)$")


def parse_turn_index(excerpt_pointer: str) -> int | None:
    match = EXCERPT_POINTER_RE.fullmatch((excerpt_pointer or "").strip())
    if not match:
        return None
    return int(match.group(1))


@dataclass(frozen=True)
class SummarySourceRefViolation:
    path: str
    message: str


def collect_transcript_summary_source_ref_violations(
    summary: dict[str, Any],
    *,
    allowed_conversation_ids: Sequence[str],
    allowed_turn_indices: Sequence[int],
) -> list[SummarySourceRefViolation]:
    allowed_cids = frozenset(
        item.strip() for item in allowed_conversation_ids if item and str(item).strip()
    )
    allowed_turns = frozenset(int(item) for item in allowed_turn_indices)
    violations: list[SummarySourceRefViolation] = []

    for index, fact in enumerate(summary.get("meeting_facts") or []):
        violations.extend(
            _ref_list_issues(
                f"meeting_facts[{index}].source_refs",
                fact.get("source_refs"),
                allowed_cids=allowed_cids,
                allowed_turns=allowed_turns,
            )
        )
    for index, fact in enumerate(summary.get("decisions") or []):
        violations.extend(
            _ref_list_issues(
                f"decisions[{index}].source_refs",
                fact.get("source_refs"),
                allowed_cids=allowed_cids,
                allowed_turns=allowed_turns,
            )
        )
    for index, item in enumerate(summary.get("action_items") or []):
        violations.extend(
            _ref_list_issues(
                f"action_items[{index}].source_refs",
                item.get("source_refs"),
                allowed_cids=allowed_cids,
                allowed_turns=allowed_turns,
            )
        )
    for index, fact in enumerate(summary.get("open_questions") or []):
        violations.extend(
            _ref_list_issues(
                f"open_questions[{index}].source_refs",
                fact.get("source_refs"),
                allowed_cids=allowed_cids,
                allowed_turns=allowed_turns,
            )
        )
    for index, fact in enumerate(summary.get("requirements_and_constraints") or []):
        violations.extend(
            _ref_list_issues(
                f"requirements_and_constraints[{index}].source_refs",
                fact.get("source_refs"),
                allowed_cids=allowed_cids,
                allowed_turns=allowed_turns,
            )
        )
    return violations


def _ref_list_issues(
    path: str,
    refs: Any,
    *,
    allowed_cids: frozenset[str],
    allowed_turns: frozenset[int],
) -> list[SummarySourceRefViolation]:
    if not isinstance(refs, list):
        return [SummarySourceRefViolation(path, "source_refs must be an array.")]
    violations: list[SummarySourceRefViolation] = []
    for index, ref in enumerate(refs):
        loc = f"{path}[{index}]"
        if not isinstance(ref, dict):
            violations.append(SummarySourceRefViolation(loc, "Each source_ref must be an object."))
            continue
        cid = str(ref.get("conversation_id") or "").strip()
        speaker = str(ref.get("speaker_role") or "").strip()
        pointer = str(ref.get("excerpt_pointer") or "").strip()
        if not cid or not CONVERSATION_ID_RE.fullmatch(cid):
            violations.append(
                SummarySourceRefViolation(loc, f"conversation_id '{cid}' is invalid.")
            )
        elif cid not in allowed_cids:
            violations.append(
                SummarySourceRefViolation(
                    loc,
                    f"conversation_id '{cid}' does not match this transcript.",
                )
            )
        if not speaker:
            violations.append(SummarySourceRefViolation(loc, "speaker_role is required."))
        if not EXCERPT_POINTER_RE.fullmatch(pointer):
            violations.append(
                SummarySourceRefViolation(
                    loc,
                    f"excerpt_pointer '{pointer}' is invalid. Use turn:<index>.",
                )
            )
        else:
            turn_index = parse_turn_index(pointer)
            if turn_index is None or turn_index not in allowed_turns:
                violations.append(
                    SummarySourceRefViolation(
                        loc,
                        f"excerpt_pointer '{pointer}' does not match a turn in this transcript.",
                    )
                )
    return violations
