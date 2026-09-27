import type { JobProgressSnapshot } from "./jobProgress";
import { elapsedMsSince, formatElapsed } from "./jobProgress";
import type { SlidePreviewTile } from "./deckTypes";
import { formatLayoutLabel } from "./presentationReady";
import type { SlidePreviewRow } from "./planTypes";

export type PitchSlideUiState = "ready" | "generating" | "waiting";

export interface PitchSlideRowModel {
  key: string;
  slideIndex: number;
  displayNumber: string;
  title: string;
  layoutId: string;
  previewUrl: string | null;
  slideId: string | null;
  uiState: PitchSlideUiState;
  selectable: boolean;
}

export interface PitchGenerationProgress {
  readyCount: number;
  totalCount: number | null;
  progressRatio: number | null;
  readyLabel: string | null;
  isGenerating: boolean;
  isComplete: boolean;
  elapsedLabel: string | null;
  generatingSlideLabel: string | null;
  generatingSlideTitle: string | null;
  downloadHint: string;
}

export interface BuildPitchSlideRowsInput {
  plannedSlides: SlidePreviewRow[];
  deckTiles: SlidePreviewTile[];
  regeneratingSlideId?: string | null;
  jobSnapshot?: JobProgressSnapshot | null;
}

export interface BuildPitchProgressInput {
  slides: PitchSlideRowModel[];
  jobSnapshot?: JobProgressSnapshot | null;
  pptxAvailable: boolean;
  nowMs?: number;
}

const SLIDE_CONTENT_STAGES = new Set(["SLIDE_GENERATING", "SLIDE_VALIDATING"]);

export function formatPitchEyebrow(
  clientName: string | null | undefined,
  journeyLabel = "PRE-MEETING",
): string {
  const client = clientName?.trim() || "Client";
  return `${journeyLabel} · ${client.toUpperCase()}`;
}

export function pitchGenerationTitle(isComplete: boolean): string {
  return isComplete ? "Your presentation is ready" : "Creating your pitch";
}

export function slideDisplayNumber(slideIndex: number): string {
  return String(slideIndex + 1).padStart(2, "0");
}

export function slideTitleFromPlan(purpose: string | null | undefined, layoutId: string): string {
  const trimmed = purpose?.trim();
  if (trimmed) {
    return trimmed
      .replace(/[_-]+/g, " ")
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }
  return formatLayoutLabel(layoutId);
}

export function planOrderToSlideIndex(order: number): number {
  return Math.max(0, order - 1);
}

export function mapSlideUiState(input: {
  hasPreview: boolean;
  regeneratingSlideId: string | null;
  slideId: string | null;
}): PitchSlideUiState {
  if (input.hasPreview) {
    if (input.regeneratingSlideId && input.slideId === input.regeneratingSlideId) {
      return "generating";
    }
    return "ready";
  }
  if (input.regeneratingSlideId && input.slideId === input.regeneratingSlideId) {
    return "generating";
  }
  return "waiting";
}

export function buildPitchSlideRows(input: BuildPitchSlideRowsInput): PitchSlideRowModel[] {
  const regeneratingSlideId = input.regeneratingSlideId ?? null;
  const deckByIndex = new Map(input.deckTiles.map((tile) => [tile.slideIndex, tile]));

  if (input.plannedSlides.length > 0) {
    return sortSlidesByIndex(
      input.plannedSlides.map((planned) => {
        const slideIndex = planOrderToSlideIndex(planned.order);
        const tile = deckByIndex.get(slideIndex) ?? null;
        const hasPreview = Boolean(tile?.previewUrl);
        const slideId = tile?.slideId ?? null;
        const uiState = mapSlideUiState({ hasPreview, regeneratingSlideId, slideId });
        return {
          key: slideId ?? `plan-${slideIndex}`,
          slideIndex,
          displayNumber: slideDisplayNumber(slideIndex),
          title: slideTitleFromPlan(planned.purpose, planned.layoutId),
          layoutId: tile?.layoutId ?? planned.layoutId,
          previewUrl: tile?.previewUrl ?? null,
          slideId,
          uiState,
          selectable: uiState === "ready" && hasPreview,
        };
      }),
    );
  }

  return sortSlidesByIndex(
    input.deckTiles.map((tile) => {
      const hasPreview = Boolean(tile.previewUrl);
      const uiState = mapSlideUiState({
        hasPreview,
        regeneratingSlideId,
        slideId: tile.slideId,
      });
      return {
        key: tile.slideId,
        slideIndex: tile.slideIndex,
        displayNumber: slideDisplayNumber(tile.slideIndex),
        title: slideTitleFromPlan(null, tile.layoutId),
        layoutId: tile.layoutId,
        previewUrl: tile.previewUrl,
        slideId: tile.slideId,
        uiState,
        selectable: uiState === "ready" && hasPreview,
      };
    }),
  );
}

