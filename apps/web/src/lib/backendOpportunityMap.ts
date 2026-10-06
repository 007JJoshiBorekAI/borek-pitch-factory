export const BACKEND_OPPORTUNITY_MAP_PREFIX = "borek-backend-opportunity-map-v2:";
export const BACKEND_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function backendOpportunityMapKey(ownerId: string, apiBaseUrl: string): string {
  return `${BACKEND_OPPORTUNITY_MAP_PREFIX}${encodeURIComponent(ownerId)}:${encodeURIComponent(apiBaseUrl)}`;
}

export function readBackendOpportunityMap(storage: Storage, ownerId: string, apiBaseUrl: string): Record<string, string> {
  try {
    const raw: unknown = JSON.parse(storage.getItem(backendOpportunityMapKey(ownerId, apiBaseUrl)) ?? "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).filter(([key, value]) => key.startsWith("opp-") && typeof value === "string" && BACKEND_UUID.test(value)));
  } catch {
    return {};
  }
}
