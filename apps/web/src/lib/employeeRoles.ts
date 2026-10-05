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

export const EMPTY_CAPABILITIES: EmployeeMe["capabilities"] = {
  generate: false,
  edit: false,
  confirm: false,
  release: false,
  assign_roles: false,
  view_all_activity: false,
};

export function formatEmployeeRole(role: EmployeeRole | null | undefined): string {
  if (!role) {
    return "Employee";
  }
  return role.charAt(0).toUpperCase() + role.slice(1);
}

