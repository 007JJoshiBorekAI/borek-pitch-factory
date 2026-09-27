import type { Stage1Fact } from "@/lib/api";

export function formatStage1Fact(fact: Stage1Fact | null | undefined): string {
  if (!fact) {
    return "Unknown / research unavailable";
  }
  if (fact.status === "verified" && fact.value?.trim()) {
    return fact.value.trim();
  }
  return "Unknown / research unavailable";
}
