"""Generated and human-reviewed First Meeting details."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class FirstMeetingValues(BaseModel):
    model_config = ConfigDict(extra="forbid")

    meeting_date: str | None = Field(default=None, max_length=200)
    participants: list[str] = Field(default_factory=list, max_length=100)
    meeting_summary: str | None = Field(default=None, max_length=20_000)
    pain_points: list[str] = Field(default_factory=list, max_length=100)
    requirements: list[str] = Field(default_factory=list, max_length=100)
    questions_concerns: list[str] = Field(default_factory=list, max_length=100)
    business_opportunity: str | None = Field(default=None, max_length=20_000)
    proposed_solution: str | None = Field(default=None, max_length=20_000)
    relevant_borek_services: list[str] = Field(default_factory=list, max_length=100)
    estimated_scope: str | None = Field(default=None, max_length=20_000)
    expected_timeline: str | None = Field(default=None, max_length=2_000)
    estimated_budget: str | None = Field(default=None, max_length=2_000)
    decision_makers: list[str] = Field(default_factory=list, max_length=100)
    key_stakeholders: list[str] = Field(default_factory=list, max_length=100)
    primary_point_of_contact: str | None = Field(default=None, max_length=500)
    next_steps: list[str] = Field(default_factory=list, max_length=100)
    next_meeting_date: str | None = Field(default=None, max_length=200)
    action_items: list[str] = Field(default_factory=list, max_length=100)
    responsible_team_member: str | None = Field(default=None, max_length=500)


class FirstMeetingReviewRequest(FirstMeetingValues):
    pass


class FirstMeetingDetailsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["1.0"] = "1.0"
    opportunity_id: UUID
    status: Literal["not_generated", "generated", "reviewed"]
    generated: FirstMeetingValues | None = None
    reviewed: FirstMeetingValues | None = None
    effective: FirstMeetingValues | None = None
    transcript_id: UUID | None = None
    generated_by: UUID | None = None
    generated_at: datetime | None = None
    reviewed_by: UUID | None = None
    reviewed_at: datetime | None = None
    provenance: dict[str, Any] = Field(default_factory=dict)
