"""Employee login session, role assignment, and activity log (D3)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.auth import get_current_user
from app.dependencies import AuthUserDep, DataStoreDep, require_role
from app.schemas.employees import (
    ActivityLogEntry,
    AssignEmployeeRoleRequest,
    EmployeeMeResponse,
    EmployeeRoleResponse,
)
from app.services.audit import AuditAction, AuditObjectType, record_audit_event
from app.services.employees import CAPABILITIES, EmployeeRole, parse_employee_role, role_satisfies

router = APIRouter(dependencies=[Depends(get_current_user)])


def _capabilities(role: EmployeeRole) -> dict[str, bool]:
    return {
        name: role_satisfies(role, minimum)
        for name, minimum in CAPABILITIES.items()
    }


def _me_response(*, user_id: UUID, email: str, role: str) -> EmployeeMeResponse:
    parsed = parse_employee_role(role)
    return EmployeeMeResponse(
        user_id=user_id,
        email=email,
        role=parsed.value,  # type: ignore[arg-type]
        capabilities=_capabilities(parsed),
    )


def _role_response(row: dict) -> EmployeeRoleResponse:
    return EmployeeRoleResponse(
        user_id=row["user_id"],
        email=row["email"],
        role=parse_employee_role(row["role"]).value,  # type: ignore[arg-type]
    )


def _activity_entry(row: dict) -> ActivityLogEntry:
    return ActivityLogEntry(
        id=row["id"],
        actor_id=row["actor_id"],
        actor_email=row.get("actor_email"),
        action=row["action"],
        object_type=row["object_type"],
        object_id=row["object_id"],
        document_id=str(row.get("document_id") or row["object_id"]),
        timestamp=row["timestamp"],
    )


@router.get("/me", response_model=EmployeeMeResponse)
def get_employee_me(user: AuthUserDep, store: DataStoreDep) -> EmployeeMeResponse:
    row = store.get_or_create_user_role(user_id=user.id, email=user.email)
    return _me_response(user_id=user.id, email=user.email, role=row["role"])


@router.post("/session", response_model=EmployeeMeResponse)
def record_employee_session(user: AuthUserDep, store: DataStoreDep) -> EmployeeMeResponse:
    row = store.get_or_create_user_role(user_id=user.id, email=user.email)
    record_audit_event(
        store,
        actor_id=user.id,
        actor_email=user.email,
        action=AuditAction.AUTH_LOGIN,
        object_type=AuditObjectType.SESSION,
        object_id=user.id,
        document_id=user.email,
    )
    return _me_response(user_id=user.id, email=user.email, role=row["role"])


@router.get("/activity", response_model=list[ActivityLogEntry])
def list_activity(
    user: AuthUserDep,
    store: DataStoreDep,
    object_id: UUID | None = Query(default=None),
    document_id: str | None = Query(default=None),
) -> list[ActivityLogEntry]:
    profile = store.get_or_create_user_role(user_id=user.id, email=user.email)
    privileged = role_satisfies(profile["role"], EmployeeRole.ADMIN)
    rows = store.list_audit_logs(
        actor_id=None if privileged else user.id,
        object_id=object_id,
        document_id=document_id,
        privileged=privileged,
    )
    return [_activity_entry(row) for row in reversed(rows)]


@router.get(
    "",
    response_model=list[EmployeeRoleResponse],
)
def list_employees(user: AuthUserDep, store: DataStoreDep) -> list[EmployeeRoleResponse]:
    store.get_or_create_user_role(user_id=user.id, email=user.email)
    return [_role_response(row) for row in store.list_user_roles()]


@router.patch(
    "/{user_id}/role",
    response_model=EmployeeRoleResponse,
    dependencies=[Depends(require_role(EmployeeRole.ADMIN))],
)
def assign_employee_role(
    user_id: UUID,
    body: AssignEmployeeRoleRequest,
    user: AuthUserDep,
    store: DataStoreDep,
) -> EmployeeRoleResponse:
    row = store.set_user_role(
        user_id=user_id,
        email=body.email or "",
        role=body.role,
    )
    record_audit_event(
        store,
        actor_id=user.id,
        actor_email=user.email,
        action=AuditAction.ROLE_ASSIGN,
        object_type=AuditObjectType.EMPLOYEE,
        object_id=user_id,
        document_id=row["email"] or str(user_id),
    )
    return _role_response(row)
