import React from "react";

import { OriginBadge } from "@/components/OriginBadge";
import { TranscriptTurnRefsList } from "@/components/TranscriptTurnRefsList";
import type { MinutesOfMeeting } from "@/lib/stage2Contracts";
import { momUnavailableMessage } from "@/lib/stage2OutputsView";

export function MinutesOfMeetingPanel({
  mom,
  dependencies = [],
}: {
  mom: MinutesOfMeeting;
  dependencies?: string[];
}) {
  if (mom.status !== "generated" || mom.sections.length === 0) {
    return (
      <section className="upload-panel stage-review-section">
        <h2>Minutes of meeting</h2>
        <div className="stage-review-unavailable">
          <strong>Minutes unavailable</strong>
          <p>{momUnavailableMessage(mom, dependencies)}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="upload-panel stage-review-section">
      <h2>Minutes of meeting</h2>
      <div className="stage-fact-meta">
        <OriginBadge origin={mom.origin} />
      </div>
      <div className="stage-review-mom-sections">
        {mom.sections.map((section) => (
          <article key={section.heading}>
            <h3>{section.heading}</h3>
            <p>{section.body}</p>
            <TranscriptTurnRefsList refs={section.source_refs} />
          </article>
        ))}
      </div>
      <TranscriptTurnRefsList refs={mom.source_refs} />
      <p className="upload-hint">
        MOM document download is unavailable until a persisted document endpoint is confirmed.
      </p>
    </section>
  );
}
