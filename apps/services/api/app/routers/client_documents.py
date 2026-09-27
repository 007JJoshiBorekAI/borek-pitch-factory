"""BT-35 client document routes for First contact."""

from __future__ import annotations

from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, UploadFile

from app.auth import get_current_user
from app.dependencies import AuthUserDep, DataStoreDep
from app.schemas.client_documents import ClientDocumentResponse, ClientDocumentUploadResponse
from app.services.audit import AuditAction, AuditObjectType, record_audit_event
from app.services.api_errors import bad_request
from app.services.client_document_upload import validate_client_document_upload
from services.document.document_keys import next_document_key
from services.document.ingestion import ClientDocumentIngestionError, ingest_client_document

router = APIRouter(dependencies=[Depends(get_current_user)])


def _to_response(row: dict) -> ClientDocumentResponse:
    return ClientDocumentResponse.model_validate(row)


@router.post(
    "/{opportunity_id}/client-documents",
    response_model=ClientDocumentUploadResponse,
    status_code=201,
)
async def upload_client_document(
    opportunity_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
    file: UploadFile = File(...),
) -> ClientDocumentUploadResponse:
    file_name = file.filename or "upload.txt"
    content = await file.read()
    validate_client_document_upload(file_name, file.content_type, content)
    try:
        ingestion = ingest_client_document(file_name, content)
    except ClientDocumentIngestionError as exc:
        raise bad_request("INVALID_CLIENT_DOCUMENT_CONTENT", exc.user_message) from exc

    store.get_opportunity(opportunity_id=opportunity_id, user_id=user.id)
    existing = store.list_client_documents(
        opportunity_id=opportunity_id,
        user_id=user.id,
        verify_owner=False,
    )
    document_key = next_document_key([str(row.get("document_key") or "") for row in existing])
    sections = [
        {
            "section_index": section.section_index,
            "content": section.content,
            "metadata": {"document_key": document_key},
        }
        for section in ingestion.sections
    ]
    storage_path = f"{opportunity_id}/{uuid4()}{Path(file_name).suffix.lower()}"
    row = store.create_client_document(
        opportunity_id=opportunity_id,
        user_id=user.id,
        file_name=file_name,
        mime_type=file.content_type or "application/octet-stream",
        storage_path=storage_path,
        document_key=document_key,
        content=content,
        sections=sections,
        processing_status="processed",
        verify_owner=False,
    )
    record_audit_event(
        store,
        actor_id=user.id,
        action=AuditAction.CLIENT_DOCUMENT_UPLOAD,
        object_type=AuditObjectType.CLIENT_DOCUMENT,
        object_id=row["id"],
        document_id=document_key,
    )
    document = _to_response(row)
    return ClientDocumentUploadResponse(
        document=document,
        processing_status=document.processing_status,
    )


@router.get(
    "/{opportunity_id}/client-documents",
    response_model=list[ClientDocumentResponse],
)
def list_client_documents(
    opportunity_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> list[ClientDocumentResponse]:
    rows = store.list_client_documents(opportunity_id=opportunity_id, user_id=user.id)
    return [_to_response(row) for row in rows]


@router.get(
    "/{opportunity_id}/client-documents/{document_id}",
    response_model=ClientDocumentResponse,
)
def get_client_document(
    opportunity_id: UUID,
    document_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> ClientDocumentResponse:
    row = store.get_client_document(
        opportunity_id=opportunity_id,
        document_id=document_id,
        user_id=user.id,
    )
    return _to_response(row)


@router.delete("/{opportunity_id}/client-documents/{document_id}", status_code=204)
def delete_client_document(
    opportunity_id: UUID,
    document_id: UUID,
    user: AuthUserDep,
    store: DataStoreDep,
) -> None:
    row = store.get_client_document(
        opportunity_id=opportunity_id,
        document_id=document_id,
        user_id=user.id,
    )
    store.delete_client_document(
        opportunity_id=opportunity_id,
        document_id=document_id,
        user_id=user.id,
    )
    record_audit_event(
        store,
        actor_id=user.id,
        action=AuditAction.CLIENT_DOCUMENT_DELETE,
        object_type=AuditObjectType.CLIENT_DOCUMENT,
        object_id=document_id,
        document_id=str(row.get("document_key") or document_id),
    )
