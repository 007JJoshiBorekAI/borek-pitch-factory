"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";

import { fetchSlidePreviewBlob } from "@/lib/api";
import {
  alternativeLayouts,
  formatLayoutLabel,
  PREVIEW_UNAVAILABLE_LABEL,
} from "@/lib/presentationReady";
import {
  findPitchSlideByKey,
  PITCH_DOWNLOAD_LABEL,
  pitchSlidePreviewCaption,
  type PitchGenerationProgress,
  type PitchSlideRowModel,
} from "@/lib/pitchGeneration";

interface PitchGenerationViewProps {
  eyebrow: string;
  title: string;
  progress: PitchGenerationProgress;
  slides: PitchSlideRowModel[];
  selectedSlideKey: string | null;
  onSelectSlide: (key: string) => void;
  accessToken: string | null;
  busy: boolean;
  downloadEnabled: boolean;
  onDownload: () => void;
  pdfDownloadEnabled?: boolean;
  onDownloadPdf?: () => void;
  onRegenerate?: (slideId: string) => void;
  onChangeLayout?: (slideId: string, layoutId: string) => void;
  followUpReviewHref?: string | null;
  showBuildPrompt?: boolean;
  onBuild?: () => void;
  buildDisabled?: boolean;
  recoveryBanner?: React.ReactNode;
  infoBanner?: React.ReactNode;
  partialArtifactsBanner?: React.ReactNode;
  loading?: boolean;
  emptyMessage?: string | null;
}

function PitchSlideThumbnail({
  accessToken,
  previewUrl,
  uiState,
}: {
  accessToken: string | null;
  previewUrl: string | null;
  uiState: PitchSlideRowModel["uiState"];
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    async function loadPreview() {
      setImageUrl(null);
      if (!accessToken || !previewUrl) {
        return;
      }
      try {
        const blob = await fetchSlidePreviewBlob(accessToken, previewUrl);
        objectUrl = URL.createObjectURL(blob);
        if (active) {
          setImageUrl(objectUrl);
        }
      } catch {
        if (active) {
          setImageUrl(null);
        }
      }
    }

    void loadPreview();

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [accessToken, previewUrl]);

  return (
    <div
      className={`pitch-generation-thumb pitch-generation-thumb-${uiState}`}
      data-state={uiState}
      aria-hidden="true"
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" />
      ) : (
        <div className="pitch-generation-thumb-placeholder">
          {uiState === "generating" ? <span className="pitch-generation-thumb-bar" /> : null}
        </div>
      )}
    </div>
  );
}

