"""Pitch ownership JSON for opportunity create."""

from __future__ import annotations

import uuid

from app.services.pitch_owner import (
    employee_pitch_owner,
    parse_team_members,
    user_can_access_opportunity,
)

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


def test_user_can_access_opportunity_by_creator_or_pitch_owner() -> None:
    other = uuid.uuid4()
    assert user_can_access_opportunity({"created_by": str(USER)}, USER)
    assert not user_can_access_opportunity({"created_by": str(other)}, USER)
    assert user_can_access_opportunity(
        {"created_by": str(other), "pitch_owner": employee_pitch_owner(USER)},
        USER,
    )
