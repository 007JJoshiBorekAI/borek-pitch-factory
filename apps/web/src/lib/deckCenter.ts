import type { DeckCenterResponse, SlidePreviewTile } from "./deckTypes";

export function mapDeckSlides(deck: DeckCenterResponse): SlidePreviewTile[] {
  return deck.slides
    .slice()
    .sort((left, right) => left.slide_index - right.slide_index)
    .map((slide) => ({
      slideId: slide.slide_id,
      slideIndex: slide.slide_index,
      layoutId: slide.layout_id,
      previewUrl: slide.preview_url?.trim() ? slide.preview_url : null,
    }));
}

export function buildDownloadFilename(presentationName: string, extension: "pptx" | "pdf"): string {
  const safe = presentationName.trim().replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-") || "presentation";
  return `${safe}.${extension}`;
}

export const DECK_READY_ATTEMPTS = 40;
export const DECK_READY_INTERVAL_MS = 1_500;

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForDeckCenter(
  loadDeck: () => Promise<DeckCenterResponse>,
  options: {
    isNotReady: (error: unknown) => boolean;
    delay?: (ms: number) => Promise<void>;
    attempts?: number;
    intervalMs?: number;
    shouldAbort?: () => boolean;
  },
): Promise<DeckCenterResponse> {
  const attempts = options.attempts ?? DECK_READY_ATTEMPTS;
  const intervalMs = options.intervalMs ?? DECK_READY_INTERVAL_MS;
  const delay = options.delay ?? defaultDelay;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (options.shouldAbort?.()) {
      throw lastError instanceof Error ? lastError : new Error("Deck loading cancelled");
    }
    try {
      return await loadDeck();
    } catch (loadError) {
      lastError = loadError;
      if (!options.isNotReady(loadError) || attempt === attempts - 1) {
        throw loadError;
      }
      await delay(intervalMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Presentation artifacts are not ready");
}
