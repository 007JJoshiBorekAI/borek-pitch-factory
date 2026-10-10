"""ES-2 — split a normalized transcript into speaker turns.

Each turn is one utterance with a speaker label. Caption formats (.vtt / .srt)
use one cue as one turn. Plain text (.txt / .docx) uses ``Name:`` prefixes;
unlabeled lines continue the previous turn.

Meeting tools often put the time in front of the speaker::

    [02:15] Daniel: Requirement: Reduce support response time
    00:02:15 Daniel: Requirement: Reduce support response time

A time stamp in front of a ``Name:`` prefix is read as the start of that speaker's turn and is
not part of what was said. A time at the start of a line that carries no speaker ("10:30 works
for me") is conversation and stays. A line that starts with a finding label instead of a name
("Decision: ...") is a new statement of the speaker who is talking, not a speaker called
"Decision".
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from services.transcript.ingestion import (
    TranscriptIngestionError,
    _decode_text_bytes,
    _HTML_TAG_RE,
    _SRT_INDEX_RE,
    _TIMESTAMP_RE,
    ingest_transcript,
)

UNKNOWN_SPEAKER = "unknown"

_VOICE_TAG_RE = re.compile(r"<v\s+([^>]+)>", re.IGNORECASE)
_SPEAKER_PREFIX_RE = re.compile(
    r"^(?P<speaker>[A-Za-z][A-Za-z0-9 .'\-_()]{0,80}):\s*(?P<text>.*)$"
)


# "[02:15]", "(00:02:15)", "00:02:15", "02:15.500", optionally followed by a dash.
_LEADING_TIMESTAMP_RE = re.compile(r"^\s*[\[(]?\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?[\])]?\s*(?:[-\u2013\u2014]\s*)?(?=\S)")
_LIST_BULLET_RE = re.compile(r"^\s*[-*\u2022]\s+")
# "At 14:00 I have a call": the colon belongs to a clock time, not to a speaker called "At 14".
_CLOCK_TIME_SPLIT_RE = re.compile(r"\d$")
# Labels that start a finding, not a speaker's turn.
_STATEMENT_LABELS = frozenset(
    {
        "requirement", "requirements", "challenge", "challenges", "priority", "priorities", "opportunity", "opportunities",
        "discussed solution", "discussed solutions", "decision", "decisions", "follow-up", "follow-ups", "follow up", "followup",
    }
)


def _speaker_prefix(line: str) -> re.Match[str] | None:
    """The ``Name:`` prefix of a line, with or without a time stamp in front of it."""
    prefix = _SPEAKER_PREFIX_RE.match(line)
    if prefix is None:
        without_time = _LEADING_TIMESTAMP_RE.sub("", line, count=1)
        if without_time != line:
            prefix = _SPEAKER_PREFIX_RE.match(without_time)
    if prefix is None:
        return None
    speaker = prefix.group("speaker").strip()
    if speaker.casefold() in _STATEMENT_LABELS:
        return None
    if _CLOCK_TIME_SPLIT_RE.search(speaker) and re.match(r"\d{2}(?!\d)", prefix.group("text")):
        return None
    return prefix


def _without_lead(line: str) -> str:
    """The line without a list bullet and a time stamp in front of it."""
    return _LEADING_TIMESTAMP_RE.sub("", _LIST_BULLET_RE.sub("", line, count=1), count=1)


def _is_statement_label(line: str) -> bool:
    label = _SPEAKER_PREFIX_RE.match(_without_lead(line))
    return label is not None and label.group("speaker").strip().casefold() in _STATEMENT_LABELS


@dataclass(frozen=True, slots=True)
class SpeakerTurn:
    turn_index: int
    speaker: str
    text: str


def split_speaker_turns(filename: str, content: bytes) -> list[SpeakerTurn]:
    ingested = ingest_transcript(filename, content)
    extension = ingested.extension

    if extension == ".vtt":
        raw_turns = _turns_from_cues(_decode_text_bytes(content), skip_webvtt_header=True)
    elif extension == ".srt":
        raw_turns = _turns_from_cues(_decode_text_bytes(content), skip_webvtt_header=False)
    else:
        raw_turns = _turns_from_plain_text(ingested.normalized_text)

    if not raw_turns:
        raise TranscriptIngestionError(
            "No speaker turns could be read from this transcript. "
            "Check the export and upload a .txt, .vtt, .srt, or .docx file."
        )

    return [
        SpeakerTurn(turn_index=index, speaker=speaker, text=text)
        for index, (speaker, text) in enumerate(raw_turns)
    ]


def _turns_from_cues(raw: str, *, skip_webvtt_header: bool) -> list[tuple[str, str]]:
    turns: list[tuple[str, str]] = []
    payload: list[str] = []
    in_payload = False

    for line in raw.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        stripped = line.strip()
        if skip_webvtt_header and stripped.upper().startswith("WEBVTT"):
            continue
        if stripped.upper().startswith("KIND:") or stripped.upper().startswith("LANGUAGE:"):
            continue
        if stripped.startswith("NOTE"):
            continue

        if not stripped:
            _flush_cue(turns, payload)
            payload = []
            in_payload = False
            continue

        if _TIMESTAMP_RE.match(stripped):
            _flush_cue(turns, payload)
            payload = []
            in_payload = True
            continue

        if not in_payload and _SRT_INDEX_RE.match(stripped):
            continue

        payload.append(stripped)
        in_payload = True

    _flush_cue(turns, payload)
    return turns


def _flush_cue(turns: list[tuple[str, str]], payload: list[str]) -> None:
    if not payload:
        return
    joined = " ".join(payload)
    speaker = UNKNOWN_SPEAKER
    voice = _VOICE_TAG_RE.search(joined)
    if voice:
        speaker = _clean_speaker(voice.group(1))
    plain = _HTML_TAG_RE.sub("", joined).strip()
    prefix = _speaker_prefix(plain)
    if prefix and prefix.group("text").strip():
        speaker = _clean_speaker(prefix.group("speaker"))
        plain = prefix.group("text").strip()
    if not plain:
        return
    turns.append((speaker, plain))


def _turns_from_plain_text(text: str) -> list[tuple[str, str]]:
    turns: list[tuple[str, str]] = []
    current_speaker = UNKNOWN_SPEAKER
    current_lines: list[str] = []

    def flush() -> None:
        nonlocal current_lines
        body = " ".join(part for part in current_lines if part).strip()
        if body:
            turns.append((current_speaker, body))
        current_lines = []

    for raw_line in text.split("\n"):
        line = raw_line.strip()
        if not line:
            continue
        prefix = _speaker_prefix(line)
        if prefix:
            flush()
            current_speaker = _clean_speaker(prefix.group("speaker"))
            remainder = prefix.group("text").strip()
            current_lines = [remainder] if remainder else []
        elif _is_statement_label(line):
            # "Decision: ..." on its own line: a new statement by the speaker who is talking.
            flush()
            current_lines = [_without_lead(line)]
        else:
            current_lines.append(line)

    flush()
    return turns


def _clean_speaker(label: str) -> str:
    cleaned = " ".join(label.replace("_", " ").split())
    return cleaned if cleaned else UNKNOWN_SPEAKER
