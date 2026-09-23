import React from "react";

import type { TranscriptTurnRef } from "@/lib/stage2Contracts";
import { formatTranscriptTurnRef } from "@/lib/stage2OutputsView";

export function TranscriptTurnRefsList({ refs }: { refs: TranscriptTurnRef[] }) {
  if (refs.length === 0) {
    return null;
  }

  return (
    <ul className="stage-source-ref-list">
      {refs.map((ref) => (
        <li key={`${ref.conversation_id}:${ref.excerpt_pointer}`}>
          <strong>{formatTranscriptTurnRef(ref)}</strong>
        </li>
      ))}
    </ul>
  );
}
