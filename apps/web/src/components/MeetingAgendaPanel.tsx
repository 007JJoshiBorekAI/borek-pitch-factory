import React from "react";

import { OriginBadge } from "@/components/OriginBadge";
import { SourceRefsList } from "@/components/SourceRefsList";
import type { MeetingAgenda } from "@/lib/stage1Contracts";
import { agendaUnavailableMessage, sortedAgendaItems } from "@/lib/stage1OutputsView";

export function MeetingAgendaPanel({
  agenda,
  dependencies = [],
}: {
  agenda: MeetingAgenda;
  dependencies?: string[];
}) {
  if (agenda.status !== "generated" || agenda.items.length === 0) {
    return (
      <section className="upload-panel stage-review-section">
        <h2>First-meeting agenda</h2>
        <div className="stage-review-unavailable">
          <strong>Agenda unavailable</strong>
          <p>{agendaUnavailableMessage(agenda, dependencies)}</p>
        </div>
      </section>
    );
  }

  const items = sortedAgendaItems(agenda);

  return (
    <section className="upload-panel stage-review-section">
      <h2>First-meeting agenda</h2>
      <div className="stage-fact-meta">
        <OriginBadge origin={agenda.origin} />
      </div>
      <ol className="stage-review-agenda-list">
        {items.map((item) => (
          <li key={item.order}>
            <strong>{item.topic}</strong>
            {item.duration_minutes != null ? (
              <span>{item.duration_minutes} min</span>
            ) : (
              <span className="stage-duration-missing">Duration not specified</span>
            )}
            {item.notes ? <p>{item.notes}</p> : null}
          </li>
        ))}
      </ol>
      <SourceRefsList refs={agenda.source_refs} />
      <p className="upload-hint">
        Agenda download is unavailable until a persisted document endpoint is confirmed.
      </p>
    </section>
  );
}
