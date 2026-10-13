"""ES-2 — speaker-turn splitting for all four transcript formats."""

from __future__ import annotations

import io

import pytest
from docx import Document

from services.transcript.ingestion import TranscriptIngestionError
from services.transcript.speaker_turns import UNKNOWN_SPEAKER, split_speaker_turns


def _docx_bytes(*paragraphs: str) -> bytes:
    document = Document()
    for paragraph in paragraphs:
        document.add_paragraph(paragraph)
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def test_txt_one_entry_per_speaker_with_label() -> None:
    content = b"Sandra: Matching invoices is slow.\nArvanit: We can automate the clean cases."
    turns = split_speaker_turns("call.txt", content)
    assert [(t.turn_index, t.speaker, t.text) for t in turns] == [
        (0, "Sandra", "Matching invoices is slow."),
        (1, "Arvanit", "We can automate the clean cases."),
    ]


def test_txt_unlabeled_lines_continue_previous_turn() -> None:
    content = b"Sandra: First sentence.\nAnd a follow-up on the same turn.\nIT: Access is still open."
    turns = split_speaker_turns("call.txt", content)
    assert turns[0].speaker == "Sandra"
    assert turns[0].text == "First sentence. And a follow-up on the same turn."
    assert turns[1].speaker == "IT"
    assert turns[1].text == "Access is still open."


def test_txt_without_labels_uses_unknown_speaker() -> None:
    turns = split_speaker_turns("notes.txt", b"There is no speaker prefix here.")
    assert len(turns) == 1
    assert turns[0].speaker == UNKNOWN_SPEAKER
    assert turns[0].text == "There is no speaker prefix here."


def test_vtt_uses_voice_tag_as_speaker() -> None:
    raw = (
        "WEBVTT\n\n"
        "00:00:00.000 --> 00:00:02.000\n"
        "<v Sandra>Invoice matching is slow</v>\n\n"
        "00:00:02.000 --> 00:00:04.000\n"
        "<v Arvanit>We should automate it</v>\n"
    )
    turns = split_speaker_turns("call.vtt", raw.encode("utf-8"))
    assert [t.speaker for t in turns] == ["Sandra", "Arvanit"]
    assert turns[0].text == "Invoice matching is slow"
    assert turns[1].text == "We should automate it"


def test_vtt_without_voice_tag_uses_unknown() -> None:
    raw = b"WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello from VTT\n"
    turns = split_speaker_turns("call.vtt", raw)
    assert len(turns) == 1
    assert turns[0].speaker == UNKNOWN_SPEAKER
    assert turns[0].text == "Hello from VTT"


def test_srt_one_cue_per_turn_with_name_prefix() -> None:
    raw = (
        "1\n00:00:00,000 --> 00:00:02,000\nSandra: First line\n\n"
        "2\n00:00:02,000 --> 00:00:04,000\nArvanit: Second line\n"
    )
    turns = split_speaker_turns("call.srt", raw.encode("utf-8"))
    assert [(t.speaker, t.text) for t in turns] == [
        ("Sandra", "First line"),
        ("Arvanit", "Second line"),
    ]


def test_docx_splits_labeled_paragraphs() -> None:
    content = _docx_bytes("Sandra: From Word.", "Arvanit: Confirmed.")
    turns = split_speaker_turns("call.docx", content)
    assert [(t.speaker, t.text) for t in turns] == [
        ("Sandra", "From Word."),
        ("Arvanit", "Confirmed."),
    ]


def test_unsupported_format_still_rejected() -> None:
    with pytest.raises(TranscriptIngestionError) as exc_info:
        split_speaker_turns("notes.pdf", b"not a transcript")
    assert "Unsupported transcript format" in exc_info.value.user_message


# --- time stamps in front of the speaker, and finding labels (meeting transcript fix) ---


