import Link from "next/link";
import React from "react";

import {
  stageOutputStatusClassName,
  type StageOutputArtifactStatus,
} from "@/lib/stageOutputArtifacts";
import type { StageOutputHubItem } from "@/lib/stageOutputReview";
import { STAGE_OUTPUT_BACKEND_NOTE } from "@/lib/stageOutputReview";

interface StageOutputHubPanelProps {
  title?: string;
  items: StageOutputHubItem[];
  showBackendNote?: boolean;
}

function statusMarkerClass(status: StageOutputArtifactStatus, isDemo: boolean): string {
  if (isDemo) {
    return "stage-output-marker-demo";
  }
  return stageOutputStatusClassName(status);
}

export function StageOutputHubPanel({
  title = "Outputs",
  items,
  showBackendNote = true,
}: StageOutputHubPanelProps) {
  const hasUnavailable = items.some((item) => item.status === "backend_unavailable" && !item.isDemo);
  const hasDemo = items.some((item) => item.isDemo);

  return (
    <aside className="stage-output-hub" aria-labelledby="stage-output-hub-title">
      <h2 id="stage-output-hub-title">{title}</h2>
      {hasDemo ? (
        <p className="stage-output-demo-note" role="note">
          Demonstration data only — not live company research or generated artefacts.
        </p>
      ) : null}
      {showBackendNote && hasUnavailable ? (
        <p className="stage-output-backend-note">{STAGE_OUTPUT_BACKEND_NOTE}</p>
      ) : null}
      <ul className="stage-output-hub-list">
        {items.map((item) => (
          <li key={item.id} className="stage-output-hub-item">
            <span
              className={`stage-output-marker ${statusMarkerClass(item.status, item.isDemo)}`}
              aria-hidden="true"
            />
            <div className="stage-output-hub-copy">
              {item.reviewHref ? (
                <Link href={item.reviewHref} className="stage-output-hub-link">
                  {item.label}
                </Link>
              ) : (
                <strong>{item.label}</strong>
              )}
              <span className="stage-output-hub-detail">{item.detail}</span>
              <span className={`stage-output-status ${statusMarkerClass(item.status, item.isDemo)}`}>
                {item.statusLabel}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
