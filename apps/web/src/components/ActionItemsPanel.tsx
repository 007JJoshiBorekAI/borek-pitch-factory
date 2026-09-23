import React from "react";

import { OriginBadge } from "@/components/OriginBadge";
import { TranscriptTurnRefsList } from "@/components/TranscriptTurnRefsList";
import type { ActionItem } from "@/lib/stage2Contracts";
import {
  confidenceLabel,
  displayDue,
  displayOwner,
  hasGeneratedActionItems,
} from "@/lib/stage2OutputsView";

export function ActionItemsPanel({ items }: { items: ActionItem[] }) {
  const generated = hasGeneratedActionItems(items);

  if (generated.length === 0) {
    return (
      <section className="upload-panel stage-review-section">
        <h2>Action items</h2>
        <div className="stage-review-unavailable">
          <strong>No action items recorded</strong>
          <p>No source-backed action items are available from the meeting output.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="upload-panel stage-review-section">
      <h2>Action items</h2>
      <ul className="stage-action-item-list">
        {generated.map((item, index) => (
          <li key={`${item.action}-${index}`}>
            <strong>{item.action}</strong>
            <dl className="stage-action-meta">
              <div>
                <dt>Owner</dt>
                <dd className={item.owner ? undefined : "stage-fact-unknown"}>
                  {displayOwner(item.owner)}
                </dd>
              </div>
              <div>
                <dt>Due</dt>
                <dd className={item.due ? undefined : "stage-fact-unknown"}>
                  {displayDue(item.due)}
                </dd>
              </div>
            </dl>
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
