"""ES-1 — validate and normalize transcript uploads.

Accepts .txt / .vtt / .srt / .docx / .pdf and rejects every other format with a
user-facing error. Speaker-turn splitting is ES-2.
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass
from pathlib import Path

from docx import Document
from pypdf import PdfReader

ALLOWED_TRANSCRIPT_EXTENSIONS = frozenset({".txt", ".vtt", ".srt", ".docx", ".pdf"})

_SRT_INDEX_RE = re.compile(r"^\d+$")
_TIMESTAMP_RE = re.compile(
    r"^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}"
)
_HTML_TAG_RE = re.compile(r"</?[^>]+>")


class TranscriptIngestionError(ValueError):
    """Rejected upload. ``user_message`` is safe to return to the client."""

    def __init__(self, user_message: str) -> None:
        super().__init__(user_message)
        self.user_message = user_message


@dataclass(frozen=True, slots=True)
class TranscriptIngestionResult:
    filename: str
    extension: str
    normalized_text: str


def ingest_transcript(filename: str, content: bytes) -> TranscriptIngestionResult:
    if not filename or not filename.strip():
        raise TranscriptIngestionError(
            "Please upload a file named with one of these extensions: "
            ".txt, .vtt, .srt, .docx, or .pdf."
        )

    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_TRANSCRIPT_EXTENSIONS:
        displayed = extension if extension else "no extension"
        raise TranscriptIngestionError(
            f"Unsupported transcript format ({displayed}). "
            "Upload a .txt, .vtt, .srt, .docx, or .pdf file."
        )

    if not content:
        raise TranscriptIngestionError(
            "The uploaded file is empty. Export the transcript again and retry."
        )

    if extension == ".txt":
        text = _decode_text_bytes(content)
    elif extension == ".vtt":
        text = _normalize_vtt(_decode_text_bytes(content))
    elif extension == ".srt":
        text = _normalize_srt(_decode_text_bytes(content))
    elif extension == ".docx":
        text = _normalize_docx(content)
    else:
        text = _normalize_pdf(content)

    normalized = _collapse_blank_lines(text).strip()
    if not normalized:
        raise TranscriptIngestionError(
            "The file was read but contained no transcript text. "
            "Check the export and upload a .txt, .vtt, .srt, .docx, or .pdf file."
        )

    return TranscriptIngestionResult(
        filename=Path(filename).name,
        extension=extension,
        normalized_text=normalized,
    )


def _decode_text_bytes(content: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1252"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise TranscriptIngestionError(
        "The file is not valid text. Save it as UTF-8 .txt, .vtt, or .srt, "
        "or upload a .docx or .pdf file."
    )


def _normalize_vtt(raw: str) -> str:
    lines: list[str] = []
    for line in raw.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.upper().startswith("WEBVTT"):
            continue
        if stripped.upper().startswith("KIND:") or stripped.upper().startswith("LANGUAGE:"):
            continue
        if stripped.startswith("NOTE"):
            continue
        if _TIMESTAMP_RE.match(stripped):
            continue
        if _SRT_INDEX_RE.match(stripped):
            continue
        lines.append(_HTML_TAG_RE.sub("", stripped).strip())
    return "\n".join(line for line in lines if line)


def _normalize_srt(raw: str) -> str:
    lines: list[str] = []
    for line in raw.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        if _SRT_INDEX_RE.match(stripped):
            continue
        if _TIMESTAMP_RE.match(stripped):
            continue
        lines.append(_HTML_TAG_RE.sub("", stripped).strip())
    return "\n".join(line for line in lines if line)


def _normalize_docx(content: bytes) -> str:
    try:
        document = Document(io.BytesIO(content))
    except Exception:
        raise TranscriptIngestionError(
            "The .docx file could not be read. Export it again from Word and retry."
        ) from None

    paragraphs = [p.text.strip() for p in document.paragraphs if p.text and p.text.strip()]
    return "\n".join(paragraphs)


def _normalize_pdf(content: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(content))
        pages = [text for page in reader.pages if (text := (page.extract_text() or "").strip())]
    except Exception:
        raise TranscriptIngestionError(
            "The .pdf file could not be read. Export it again and retry."
        ) from None

    return "\n\n".join(pages)


def _collapse_blank_lines(text: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", text)
