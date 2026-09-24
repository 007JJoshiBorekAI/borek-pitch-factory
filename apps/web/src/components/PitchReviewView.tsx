"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { fetchSlidePreviewBlob } from "@/lib/api";
import type { PitchDraft } from "@/lib/pitchDraft";
import type { PitchReviewSlideItem } from "@/lib/pitchReview";
import { personalizationCopy } from "@/lib/pitchReview";

export interface PitchReviewViewProps {
  accessToken: string;
  clientName: string;
  opportunityId: string;
  presentationName: string;
  versionLabel: string | null;
  statusLabel: string;
  slides: PitchReviewSlideItem[];
  selectedSlideId: string | null;
  busy: boolean;
  pptxAvailable: boolean;
  pdfAvailable: boolean;
  onRegenerate: (slideId: string) => void;
  onDownloadPptx: () => void;
  onDownloadPdf: () => void;
  onUseVersion: () => void;
  draft: PitchDraft | null;
}

function SlidePreviewImage({
  accessToken,
  slide,
}: {
  accessToken: string;
  slide: PitchReviewSlideItem;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setSrc(null);
    if (!slide.previewUrl) {
      return undefined;
    }
    void fetchSlidePreviewBlob(accessToken, slide.previewUrl)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [accessToken, slide.previewUrl, slide.slideId]);

  if (src) {
    return (
      <img
        className="pitch-review-slide-image"
        src={src}
        alt={`${slide.layoutLabel} preview`}
      />
    );
  }

  return (
    <>
      <div className="pitch-review-slide-tag">{slide.tag}</div>
      <h2 className="pitch-review-slide-headline">{slide.purpose}</h2>
      <div className="pitch-review-slide-bar" aria-hidden="true" />
      <ul className="pitch-review-slide-bullets">
        {slide.bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
    </>
  );
}

export function PitchReviewView({
  accessToken,
  clientName,
  opportunityId,
  presentationName,
  versionLabel,
  statusLabel,
  slides,
  selectedSlideId,
  busy,
  pptxAvailable,
  pdfAvailable,
  onRegenerate,
  onDownloadPptx,
  onDownloadPdf,
  onUseVersion,
  draft,
}: PitchReviewViewProps) {
  const active =
    slides.find((slide) => slide.slideId === selectedSlideId) ?? slides[0] ?? null;
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const remainingChecks = useMemo(() => {
    if (!active) return 0;
    return active.checks.filter((check) => !checked[`${active.slideId}:${check.id}`]).length;
  }, [active, checked]);

  return (
    <div className="pitch-review-page" data-testid="pitch-review-page">
      <div className="pitch-review-topline">
        <div>
          <div className="pitch-review-kicker">Presentations</div>
          <h2 className="pitch-review-title">Review the pitch</h2>
        </div>
        <div className="pitch-review-top-actions">
          <span className="pitch-review-status">{statusLabel}</span>
          <button
            type="button"
            className="btn btn-secondary"
            data-testid="download-powerpoint"
            disabled={busy || !pptxAvailable}
            onClick={onDownloadPptx}
          >
            {pptxAvailable ? "Download PowerPoint" : "PowerPoint still rendering…"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            data-testid="use-this-version"
            disabled={busy || slides.length === 0}
            onClick={onUseVersion}
          >
            Use this version
          </button>
        </div>
      </div>

      <p className="pitch-breadcrumb">
        {clientName} / {presentationName || "Pitch"}
      </p>

      {!active ? (
        <p className="upload-hint" data-testid="pitch-review-empty">
          Slide previews are still arriving. The PowerPoint download will enable as soon as the file is ready.
        </p>
      ) : (
      <div className="pitch-review-workspace">
        <div className="pitch-review-main">
          <div className="pitch-section-label">
            {String(active.order).padStart(2, "0")} / {active.layoutLabel}
          </div>
          <div className="pitch-review-slide-preview" data-testid="presentation-hero-preview">
            <SlidePreviewImage accessToken={accessToken} slide={active} />
          </div>
          <strong>Personalised for {clientName}</strong>
          <p className="pitch-subtle">{personalizationCopy(clientName, draft)}</p>
          <p className="pitch-section-label pitch-review-selected-label">Selected content</p>
          <p className="pitch-review-selected">
            {active.selectedContent.map((line) => (
              <strong key={line}>{line}</strong>
            ))}
          </p>
          <div className="pitch-review-toolbar">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || active.slideId.startsWith("planned-")}
              onClick={() => onRegenerate(active.slideId)}
            >
              Regenerate
            </button>
          </div>
          <div className="pitch-review-download-links">
            <button
              type="button"
              className="pitch-review-link"
              disabled={busy || !pptxAvailable}
              onClick={onDownloadPptx}
            >
              PPTX master
            </button>
            <button
              type="button"
              className="pitch-review-link"
              disabled={busy || !pdfAvailable}
              onClick={onDownloadPdf}
            >
              PDF preview
            </button>
          </div>
        </div>

        <aside className="pitch-review-aside">
          <section className="pitch-review-aside-block">
            <h4>Why this slide</h4>
            <p>{active.whyThisSlide}</p>
          </section>
          {active.clientQuote ? (
            <section className="pitch-review-aside-block">
              <h4>Client evidence</h4>
              <p className="pitch-review-quote">{active.clientQuote}</p>
              {active.evidenceSource ? (
                <p className="pitch-review-source-meta">{active.evidenceSource}</p>
              ) : null}
            </section>
          ) : null}
          <section className="pitch-review-aside-block">
            <h4>Borek source</h4>
            <ul className="pitch-review-source-list">
              {active.borekSources.map((source) => (
                <li key={source}>{source}</li>
              ))}
            </ul>
          </section>
          <section className="pitch-review-aside-block">
            <h4>Review</h4>
            {active.checks.map((check) => {
              const key = `${active.slideId}:${check.id}`;
              return (
                <label key={check.id} className="pitch-review-check">
                  <input
                    type="checkbox"
                    checked={Boolean(checked[key])}
                    onChange={(event) =>
                      setChecked((current) => ({ ...current, [key]: event.target.checked }))
                    }
                  />
                  {check.label}
                </label>
              );
            })}
            <p className="pitch-review-source-meta">
              {remainingChecks === 0
                ? "All checks complete"
                : `${remainingChecks} check${remainingChecks === 1 ? "" : "s"} remain`}
            </p>
          </section>
          <p className="pitch-review-version-meta">
            {versionLabel ? `${versionLabel} · current` : "Current version"}
            <br />
            <Link href={`/approvals?opportunityId=${encodeURIComponent(opportunityId)}`}>
              Release package →
            </Link>
          </p>
        </aside>
      </div>
      )}
    </div>
  );
}

export function PitchReviewSlideSidebar({
  slides,
  selectedSlideId,
  onSelectSlide,
  versionLabel,
}: {
  slides: PitchReviewSlideItem[];
  selectedSlideId: string | null;
  onSelectSlide: (slideId: string) => void;
  versionLabel: string | null;
}) {
  if (slides.length === 0) {
    return null;
  }
  return (
    <div className="pitch-review-slides-nav" data-testid="pitch-review-slide-nav">
      <div className="pitch-section-label">Slides · {slides.length}</div>
      {slides.map((slide) => (
        <button
          key={slide.slideId}
          type="button"
          className={`pitch-review-slide-item${slide.slideId === selectedSlideId ? " active" : ""}`}
          onClick={() => onSelectSlide(slide.slideId)}
        >
          <span>{String(slide.order).padStart(2, "0")}</span>
          <span>{slide.shortLabel}</span>
          {slide.needsAttention ? <span className="pitch-review-warn" aria-label="Needs review" /> : null}
        </button>
      ))}
      <div className="pitch-review-versions">
        {versionLabel ? `${versionLabel} · current` : "Current version"}
      </div>
    </div>
  );
}
