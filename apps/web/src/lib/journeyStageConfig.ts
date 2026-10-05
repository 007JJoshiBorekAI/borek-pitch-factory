import type { JourneyStageName } from "./api";

export interface JourneyStageCatalogEntry {
  id: JourneyStageName;
  label: string;
  description: string;
}

/**
 * Owner-facing journey options. Concretisation stays in the API union so
 * historical records can be decoded, and it is not offered here.
 * BT-31 still owns the lock flags for the stages that remain.
 */
export const JOURNEY_STAGE_CATALOG: readonly JourneyStageCatalogEntry[] = [
  {
    id: "first_contact",
    label: "First contact",
    description: "A generic Borek information pack for a first conversation.",
  },
  {
    id: "deepening",
    label: "Deepening",
    description: "A tailored pitch that continues from the First contact pack.",
  },
];

export const NEW_CLIENT_SCOPE = "new-client";

export const JOURNEY_STAGE_LOCK_COPY: Record<
  NonNullable<import("./api").JourneyStageEligibilityItem["next_action"]>,
  string
> = {
  complete_first_contact: "Generate a First contact pack for this client first.",
  complete_deepening: "Generate a Deepening pitch for this client first.",
  regenerate_prior_stage: "Regenerate the previous pack for this client first.",
  select_journey_stage: "Choose an available option to continue.",
  owner_stage_removed: "Concretisation is not part of the owner workflow.",
};

export function catalogWithoutStage(
  catalog: readonly JourneyStageCatalogEntry[],
  stageId: JourneyStageName,
): JourneyStageCatalogEntry[] {
  return catalog.filter((entry) => entry.id !== stageId);
}