function PitchSlidePreviewPanel({
  accessToken,
  slide,
  busy,
  onRegenerate,
  onChangeLayout,
}: {
  accessToken: string | null;
  slide: PitchSlideRowModel | null;
  busy: boolean;
  onRegenerate?: (slideId: string) => void;
  onChangeLayout?: (slideId: string, layoutId: string) => void;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const layoutOptions = slide ? alternativeLayouts(slide.layoutId) : [];

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    async function loadPreview() {
      setError(null);
      setImageUrl(null);
      if (!accessToken || !slide?.previewUrl) {
        setError(PREVIEW_UNAVAILABLE_LABEL);
        return;
      }
      try {
        const blob = await fetchSlidePreviewBlob(accessToken, slide.previewUrl);
        objectUrl = URL.createObjectURL(blob);
        if (active) {
          setImageUrl(objectUrl);
        }
      } catch {
        if (active) {
          setImageUrl(null);
          setError(PREVIEW_UNAVAILABLE_LABEL);
        }
      }
    }

    void loadPreview();

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [accessToken, slide]);

  if (!slide) {
    return (
      <div className="pitch-generation-preview-empty" data-testid="pitch-preview-empty">
        <p>Generated slides become available here immediately.</p>
      </div>
    );
  }

  return (
    <div className="pitch-generation-preview-panel" data-testid="pitch-slide-preview">
      <p className="pitch-generation-preview-kicker">{pitchSlidePreviewCaption(slide)}</p>
      <div className="pitch-generation-preview-frame">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={`Slide ${slide.displayNumber} preview`} />
        ) : (
          <div className="pitch-generation-preview-fallback">{error ?? "Loading preview…"}</div>
        )}
      </div>
      <p className="pitch-generation-preview-note">Generated slides become available here immediately.</p>
      {onRegenerate || onChangeLayout ? (
        <div className="pitch-generation-preview-actions">
          {onRegenerate && slide.slideId ? (
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              disabled={busy}
              data-testid="regenerate-slide"
              onClick={() => onRegenerate(slide.slideId!)}
            >
              Regenerate slide
            </button>
          ) : null}
          {onChangeLayout && slide.slideId && layoutOptions.length > 0 ? (
            <label className="pitch-generation-layout-picker">
              <span>Change layout</span>
              <select
                value={slide.layoutId}
                disabled={busy}
                data-testid="change-slide-layout"
                onChange={(event) => {
                  const nextLayout = event.target.value;
                  if (nextLayout && nextLayout !== slide.layoutId) {
                    onChangeLayout(slide.slideId!, nextLayout);
                  }
                }}
              >
                <option value={slide.layoutId}>{formatLayoutLabel(slide.layoutId)}</option>
                {layoutOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PitchGenerationView({
  eyebrow,
  title,
  progress,
  slides,
  selectedSlideKey,
  onSelectSlide,
  accessToken,
  busy,
  downloadEnabled,
  onDownload,
  pdfDownloadEnabled = false,
  onDownloadPdf,
  onRegenerate,
  onChangeLayout,
  followUpReviewHref,
  showBuildPrompt = false,
  onBuild,
  buildDisabled = false,
  recoveryBanner,
  infoBanner,
  partialArtifactsBanner,
  loading = false,
  emptyMessage,
}: PitchGenerationViewProps) {
  const selectedSlide = findPitchSlideByKey(slides, selectedSlideKey);

  return (
    <div className="pitch-generation-workspace app-shell app-workspace-body" data-testid="pitch-generation-workspace">
      <header className="pitch-generation-header">
        <p className="pitch-generation-eyebrow">{eyebrow}</p>
        <h1 className="pitch-generation-title">{title}</h1>
        {progress.readyLabel ? (
          <div className="pitch-generation-progress-meta">
            <p className="pitch-generation-ready-count" data-testid="pitch-ready-count">
              {progress.readyLabel}
            </p>
          </div>
        ) : null}
        {progress.progressRatio !== null ? (
          <div
            className="pitch-generation-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress.progressRatio * 100)}
            data-testid="pitch-progress-bar"
          >
            <span
              className="pitch-generation-progress-value"
              style={{ width: `${Math.round(progress.progressRatio * 100)}%` }}
            />
          </div>
        ) : null}
      </header>

      {recoveryBanner}
      {infoBanner}
      {partialArtifactsBanner}

      {loading ? (
        <section className="pitch-generation-loading">
          <p data-testid="deck-loading">Loading presentation…</p>
        </section>
      ) : null}

      {!loading && showBuildPrompt ? (
        <section className="pitch-generation-empty" data-testid="pitch-build-prompt">
          <p>{emptyMessage ?? "No presentation exists yet for this opportunity."}</p>
          {onBuild ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={buildDisabled}
              onClick={() => onBuild()}
            >
              Build presentation
            </button>
          ) : null}
        </section>
      ) : null}

      {!loading && slides.length > 0 ? (
        <div className="pitch-generation-body">
          <aside className="pitch-generation-slide-list" data-testid="pitch-slide-list">
            <header className="pitch-generation-slide-list-header">
              <span>SLIDES</span>
              <span>VIEW ONLY</span>
            </header>
            <ol className="pitch-generation-slide-rows">
              {slides.map((slide) => {
                const selected = slide.key === selectedSlideKey;
                const rowClass = [
                  "pitch-generation-slide-row",
                  selected ? "is-selected" : "",
                  slide.uiState === "waiting" ? "is-waiting" : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <li key={slide.key} className={rowClass} data-state={slide.uiState}>
                    {slide.selectable ? (
                      <button
                        type="button"
                        className="pitch-generation-slide-button"
                        disabled={busy}
                        data-testid={`pitch-slide-select-${slide.displayNumber}`}
                        onClick={() => onSelectSlide(slide.key)}
                      >
                        <PitchSlideThumbnail
                          accessToken={accessToken}
                          previewUrl={slide.previewUrl}
                          uiState={slide.uiState}
                        />
                        <span className="pitch-generation-slide-copy">
                          <span className="pitch-generation-slide-number">{slide.displayNumber}</span>
                          <span className="pitch-generation-slide-title">{slide.title}</span>
                          <span className={`pitch-generation-slide-status pitch-generation-slide-status-${slide.uiState}`}>
                            {slide.uiState === "ready"
                              ? "Ready"
                              : slide.uiState === "generating"
                                ? "Generating"
                                : "Waiting"}
                          </span>
                        </span>
                        {slide.uiState === "ready" ? (
                          <span className="pitch-generation-slide-check" aria-hidden="true">
                            ✓
                          </span>
                        ) : null}
                      </button>
                    ) : (
                      <div className="pitch-generation-slide-static" aria-disabled="true">
                        <PitchSlideThumbnail
                          accessToken={accessToken}
                          previewUrl={slide.previewUrl}
                          uiState={slide.uiState}
                        />
                        <span className="pitch-generation-slide-copy">
                          <span className="pitch-generation-slide-number">{slide.displayNumber}</span>
                          <span className="pitch-generation-slide-title">{slide.title}</span>
                          <span className={`pitch-generation-slide-status pitch-generation-slide-status-${slide.uiState}`}>
                            {slide.uiState === "generating" ? "Generating" : "Waiting"}
                          </span>
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </aside>

          <div className="pitch-generation-main">
            <section className="pitch-generation-preview-area">
              <PitchSlidePreviewPanel
                accessToken={accessToken}
                slide={selectedSlide}
                busy={busy}
                onRegenerate={onRegenerate}
                onChangeLayout={onChangeLayout}
              />

              {progress.generatingSlideLabel ? (
                <div className="pitch-generation-current-job" data-testid="pitch-current-generation">
                  <div className="pitch-generation-current-job-icon" aria-hidden="true">
                    <span>{progress.readyCount}/{progress.totalCount ?? "?"}</span>
                  </div>
                  <div>
                    <p className="pitch-generation-current-job-title">{progress.generatingSlideLabel}</p>
                    {progress.generatingSlideTitle ? (
                      <p className="pitch-generation-current-job-subtitle">{progress.generatingSlideTitle}</p>
                    ) : null}
                  </div>
                  {progress.elapsedLabel ? (
                    <p className="pitch-generation-current-job-elapsed">{progress.elapsedLabel}</p>
                  ) : null}
                </div>
              ) : null}
            </section>

            <footer className="pitch-generation-download-footer" data-testid="pitch-download-footer">
              <div>
                <p className="pitch-generation-download-copy">{progress.downloadHint}</p>
                <p className="pitch-generation-download-subcopy">
                  You can continue reviewing completed slides.
                </p>
              </div>
              <div className="pitch-generation-download-actions">
                {followUpReviewHref ? (
                  <Link
                    href={followUpReviewHref}
                    className="btn btn-secondary btn-compact"
                    data-testid="concretisation-email-review"
                  >
                    Review follow-up email
                  </Link>
                ) : null}
                {pdfDownloadEnabled && onDownloadPdf ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-compact"
                    data-testid="download-pdf"
                    disabled={busy}
                    onClick={() => onDownloadPdf()}
                  >
                    Download PDF
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`btn btn-primary pitch-generation-download-btn${downloadEnabled ? "" : " is-disabled"}`}
                  data-testid="download-powerpoint"
                  disabled={!downloadEnabled || busy}
                  onClick={() => onDownload()}
                >
                  {PITCH_DOWNLOAD_LABEL}
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