function sortSlidesByIndex(rows: PitchSlideRowModel[]): PitchSlideRowModel[] {
  return [...rows].sort((left, right) => left.slideIndex - right.slideIndex);
}

export function countReadySlides(slides: PitchSlideRowModel[]): number {
  return slides.filter((slide) => slide.uiState === "ready").length;
}

export function resolveInitialSelectedSlideKey(slides: PitchSlideRowModel[]): string | null {
  return slides.find((slide) => slide.selectable)?.key ?? null;
}

export function resolveStableSelectedSlideKey(
  slides: PitchSlideRowModel[],
  currentKey: string | null,
): string | null {
  if (currentKey && slides.some((slide) => slide.key === currentKey && slide.selectable)) {
    return currentKey;
  }
  return resolveInitialSelectedSlideKey(slides);
}

export function findPitchSlideByKey(
  slides: PitchSlideRowModel[],
  key: string | null,
): PitchSlideRowModel | null {
  if (!key) {
    return null;
  }
  return slides.find((slide) => slide.key === key) ?? null;
}

export function isPitchDownloadReady(input: {
  slides: PitchSlideRowModel[];
  pptxAvailable: boolean;
  busy: boolean;
}): boolean {
  if (input.busy || !input.pptxAvailable) {
    return false;
  }
  if (input.slides.length === 0) {
    return false;
  }
  return input.slides.every((slide) => slide.uiState === "ready");
}

export function buildPitchGenerationProgress(input: BuildPitchProgressInput): PitchGenerationProgress {
  const readyCount = countReadySlides(input.slides);
  const totalCount = input.slides.length > 0 ? input.slides.length : null;
  const progressRatio =
    totalCount && totalCount > 0 ? Math.min(1, readyCount / totalCount) : null;
  const isComplete = totalCount !== null && readyCount === totalCount && readyCount > 0;
  const snapshot = input.jobSnapshot ?? null;
  const jobRunning =
    snapshot?.status === "RUNNING" ||
    snapshot?.status === "QUEUED" ||
    snapshot?.status === "FAILED";
  const isGenerating = !isComplete && (jobRunning || readyCount < (totalCount ?? 0));

  const elapsedMs =
    snapshot && (snapshot.status === "RUNNING" || snapshot.status === "QUEUED")
      ? elapsedMsSince(snapshot, input.nowMs ?? Date.now())
      : null;
  const elapsedLabel =
    elapsedMs !== null ? `${formatElapsed(elapsedMs)} elapsed` : null;

  const generatingSlide = input.slides.find((slide) => slide.uiState === "generating") ?? null;
  const nextWaitingSlide =
    input.slides.find((slide) => slide.uiState === "waiting") ??
    null;
  const activeGeneratingSlide = generatingSlide ?? (isGenerating ? nextWaitingSlide : null);

  let generatingSlideLabel: string | null = null;
  let generatingSlideTitle: string | null = null;
  if (
    generatingSlide &&
    (snapshot?.jobType === "slide_regenerate" || snapshot?.jobType === "slide_change_layout")
  ) {
    generatingSlideLabel = `Updating slide ${generatingSlide.displayNumber}`;
    generatingSlideTitle = generatingSlide.title;
  } else if (
    snapshot &&
    SLIDE_CONTENT_STAGES.has(snapshot.currentStage) &&
    snapshot.jobType === "presentation_generation"
  ) {
    generatingSlideLabel = "Generating slides";
    generatingSlideTitle = jobStageDetail(snapshot.currentStage);
  }

  const readyLabel =
    totalCount !== null
      ? `${readyCount} of ${totalCount} slide${totalCount === 1 ? "" : "s"} ready`
      : readyCount > 0
        ? `${readyCount} slide${readyCount === 1 ? "" : "s"} ready`
        : null;

  const downloadHint =
    totalCount !== null && !isComplete
      ? `Download will be available when all ${totalCount} slides are ready.`
      : isComplete
        ? "Download your presentation when you are ready."
        : "Download will be available when slide generation completes.";

  return {
    readyCount,
    totalCount,
    progressRatio,
    readyLabel,
    isGenerating,
    isComplete,
    elapsedLabel,
    generatingSlideLabel,
    generatingSlideTitle,
    downloadHint,
  };
}

function jobStageDetail(stage: string): string {
  if (stage === "SLIDE_VALIDATING") {
    return "Checking slide quality";
  }
  return "Writing slide content";
}

export function pitchSlidePreviewCaption(slide: PitchSlideRowModel | null): string | null {
  if (!slide) {
    return null;
  }
  return `SLIDE ${slide.displayNumber} · ${slide.title.toUpperCase()}`;
}

export const PITCH_DOWNLOAD_LABEL = "Download PPTX";
