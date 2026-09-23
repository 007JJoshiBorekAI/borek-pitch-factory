import React from "react";

import type { CorpusSourceRef, SourceRef } from "@/lib/stage1Contracts";
import { formatSourceRef } from "@/lib/stage1ResearchView";

export function SourceRefsList({ refs }: { refs: SourceRef[] }) {
  if (refs.length === 0) {
    return null;
  }

  return (
    <ul className="stage-source-ref-list">
      {refs.map((ref) => (
        <li key={`${ref.source_id}:${ref.locator}`}>
          <strong>{formatSourceRef(ref)}</strong>
          <span>{ref.excerpt}</span>
        </li>
      ))}
    </ul>
  );
}

export function CorpusSourceRefsList({ refs }: { refs: CorpusSourceRef[] }) {
  if (refs.length === 0) {
    return null;
  }

  return (
    <ul className="stage-source-ref-list">
      {refs.map((ref) => (
        <li key={ref.entry_id}>
          <strong>
            {ref.title}
            {ref.locator ? ` · ${ref.locator}` : ""}
          </strong>
          <span>{ref.excerpt}</span>
        </li>
      ))}
    </ul>
  );
}
