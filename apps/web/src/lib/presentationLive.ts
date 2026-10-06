import {
  ApiRequestError, apiFetch, apiFetchBlob, getWorkflowStatus,
  type WorkflowStatusResponse,
} from "./api";
import type { FirstPitchResult } from "./ppt1Generation";

export interface DeckResponse {
  presentation_id: string;
  presentation_name: string;
  version_number: number;
  status: string;
  slides: { slide_id: string; slide_index: number; layout_id: string; preview_url: string | null }[];
  pptx_download_url: string;
  pdf_download_url: string;
}

export interface SlideResponse {
  id: string;
  presentation_version_id: string;
  slide_index: number;
  layout_id: string;
  slide_spec: { title?: unknown };
}

export interface LiveSlide {
  id: string;
  index: number;
  label: string;
  previewPath: string | null;
}

export interface LivePresentation extends FirstPitchResult {
  name: string;
  versionNumber: number;
  slides: LiveSlide[];
}

type LiveWorkflow = WorkflowStatusResponse & {
  documents?: { approved_discovery?: { version_id: string } | null };
};

function identityMismatch(): never {
  throw new ApiRequestError(
    "The latest presentation version changed or does not match PPT #1. Reload the deck to continue. Historical previews are not supported by this API.",
    409, "PPT1_IDENTITY_MISMATCH",
  );
}

function checkSlides(slides: SlideResponse[], identity: FirstPitchResult) {
  if (slides.some((slide) => slide.presentation_version_id !== identity.presentationVersionId)) identityMismatch();
}

export function adaptLivePresentation(
  identity: FirstPitchResult, deck: DeckResponse, metadata: SlideResponse[],
): LivePresentation {
  if (deck.presentation_id !== identity.presentationId) identityMismatch();
  checkSlides(metadata, identity);
  if (deck.status !== "ready") throw new Error("PPT #1 artifacts are not ready yet.");
  // /deck may list only the rendered pages. Do not hide unrendered /slides rows.
  const indices = new Set([...deck.slides, ...metadata].map((slide) => slide.slide_index));
  if ([...indices].some((index) => !Number.isInteger(index) || index < 0)) {
    throw new Error("PPT #1 returned an invalid slide index.");
  }
  const slides = [...indices].sort((a, b) => a - b).map((index) => {
    const preview = deck.slides.find((slide) => slide.slide_index === index);
    const slide = metadata.find((slide) => slide.slide_index === index);
    if (preview && slide && preview.slide_id !== slide.id) identityMismatch();
    const title = slide?.slide_spec.title;
    const label = typeof title === "string" && title.trim() ? title.trim()
      : `Slide ${index + 1} - ${slide?.layout_id ?? preview?.layout_id ?? "Untitled"}`;
    const expectedPath = `/presentations/${identity.presentationId}/preview/slides/${index}.png`;
    return {
      id: slide?.id ?? preview!.slide_id,
      index,
      label,
      // Only send credentials to the expected same-API slide endpoint.
      previewPath: preview?.preview_url === expectedPath ? expectedPath : null,
    };
  });
  return { ...identity, name: deck.presentation_name, versionNumber: deck.version_number, slides };
}

export async function assertCurrentLivePresentation(
  token: string, opportunityId: string, identity: FirstPitchResult, signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const [workflow, slides] = await Promise.all([
    getWorkflowStatus(token, opportunityId),
    apiFetch<SlideResponse[]>(`/presentations/${identity.presentationId}/slides`, token, { signal, cache: "no-store" }),
  ]);
  signal?.throwIfAborted();
  const current = workflow.documents?.ppt1;
  if (current?.presentation_id !== identity.presentationId ||
      current.latest_ready_version_id !== identity.presentationVersionId) identityMismatch();
  checkSlides(slides, identity);
}

export async function loadLivePresentation(
  token: string, opportunityId: string, identity: FirstPitchResult, signal?: AbortSignal,
): Promise<LivePresentation> {
  signal?.throwIfAborted();
  const [deck, slides] = await Promise.all([
    apiFetch<DeckResponse>(`/presentations/${identity.presentationId}/deck`, token, { signal, cache: "no-store" }),
    apiFetch<SlideResponse[]>(`/presentations/${identity.presentationId}/slides`, token, { signal, cache: "no-store" }),
  ]);
  signal?.throwIfAborted();
  const result = adaptLivePresentation(identity, deck, slides);
  await assertCurrentLivePresentation(token, opportunityId, identity, signal);
  signal?.throwIfAborted();
  return result;
}

export async function loadExistingFirstPitch(token: string, opportunityId: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const workflow = await getWorkflowStatus(token, opportunityId) as LiveWorkflow;
  signal?.throwIfAborted();
  const ppt1 = workflow.documents?.ppt1;
  let deck: LivePresentation | null = null;
  let loadError: string | null = null;
  try {
    if (ppt1?.presentation_id && ppt1.latest_ready_version_id) {
      deck = await loadLivePresentation(token, opportunityId, {
        presentationId: ppt1.presentation_id,
        presentationVersionId: ppt1.latest_ready_version_id,
        jobId: null,
      }, signal);
    }
  } catch (error) {
    signal?.throwIfAborted();
    loadError = livePresentationError(error);
  }
  return { deck, loadError, status: ppt1?.status ?? "missing", approvedSourceId: workflow.documents?.approved_discovery?.version_id ?? null };
}

export function livePresentationError(error: unknown): string {
  if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
    return "Presentation access was denied. Sign in with an authorized account, then retry.";
  }
  if (error instanceof ApiRequestError && error.code === "SLIDE_PREVIEW_NOT_FOUND") {
    return "The backend has not rendered this slide preview. Retry after previews are available.";
  }
  return error instanceof Error ? error.message : "The presentation could not be loaded. Please retry.";
}

export type LivePreviewState =
  | { state: "loading" }
  | { state: "ready"; url: string }
  | { state: "failed"; message: string };

export function requestLiveSlidePreview(
  token: string, opportunityId: string, deck: LivePresentation, slide: LiveSlide,
  onChange: (state: LivePreviewState) => void,
) {
  const controller = new AbortController();
  const { signal } = controller;
  let objectUrl: string | null = null;
  onChange({ state: "loading" });
  const done = (async () => {
    try {
      if (!slide.previewPath) throw new Error("The backend has not advertised a preview for this slide. Reload the deck to check again.");
      await assertCurrentLivePresentation(token, opportunityId, deck, signal);
      const blob = await apiFetchBlob(slide.previewPath, token, { signal, cache: "no-store" });
      signal.throwIfAborted();
      if (!blob.size || !blob.type.startsWith("image/")) throw new Error("The slide preview response is not an image.");
      // Latest-only endpoints cannot pin a version atomically; reject observable version changes.
      await assertCurrentLivePresentation(token, opportunityId, deck, signal);
      signal.throwIfAborted();
      objectUrl = URL.createObjectURL(blob);
      onChange({ state: "ready", url: objectUrl });
    } catch (error) {
      if (!signal.aborted) onChange({ state: "failed", message: livePresentationError(error) });
    }
  })();
  return {
    done,
    cancel() {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    },
  };
}

export async function downloadLivePresentation(
  token: string, opportunityId: string, deck: LivePresentation, format: "pptx" | "pdf", signal?: AbortSignal,
) {
  await assertCurrentLivePresentation(token, opportunityId, deck, signal);
  const blob = await apiFetchBlob(`/presentations/${deck.presentationId}/download/${format}`, token, { signal, cache: "no-store" });
  await assertCurrentLivePresentation(token, opportunityId, deck, signal);
  signal?.throwIfAborted();
  return blob;
}
