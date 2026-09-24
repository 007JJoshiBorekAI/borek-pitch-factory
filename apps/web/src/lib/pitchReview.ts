import type { SlidePreviewTile } from "./deckTypes";
import type { PitchDraft } from "./pitchDraft";
import type { PlannedSlide } from "./planTypes";
import { formatLayoutLabel } from "./presentationReady";

export interface PitchReviewCheck {
  id: string;
  label: string;
}

export interface PitchReviewSlideItem {
  slideId: string;
  order: number;
  shortLabel: string;
  layoutLabel: string;
  tag: string;
  purpose: string;
  whyThisSlide: string;
  bullets: string[];
  selectedContent: string[];
  borekSources: string[];
  clientQuote: string | null;
  evidenceSource: string | null;
  needsAttention: boolean;
  checks: PitchReviewCheck[];
  previewUrl: string | null;
}

function padOrder(order: number): string {
  return String(order).padStart(2, "0");
}

function linesFromText(value: string, limit = 3): string[] {
  return value
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function clientQuoteFromDraft(draft: PitchDraft | null): { quote: string | null; source: string | null } {
  if (!draft) {
    return { quote: null, source: null };
  }
  const candidates = [draft.requirements, draft.painPoints, draft.summary, draft.businessNeed];
  for (const block of candidates) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const sentence = trimmed.split(/(?<=[.!?])\s+/)[0]?.trim() ?? trimmed;
    const quote = sentence.length > 180 ? `${sentence.slice(0, 177)}…` : sentence;
    const sourceParts = [
      draft.meetingDate ? `discovery · ${draft.meetingDate}` : "discovery note",
    ];
    return { quote: `"${quote.replace(/^"+|"+$/g, "")}"`, source: `Source: ${sourceParts.join(" · ")}` };
  }
  return { quote: null, source: null };
}

function checksForLayout(layoutId: string): PitchReviewCheck[] {
  const category = layoutId.toUpperCase();
  if (category.includes("CASE") || category.includes("PROBLEM")) {
    return [
      { id: "accurate", label: "Claim is accurate" },
      { id: "relevant", label: "Case study is relevant" },
    ];
  }
  if (category.includes("SCOPE") || category.includes("TIMELINE")) {
    return [
      { id: "scope", label: "Scope matches the brief" },
      { id: "dates", label: "Dates are realistic" },
    ];
  }
  return [
    { id: "accurate", label: "Claim is accurate" },
    { id: "client", label: "Wording fits the client" },
  ];
}

function mergePlannedSlide(planned: PlannedSlide | undefined, tile: SlidePreviewTile): PitchReviewSlideItem {
  const layoutLabel = formatLayoutLabel(tile.layoutId);
  const purpose = planned?.purpose?.trim() || layoutLabel;
  const references = planned?.frameworkReferences?.filter(Boolean) ?? [];
  const bullets =
    references.length > 0
      ? references.slice(0, 4)
      : linesFromText(purpose, 3).length > 0
        ? linesFromText(purpose, 3)
        : [purpose];

  return {
    slideId: tile.slideId,
    order: planned?.order ?? tile.slideIndex + 1,
    shortLabel: layoutLabel,
    layoutLabel,
    tag: layoutLabel.toUpperCase(),
    purpose,
    whyThisSlide: purpose,
    bullets,
    selectedContent: references.length > 0 ? references.slice(0, 2) : [layoutLabel],
    borekSources: references.length > 0 ? references : ["Released capabilities deck", "Brand master"],
    clientQuote: null,
    evidenceSource: null,
    needsAttention: !tile.previewUrl,
    checks: checksForLayout(tile.layoutId),
    previewUrl: tile.previewUrl,
  };
}

export function buildPitchReviewSlides(
  tiles: SlidePreviewTile[],
  plannedSlides: PlannedSlide[],
  draft: PitchDraft | null,
): PitchReviewSlideItem[] {
  const sortedTiles = tiles.slice().sort((left, right) => left.slideIndex - right.slideIndex);
  const sortedPlan = plannedSlides.slice().sort((left, right) => left.order - right.order);
  const evidence = clientQuoteFromDraft(draft);

  return sortedTiles.map((tile, index) => {
    const planned = sortedPlan[index] ?? sortedPlan.find((slide) => slide.order === tile.slideIndex + 1);
    const item = mergePlannedSlide(planned, tile);
    return {
      ...item,
      clientQuote: evidence.quote,
      evidenceSource: evidence.source,
    };
  });
}

export function pitchReviewStatusLabel(items: PitchReviewSlideItem[]): string {
  const pending = items.filter((item) => item.needsAttention).length;
  if (pending === 0) {
    return "Draft · ready to use";
  }
  return `Draft · ${pending} item${pending === 1 ? "" : "s"} need review`;
}

export function formatSlideNavLabel(order: number, shortLabel: string): string {
  return `${padOrder(order)} ${shortLabel}`;
}

export function personalizationCopy(clientName: string, draft: PitchDraft | null): string {
  const need = draft?.businessNeed?.trim() || draft?.description?.trim();
  if (need) {
    return `Based on ${clientName}'s stated need and Borek's released capability material. ${need}`;
  }
  return `Based on ${clientName}'s stated needs and Borek's released capability material.`;
}
