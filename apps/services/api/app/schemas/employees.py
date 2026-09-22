"""Employee identity, roles, and activity log (D3)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

EmployeeRoleName = Literal["consultant", "reviewer", "releaser", "admin"]


class EmployeeMeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: UUID
    email: str
    role: EmployeeRoleName
    capabilities: dict[str, bool]


class EmployeeRoleResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: UUID
    email: str
    role: EmployeeRoleName


class AssignEmployeeRoleRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: EmployeeRoleName
    email: str | None = Field(default=None, max_length=320)


class ActivityLogEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    actor_id: UUID
    actor_email: str | None = None
    action: str
    object_type: str
    object_id: UUID
    document_id: str
    timestamp: datetime
