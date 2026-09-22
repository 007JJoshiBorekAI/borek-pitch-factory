"""Employee role ranks for D3 governance."""

from __future__ import annotations

from enum import StrEnum


class EmployeeRole(StrEnum):
    CONSULTANT = "consultant"
    REVIEWER = "reviewer"
    RELEASER = "releaser"
    ADMIN = "admin"


ROLE_RANK: dict[EmployeeRole, int] = {
    EmployeeRole.CONSULTANT: 10,
    EmployeeRole.REVIEWER: 20,
    EmployeeRole.RELEASER: 30,
    EmployeeRole.ADMIN: 40,
}

CAPABILITIES: dict[str, EmployeeRole] = {
    "generate": EmployeeRole.CONSULTANT,
    "edit": EmployeeRole.CONSULTANT,
    "confirm": EmployeeRole.REVIEWER,
    "release": EmployeeRole.REVIEWER,
    "assign_roles": EmployeeRole.ADMIN,
    "view_all_activity": EmployeeRole.ADMIN,
}


def parse_employee_role(value: str) -> EmployeeRole:
    try:
        return EmployeeRole(str(value).strip().lower())
    except ValueError as exc:
        raise ValueError(f"Unknown employee role: {value}") from exc


def role_satisfies(actual: EmployeeRole | str, minimum: EmployeeRole | str) -> bool:
    return ROLE_RANK[parse_employee_role(str(actual))] >= ROLE_RANK[parse_employee_role(str(minimum))]
