export type EmployeeRole = "consultant" | "reviewer" | "releaser" | "admin";

export interface EmployeeMe {
  user_id: string;
  email: string;
  role: EmployeeRole;
  capabilities: {
    generate: boolean;
    edit: boolean;
    confirm: boolean;
    release: boolean;
    assign_roles: boolean;
    view_all_activity: boolean;
  };
}

export interface ActivityLogEntry {
  id: string;
  actor_id: string;
  actor_email: string | null;
  action: string;
  object_type: string;
  object_id: string;
  document_id: string;
  timestamp: string;
}

export interface EmployeeRoleRow {
  user_id: string;
  email: string;
  role: EmployeeRole;
}

export const EMPTY_CAPABILITIES: EmployeeMe["capabilities"] = {
  generate: false,
  edit: false,
  confirm: false,
  release: false,
  assign_roles: false,
  view_all_activity: false,
};

export function isEmployeeSsoOnly(): boolean {
  return process.env.NEXT_PUBLIC_EMPLOYEE_SSO_ONLY === "true";
}

export function formatEmployeeRole(role: EmployeeRole | null | undefined): string {
  if (!role) {
    return "Employee";
  }
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function formatActivityAction(action: string): string {
  return action.replaceAll(".", " · ");
}
