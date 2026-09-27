"""BT-35 — validate and extract text from First contact client documents."""

from __future__ import annotations

import io
import re
from dataclasses import dataclass
from pathlib import Path

from docx import Document
from pypdf import PdfReader

ALLOWED_CLIENT_DOCUMENT_EXTENSIONS = frozenset({".pdf", ".docx", ".txt"})

MAX_CLIENT_DOCUMENT_BYTES = 10 * 1024 * 1024


class ClientDocumentIngestionError(ValueError):
    """Rejected upload. ``user_message`` is safe to return to the client."""

    def __init__(self, user_message: str) -> None:
        super().__init__(user_message)
        self.user_message = user_message


@dataclass(frozen=True, slots=True)
class ClientDocumentSection:
    section_index: int
    content: str


@dataclass(frozen=True, slots=True)
class ClientDocumentIngestionResult:
    filename: str
    extension: str
    sections: tuple[ClientDocumentSection, ...]


def ingest_client_document(filename: str, content: bytes) -> ClientDocumentIngestionResult:
    if not filename or not filename.strip():
        raise ClientDocumentIngestionError(
            "Please upload a file named with one of these extensions: .pdf, .docx, or .txt."
        )

    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_CLIENT_DOCUMENT_EXTENSIONS:
        displayed = extension if extension else "no extension"
        raise ClientDocumentIngestionError(
            f"Unsupported client document format ({displayed}). "
            "Upload a .pdf, .docx, or .txt file."
        )

    if not content:
        raise ClientDocumentIngestionError(
            "The uploaded file is empty. Export the document again and retry."
        )

    if len(content) > MAX_CLIENT_DOCUMENT_BYTES:
        raise ClientDocumentIngestionError(
            f"The file exceeds the {MAX_CLIENT_DOCUMENT_BYTES // (1024 * 1024)} MB limit."
        )

    if extension == ".txt":
        text = _decode_text_bytes(content)
    elif extension == ".docx":
        text = _normalize_docx(content)
    else:
        text = _normalize_pdf(content)

    normalized = _collapse_blank_lines(text).strip()
    if not normalized:
        raise ClientDocumentIngestionError(
            "The file was read but contained no extractable text. "
            "Check the export and upload a .pdf, .docx, or .txt file."
        )

    sections = _split_sections(normalized)
    return ClientDocumentIngestionResult(
        filename=Path(filename).name,
        extension=extension,
        sections=sections,
    )


def _split_sections(text: str) -> tuple[ClientDocumentSection, ...]:
    paragraphs = [line.strip() for line in text.split("\n") if line.strip()]
    if not paragraphs:
        raise ClientDocumentIngestionError(
            "The file was read but contained no extractable text."
        )
    return tuple(
        ClientDocumentSection(section_index=index, content=paragraph)
        for index, paragraph in enumerate(paragraphs)
    )


def _decode_text_bytes(content: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1252"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ClientDocumentIngestionError(
        "The file is not valid text. Save it as UTF-8 .txt or upload a .docx or .pdf file."
    )


def _normalize_docx(content: bytes) -> str:
    try:
        document = Document(io.BytesIO(content))
    except Exception:
        raise ClientDocumentIngestionError(
            "The .docx file could not be read. Export it again from Word and retry."
        ) from None

    paragraphs = [p.text.strip() for p in document.paragraphs if p.text and p.text.strip()]
    return "\n".join(paragraphs)


def _normalize_pdf(content: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(content))
    except Exception:
        raise ClientDocumentIngestionError(
            "The .pdf file could not be read. Export it again and retry."
        ) from None

    pages: list[str] = []
    for page in reader.pages:
        extracted = (page.extract_text() or "").strip()
        if extracted:
            pages.append(extracted)
    return "\n\n".join(pages)


def _collapse_blank_lines(text: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", text)
