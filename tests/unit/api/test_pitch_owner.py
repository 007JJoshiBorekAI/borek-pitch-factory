"""Pitch ownership JSON for opportunity create."""

from __future__ import annotations

import uuid

from app.services.pitch_owner import employee_pitch_owner, parse_team_members

USER = uuid.UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")


def test_employee_pitch_owner_shape() -> None:
    assert employee_pitch_owner(USER) == {
        "source": "employee",
        "employee_id": str(USER),
    }


def test_parse_team_members() -> None:
    assert parse_team_members("") == []
    assert parse_team_members("Jonas Richter, AI delivery") == [
        "Jonas Richter",
        "AI delivery",
    ]
