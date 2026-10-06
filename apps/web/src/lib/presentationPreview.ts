import type { PreviewOpportunity } from "./previewJourney";

// Local UI preview only: use the approved source, never an editable successor.
export function presentationPreview(opportunity: PreviewOpportunity | null) {
  const source = opportunity?.approved_discovery;
  const presentation = opportunity?.presentation;
  if (!source || source.document_state !== "approved" || !presentation ||
      (presentation.source_discovery_version_id && presentation.source_discovery_version_id !== source.version_id)) {
    return [];
  }
  return source.pages.map((page, index) => ({
    id: page.id,
    label: page.label,
    title: page.title,
    body: page.body,
    state: index < presentation.slide_count ? "ready" as const
      : index === presentation.slide_count && presentation.state === "generating" ? "generating" as const
      : index === presentation.slide_count && presentation.state === "failed" ? "failed" as const
      : "waiting" as const,
  }));
}
