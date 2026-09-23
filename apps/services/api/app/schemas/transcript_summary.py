"""Transcript summary API schemas (BT-36)."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class TranscriptSummaryResponse(BaseModel):
    transcript_id: UUID
    opportunity_id: UUID
    conversation_id: str
    schema_version: str
    prompt_version: str
    processing_status: str
    summary: dict[str, Any] = Field(description="Validated TranscriptSummary payload.")
    generation_job_id: UUID | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
