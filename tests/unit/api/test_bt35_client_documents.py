"""BT-35 client document upload, First contact gating, and Deepening compatibility."""

from __future__ import annotations

import io
import uuid
from uuid import UUID, uuid4

import pytest
from docx import Document
from fastapi.testclient import TestClient
from app.auth import create_test_access_token
from app.config import settings
from app.main import create_app
from app.services.data.memory_store import get_memory_store
from services.framework.client_documents import format_client_documents_for_prompt

OWNER = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
OTHER = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")


def headers(owner: UUID = OWNER) -> dict[str, str]:
    return {
        "Authorization": "Bearer "
        + create_test_access_token(
            user_id=owner,
            email="sales@example.com",
            secret=settings.SUPABASE_JWT_SECRET,
        )
    }


def create_opportunity(client: TestClient) -> str:
    response = client.post(
        "/opportunities",
        headers=headers(),
        json={
            "client_name": "Acme",
            "opportunity_name": "Invoice Automation",
            "department": "Finance",
            "stage1_intake": {
                "sales_topic_description": "Invoice matching automation",
                "about_company": "Regional equipment distributor.",
            },
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


def upload_client_document(
    client: TestClient,
    opportunity_id: str,
    *,
    filename: str,
    content: bytes,
    mime_type: str,
) -> dict:
    response = client.post(
        f"/opportunities/{opportunity_id}/client-documents",
        headers=headers(),
        files={"file": (filename, io.BytesIO(content), mime_type)},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _docx_bytes(text: str) -> bytes:
    buffer = io.BytesIO()
    document = Document()
    document.add_paragraph(text)
    document.save(buffer)
    return buffer.getvalue()


def test_upload_txt_and_docx_extract_text() -> None:
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client)

    txt = upload_client_document(
        client,
        opportunity_id,
        filename="brief.txt",
        content=b"Client brief paragraph one.\nClient brief paragraph two.",
        mime_type="text/plain",
    )
    assert txt["document"]["document_key"] == "D1"
    assert txt["processing_status"] == "processed"
    assert txt["document"]["section_count"] == 2

    docx = upload_client_document(
        client,
        opportunity_id,
        filename="profile.docx",
        content=_docx_bytes("Company profile from Word."),
        mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    assert docx["document"]["document_key"] == "D2"
    assert docx["document"]["section_count"] == 1

    listed = client.get(
        f"/opportunities/{opportunity_id}/client-documents",
        headers=headers(),
    )
    assert listed.status_code == 200
    assert len(listed.json()) == 2
    assert "storage_path" not in listed.json()[0]


def test_rejects_unsupported_format_and_empty_file() -> None:
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client)

    bad = client.post(
        f"/opportunities/{opportunity_id}/client-documents",
        headers=headers(),
        files={"file": ("notes.vtt", io.BytesIO(b"WEBVTT"), "text/vtt")},
    )
    assert bad.status_code == 400
    assert bad.json()["error"]["code"] == "INVALID_CLIENT_DOCUMENT_FORMAT"

    empty = client.post(
        f"/opportunities/{opportunity_id}/client-documents",
        headers=headers(),
        files={"file": ("empty.txt", io.BytesIO(b""), "text/plain")},
    )
    assert empty.status_code == 400
    assert empty.json()["error"]["code"] == "INVALID_CLIENT_DOCUMENT_CONTENT"


def test_authorization_and_opportunity_association() -> None:
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client)
    upload = upload_client_document(
        client,
        opportunity_id,
        filename="brief.txt",
        content=b"Authorized upload.",
        mime_type="text/plain",
    )
    document_id = upload["document"]["id"]

    forbidden = client.get(
        f"/opportunities/{opportunity_id}/client-documents/{document_id}",
        headers=headers(OTHER),
    )
    assert forbidden.status_code == 404

    detail = client.get(
        f"/opportunities/{opportunity_id}/client-documents/{document_id}",
        headers=headers(),
    )
    assert detail.status_code == 200
    assert detail.json()["opportunity_id"] == opportunity_id

    delete = client.delete(
        f"/opportunities/{opportunity_id}/client-documents/{document_id}",
        headers=headers(),
    )
    assert delete.status_code == 204


def test_first_contact_research_accepts_about_company_and_rejects_transcript_only() -> None:
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client)

    about_company = client.post(
        f"/opportunities/{opportunity_id}/stage1-research",
        headers=headers(),
    )
    assert about_company.status_code == 200

    no_source = client.post(
        "/opportunities",
        headers=headers(),
        json={
            "client_name": "Transcript Only",
            "opportunity_name": "Invalid First Contact",
            "department": "Finance",
        },
    )
    transcript_only_opportunity_id = no_source.json()["id"]

    transcript_only = client.post(
        f"/opportunities/{transcript_only_opportunity_id}/transcripts",
        headers=headers(),
        files={"file": ("meeting.txt", io.BytesIO(b"Speaker 1: hello"), "text/plain")},
    )
    assert transcript_only.status_code == 201

    blocked = client.post(
        f"/opportunities/{transcript_only_opportunity_id}/stage1-research",
        headers=headers(),
    )
    assert blocked.status_code == 400
    assert blocked.json()["error"]["code"] == "TRANSCRIPT_NOT_ALLOWED_FOR_FIRST_CONTACT"

    upload_client_document(
        client,
        transcript_only_opportunity_id,
        filename="brief.txt",
        content=b"Client provided annual revenue guidance in the brief.",
        mime_type="text/plain",
    )
    research = client.post(
        f"/opportunities/{transcript_only_opportunity_id}/stage1-research",
        headers=headers(),
    )
    assert research.status_code == 200
    payload = research.json()
    assert payload["user_statements"]["client_documents"][0]["document_key"] == "D1"
    assert "annual revenue guidance" in format_client_documents_for_prompt(
        get_memory_store().list_client_document_sources(
            opportunity_id=UUID(transcript_only_opportunity_id),
            user_id=OWNER,
        )
    )


def test_transcript_only_first_contact_framework_generate_is_rejected() -> None:
    client = TestClient(create_app())
    opportunity_id = create_opportunity(client)
    client.post(
        f"/opportunities/{opportunity_id}/transcripts",
        headers=headers(),
        files={"file": ("meeting.txt", io.BytesIO(b"Speaker 1: hello"), "text/plain")},
    )
    response = client.post(
        f"/opportunities/{opportunity_id}/framework/generate",
        headers=headers(),
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "TRANSCRIPT_NOT_ALLOWED_FOR_FIRST_CONTACT"


def test_deepening_requires_transcript_after_first_contact_completed() -> None:
    from tests.unit.api.test_bt31_stage_prerequisites import (
        _create_opportunity as create_stage_opportunity,
        _generate_stage,
        _headers as stage_headers,
    )

    client = TestClient(create_app())
    opportunity_id = create_stage_opportunity(client)
    upload_client_document(
        client,
        opportunity_id,
        filename="brief.txt",
        content=b"First contact client brief.",
        mime_type="text/plain",
    )
    _generate_stage(client, opportunity_id, "first_contact")

    blocked = client.post(
        f"/opportunities/{opportunity_id}/framework/generate",
        headers=stage_headers(),
    )
    assert blocked.status_code == 400
    assert blocked.json()["error"]["code"] == "TRANSCRIPT_REQUIRED"
