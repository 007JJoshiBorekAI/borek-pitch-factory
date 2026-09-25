"""Pitch ownership fields on opportunities (Supabase JSONB)."""

from __future__ import annotations

from typing import Any, Literal, TypedDict
from uuid import UUID


class PitchOwnerEmployee(TypedDict):
    source: Literal["employee"]
    employee_id: str


def employee_pitch_owner(user_id: UUID) -> PitchOwnerEmployee:
    return {"source": "employee", "employee_id": str(user_id)}


def parse_team_members(team_text: str | None) -> list[Any]:
    """Free-text team line → JSON array for team_members (array of labels)."""
    if not team_text or not team_text.strip():
        return []
    return [part.strip() for part in team_text.split(",") if part.strip()]


def user_can_access_opportunity(row: dict[str, Any], user_id: UUID) -> bool:
    """Match API ownership: row creator or employee pitch_owner."""
    created = row.get("created_by")
    if created is not None and str(created) == str(user_id):
        return True
    owner = row.get("pitch_owner")
    if isinstance(owner, dict) and owner.get("source") == "employee":
        return str(owner.get("employee_id") or "") == str(user_id)
    return False
