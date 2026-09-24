"""ES-1 — transcript upload validation and normalization."""

from __future__ import annotations

import io
from pathlib import Path

import pytest
from docx import Document

from services.transcript.ingestion import (
    ALLOWED_TRANSCRIPT_EXTENSIONS,
    TranscriptIngestionError,
    ingest_transcript,
)

_MINIMAL_PDF = b"""%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 45>>stream
BT /F1 12 Tf 20 180 Td (Speaker A: Hello from PDF.) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000267 00000 n
0000000361 00000 n
trailer<</Size 6/Root 1 0 R>>
startxref
422
%%EOF"""


def _docx_bytes(*paragraphs: str) -> bytes:
    document = Document()
    for paragraph in paragraphs:
        document.add_paragraph(paragraph)
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def test_allowed_extensions_match_ticket() -> None:
    assert ALLOWED_TRANSCRIPT_EXTENSIONS == {".txt", ".vtt", ".srt", ".docx", ".pdf"}


@pytest.mark.parametrize(
    ("filename", "content"),
    [
        ("meeting.txt", b"Speaker A: Hello.\nSpeaker B: Hi."),
        (
            "meeting.vtt",
            b"WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello from VTT\n",
        ),
        (
            "meeting.srt",
            b"1\n00:00:00,000 --> 00:00:02,000\nHello from SRT\n",
        ),
    ],
)
def test_accepted_text_formats_normalize(filename: str, content: bytes) -> None:
    result = ingest_transcript(filename, content)
    assert result.extension == Path(filename).suffix.lower()
    assert result.normalized_text
    assert "-->" not in result.normalized_text
    assert "WEBVTT" not in result.normalized_text


def test_accepted_docx_normalizes() -> None:
    result = ingest_transcript("meeting.docx", _docx_bytes("Hello from DOCX"))
    assert result.extension == ".docx"
    assert result.normalized_text == "Hello from DOCX"


def test_accepted_pdf_normalizes() -> None:
    result = ingest_transcript("meeting.pdf", _MINIMAL_PDF)
    assert result.extension == ".pdf"
    assert result.normalized_text == "Speaker A: Hello from PDF."


def test_txt_preserves_body() -> None:
    result = ingest_transcript("notes.TXT", b"Line one\nLine two")
    assert result.filename == "notes.TXT"
    assert result.extension == ".txt"
    assert result.normalized_text == "Line one\nLine two"


def test_vtt_strips_cues_and_tags() -> None:
    raw = (
        "WEBVTT\n\n"
        "1\n"
        "00:00:01.000 --> 00:00:03.000\n"
        "<v Sandra>Invoice matching is slow</v>\n"
    )
    result = ingest_transcript("call.vtt", raw.encode("utf-8"))
    assert result.normalized_text == "Invoice matching is slow"


def test_srt_strips_index_and_timestamps() -> None:
    raw = "1\n00:00:01,000 --> 00:00:03,000\nFirst line\n\n2\n00:00:03,000 --> 00:00:05,000\nSecond line\n"
    result = ingest_transcript("call.srt", raw.encode("utf-8"))
    assert result.normalized_text == "First line\nSecond line"


def test_docx_joins_paragraphs() -> None:
    result = ingest_transcript("call.docx", _docx_bytes("First paragraph", "Second paragraph"))
    assert result.normalized_text == "First paragraph\nSecond paragraph"


@pytest.mark.parametrize(
    "filename",
    ["audio.mp3", "notes.doc", "notes", "notes.TXT.exe"],
)
def test_unsupported_format_raises_user_facing_error(filename: str) -> None:
    with pytest.raises(TranscriptIngestionError) as exc_info:
        ingest_transcript(filename, b"not a transcript")
    message = exc_info.value.user_message
    assert "Unsupported transcript format" in message
    assert ".txt" in message
    assert ".vtt" in message
    assert ".srt" in message
    assert ".docx" in message
    assert ".pdf" in message


def test_empty_file_is_rejected() -> None:
    with pytest.raises(TranscriptIngestionError) as exc_info:
        ingest_transcript("empty.txt", b"")
    assert "empty" in exc_info.value.user_message.lower()


def test_missing_filename_is_rejected() -> None:
    with pytest.raises(TranscriptIngestionError) as exc_info:
        ingest_transcript("   ", b"hello")
    assert ".txt" in exc_info.value.user_message
    assert ".pdf" in exc_info.value.user_message


def test_corrupt_docx_is_rejected() -> None:
    with pytest.raises(TranscriptIngestionError) as exc_info:
        ingest_transcript("broken.docx", b"this is not a zip")
    assert "could not be read" in exc_info.value.user_message.lower()


def test_corrupt_pdf_is_rejected() -> None:
    with pytest.raises(TranscriptIngestionError) as exc_info:
        ingest_transcript("broken.pdf", b"this is not a pdf")
    assert exc_info.value.user_message == (
        "The .pdf file could not be read. Export it again and retry."
    )
