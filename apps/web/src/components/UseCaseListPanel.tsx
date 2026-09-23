import React from "react";

import { CorpusSourceRefsList } from "@/components/SourceRefsList";
import { OriginBadge } from "@/components/OriginBadge";
import type { UseCaseCollection } from "@/lib/stage1Contracts";
import {
  useCaseStatusClassName,
  useCaseStatusLabel,
  useCasesUnavailableMessage,
} from "@/lib/stage1OutputsView";

export function UseCaseListPanel({
  collection,
  dependencies = [],
}: {
  collection: UseCaseCollection;
  dependencies?: string[];
}) {
  if (collection.status !== "generated" || collection.items.length === 0) {
    return (
      <section className="upload-panel stage-review-section">
        <h2>Use case relevance</h2>
        <div className="stage-review-unavailable">
          <strong>Use cases unavailable</strong>
          <p>{useCasesUnavailableMessage(collection, dependencies)}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="upload-panel stage-review-section">
      <h2>Use case relevance</h2>
      <ul className="stage-use-case-list">
        {collection.items.map((useCase) => (
          <li key={useCase.use_case_id} className={useCaseStatusClassName(useCase.status)}>
            <div className="stage-use-case-header">
              <strong>{useCase.title ?? "Untitled use case"}</strong>
              <span className={`stage-use-case-status ${useCaseStatusClassName(useCase.status)}`}>
                {useCaseStatusLabel(useCase.status)}
              </span>
            </div>
            {useCase.relevance_summary ? <p>{useCase.relevance_summary}</p> : null}
            <div className="stage-fact-meta">
              <OriginBadge origin={useCase.origin} />
              <span className="stage-item-id">{useCase.use_case_id}</span>
            </div>
            {useCase.basis && useCase.basis.length > 0 ? (
              <ul className="stage-basis-list">
                {useCase.basis.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            {useCase.source_refs ? <CorpusSourceRefsList refs={useCase.source_refs} /> : null}
            {useCase.status === "none_found" ? (
              <p className="stage-fact-unknown">No matching Borek use case was found.</p>
            ) : null}
            {useCase.status === "unknown" ? (
              <p className="stage-fact-unknown">Use-case status is unknown.</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