@pytest.mark.parametrize(
    "line",
    [
        "Daniel: Requirement: Reduce support response time",
        "[02:15] Daniel: Requirement: Reduce support response time",
        "00:02:15 Daniel: Requirement: Reduce support response time",
        "(02:15) Daniel: Requirement: Reduce support response time",
        "[00:02:15.500] - Daniel: Requirement: Reduce support response time",
        "02:15 \u2013 Daniel: Requirement: Reduce support response time",
    ],
)
def test_txt_time_stamp_in_front_of_the_speaker(line: str) -> None:
    turns = split_speaker_turns("call.txt", (line + "\nMira: Understood.").encode())
    assert [(t.speaker, t.text) for t in turns] == [
        ("Daniel", "Requirement: Reduce support response time"),
        ("Mira", "Understood."),
    ]


def test_txt_time_stamped_lines_are_separate_turns_not_one_block() -> None:
    content = (
        "[00:10] Daniel: Good morning.\n"
        "[00:25] Mira: Thanks for the time.\n"
        "[01:52] Daniel: Challenge: Reports are merged by hand.\n"
    ).encode()
    turns = split_speaker_turns("call.txt", content)
    assert [(t.turn_index, t.speaker, t.text) for t in turns] == [
        (0, "Daniel", "Good morning."),
        (1, "Mira", "Thanks for the time."),
        (2, "Daniel", "Challenge: Reports are merged by hand."),
    ]


def test_txt_multiline_turn_keeps_every_line_and_the_speaker() -> None:
    content = (
        "[02:15] Daniel: Requirement: Reports must be ready\n"
        "within one working day,\n"
        "including weekends.\n"
        "[02:40] Mira: Noted.\n"
    ).encode()
    turns = split_speaker_turns("call.txt", content)
    assert [(t.speaker, t.text) for t in turns] == [
        ("Daniel", "Requirement: Reports must be ready within one working day, including weekends."),
        ("Mira", "Noted."),
    ]


def test_txt_a_time_that_is_part_of_the_sentence_is_kept() -> None:
    content = b"Daniel: When shall we meet?\n10:30 works for me.\nAt 14:00 I have another call."
    turns = split_speaker_turns("call.txt", content)
    assert len(turns) == 1 and turns[0].speaker == "Daniel"
    assert turns[0].text == "When shall we meet? 10:30 works for me. At 14:00 I have another call."


def test_txt_a_finding_label_is_a_statement_of_the_current_speaker_not_a_speaker() -> None:
    content = (
        "Daniel: Let me summarise.\n"
        "Decision: Run a pilot with five reports.\n"
        "[03:10] Follow-up: Mira sends two samples.\n"
        "Mira: Agreed.\n"
    ).encode()
    turns = split_speaker_turns("call.txt", content)
    assert [(t.speaker, t.text) for t in turns] == [
        ("Daniel", "Let me summarise."),
        ("Daniel", "Decision: Run a pilot with five reports."),
        ("Daniel", "Follow-up: Mira sends two samples."),
        ("Mira", "Agreed."),
    ]
    alone = split_speaker_turns("notes.txt", b"Requirement: One login for all tools.")
    assert [(t.speaker, t.text) for t in alone] == [(UNKNOWN_SPEAKER, "Requirement: One login for all tools.")]


def test_docx_time_stamped_paragraphs() -> None:
    content = _docx_bytes("[00:05] Daniel: Priority: Start with the sales team.", "00:00:40 Mira: Fine.")
    turns = split_speaker_turns("call.docx", content)
    assert [(t.speaker, t.text) for t in turns] == [("Daniel", "Priority: Start with the sales team."), ("Mira", "Fine.")]


def test_caption_cues_keep_their_speaker_with_and_without_a_label() -> None:
    vtt = (
        "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n<v Daniel>Requirement: Reduce support response time\n\n"
        "00:00:05.000 --> 00:00:07.000\nMira: Decision: Start in May.\n"
    ).encode()
    assert [(t.speaker, t.text) for t in split_speaker_turns("call.vtt", vtt)] == [
        ("Daniel", "Requirement: Reduce support response time"),
        ("Mira", "Decision: Start in May."),
    ]
    srt = b"1\n00:00:01,000 --> 00:00:04,000\nDaniel: Challenge: Data sits in three tools.\n"
    assert [(t.speaker, t.text) for t in split_speaker_turns("call.srt", srt)] == [("Daniel", "Challenge: Data sits in three tools.")]
