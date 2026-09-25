import type { Stage1Research } from "./stage1Contracts";

const STORAGE_PREFIX = "borek.stage1Research.";

function storageKey(opportunityId: string): string {
  return `${STORAGE_PREFIX}${opportunityId}`;
}

function isValidSessionResearch(
  opportunityId: string,
  research: Stage1Research,
): boolean {
  return (
    research.schema_version === "1.0" &&
    research.opportunity_id === opportunityId
  );
}

export function readSessionStage1Research(opportunityId: string): Stage1Research | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(storageKey(opportunityId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Stage1Research;
    if (!isValidSessionResearch(opportunityId, parsed)) {
      window.sessionStorage.removeItem(storageKey(opportunityId));
      return null;
    }
    return parsed;
  } catch {
    window.sessionStorage.removeItem(storageKey(opportunityId));
    return null;
  }
}

export function writeSessionStage1Research(
  opportunityId: string,
  research: Stage1Research,
): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (!isValidSessionResearch(opportunityId, research)) {
    return false;
  }
  window.sessionStorage.setItem(storageKey(opportunityId), JSON.stringify(research));
  return true;
}

export function clearSessionStage1Research(opportunityId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(storageKey(opportunityId));
}
