"""BT-35 client document API schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ClientDocumentResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    opportunity_id: UUID
    file_name: str
    mime_type: str
    document_key: str
    processing_status: str
    section_count: int = Field(ge=0)
    created_at: datetime


class ClientDocumentUploadResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    document: ClientDocumentResponse
    processing_status: str
