import React from "react";

import { OriginBadge } from "@/components/OriginBadge";
import { TranscriptTurnRefsList } from "@/components/TranscriptTurnRefsList";
import type { StatedItem } from "@/lib/stage2Contracts";
import { confidenceLabel } from "@/lib/stage2OutputsView";

export function DecisionsListPanel({ decisions }: { decisions: StatedItem[] }) {
  const generated = decisions.filter((item) => item.origin === "SOURCE_FACT" && item.text);

  if (generated.length === 0) {
    return (
      <section className="upload-panel stage-review-section">
        <h2>Decisions</h2>
        <div className="stage-review-unavailable">
          <strong>No decisions recorded</strong>
          <p>No source-backed decisions are available from the meeting output.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="upload-panel stage-review-section">
      <h2>Decisions</h2>
      <ul className="stage-stated-item-list">
        {generated.map((item, index) => (
          <li key={`${item.text}-${index}`}>
            <p>{item.text}</p>
            <div className="stage-fact-meta">
              <OriginBadge origin={item.origin} />
              <span className="stage-confidence-label">{confidenceLabel(item.confidence)}</span>
            </div>
            <TranscriptTurnRefsList refs={item.source_refs} />
          </li>
        ))}
      </ul>
    </section>
  );
}
