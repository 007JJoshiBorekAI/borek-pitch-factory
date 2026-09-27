"""Validation helpers for First contact client document uploads (BT-35)."""

from __future__ import annotations

from pathlib import Path

from app.services.api_errors import bad_request
from services.document.ingestion import (
    ALLOWED_CLIENT_DOCUMENT_EXTENSIONS,
    MAX_CLIENT_DOCUMENT_BYTES,
)

ALLOWED_CLIENT_DOCUMENT_MIME_TYPES = {
    "text/plain",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",
}


def validate_client_document_upload(
    file_name: str,
    mime_type: str | None,
    content: bytes,
) -> None:
    extension = Path(file_name).suffix.lower()
    if extension not in ALLOWED_CLIENT_DOCUMENT_EXTENSIONS:
        raise bad_request(
            "INVALID_CLIENT_DOCUMENT_FORMAT",
            f"Unsupported client document extension {extension or '(none)'}",
        )
    normalized_mime = (mime_type or "").lower().split(";", 1)[0].strip()
    if normalized_mime and normalized_mime not in ALLOWED_CLIENT_DOCUMENT_MIME_TYPES:
        raise bad_request(
            "INVALID_CLIENT_DOCUMENT_FORMAT",
            f"Unsupported client document mime type {mime_type}",
        )
    if not content:
        raise bad_request(
            "INVALID_CLIENT_DOCUMENT_CONTENT",
            "Client document cannot be empty",
        )
    if len(content) > MAX_CLIENT_DOCUMENT_BYTES:
        raise bad_request(
            "CLIENT_DOCUMENT_TOO_LARGE",
            f"Client document cannot exceed {MAX_CLIENT_DOCUMENT_BYTES} bytes",
        )
