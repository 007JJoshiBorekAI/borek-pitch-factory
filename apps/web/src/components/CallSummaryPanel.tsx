import React from "react";

import { OriginBadge } from "@/components/OriginBadge";
import { TranscriptTurnRefsList } from "@/components/TranscriptTurnRefsList";
import type { Stage2SummaryBlock } from "@/lib/stage2Contracts";
import { callSummaryUnavailableMessage } from "@/lib/stage2OutputsView";

export function CallSummaryPanel({
  summary,
  dependencies = [],
}: {
  summary: Stage2SummaryBlock;
  dependencies?: string[];
}) {
  if (summary.status !== "generated" || !summary.text) {
    return (
      <section className="upload-panel stage-review-section">
        <h2>Call summary</h2>
        <div className="stage-review-unavailable">
          <strong>Call summary unavailable</strong>
          <p>{callSummaryUnavailableMessage(summary, dependencies)}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="upload-panel stage-review-section">
      <h2>Call summary</h2>
      <p>{summary.text}</p>
      <div className="stage-fact-meta">
        <OriginBadge origin={summary.origin} />
      </div>
      <TranscriptTurnRefsList refs={summary.source_refs} />
    </section>
  );
}
