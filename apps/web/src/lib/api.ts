import type { EmployeeMe } from "./employeeRoles";
import { getSupabaseBrowserClient } from "./supabase";

const DEFAULT_API_URL = "http://localhost:8000";

function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || DEFAULT_API_URL;
}

async function accessToken(fallback: string): Promise<string> {
  const client = getSupabaseBrowserClient();
  const session = client ? (await client.auth.getSession()).data.session : null;
  return session?.access_token ?? fallback;
}

async function employeeRequest(
  path: string,
  token: string,
  method = "GET",
): Promise<EmployeeMe> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${await accessToken(token)}`,
    },
  });
  if (!response.ok) throw new Error(`Employee request failed (${response.status}).`);
  return response.json() as Promise<EmployeeMe>;
}

export function getEmployeeMe(token: string): Promise<EmployeeMe> {
  return employeeRequest("/employees/me", token);
}

export function recordEmployeeSession(token: string): Promise<EmployeeMe> {
  return employeeRequest("/employees/session", token, "POST");
}
