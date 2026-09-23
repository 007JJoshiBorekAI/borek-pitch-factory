import React from "react";

import { CopyTextButton } from "@/components/CopyTextButton";
import { OriginBadge } from "@/components/OriginBadge";
import { SourceRefsList } from "@/components/SourceRefsList";
import type { DiscoveryQuestionCollection } from "@/lib/stage1Contracts";
import {
  allDiscoveryQuestionsCopyText,
  discoveryQuestionsUnavailableMessage,
} from "@/lib/stage1OutputsView";

export function DiscoveryQuestionsPanel({
  collection,
  dependencies = [],
}: {
  collection: DiscoveryQuestionCollection;
  dependencies?: string[];
}) {
  const generatedQuestions = collection.items.filter(
    (item) => item.status === "generated" && item.text,
  );

  if (collection.status !== "generated" || generatedQuestions.length === 0) {
    return (
      <section className="upload-panel stage-review-section">
        <h2>Discovery questions</h2>
        <div className="stage-review-unavailable">
          <strong>Discovery questions unavailable</strong>
          <p>{discoveryQuestionsUnavailableMessage(collection, dependencies)}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="upload-panel stage-review-section">
      <div className="stage-section-heading-row">
        <h2>Discovery questions</h2>
        <CopyTextButton
          text={allDiscoveryQuestionsCopyText(generatedQuestions)}
          label="Copy all"
        />
      </div>
      <p className="upload-hint">
        {generatedQuestions.length} questions · contract requires 10–15 when successfully generated
      </p>
      <ol className="stage-discovery-list">
        {generatedQuestions.map((question, index) => (
          <li key={question.question_id}>
            <div className="stage-discovery-question-row">
              <p>{question.text}</p>
              <CopyTextButton text={question.text ?? ""} label="Copy" />
            </div>
            <div className="stage-fact-meta">
              <OriginBadge origin={question.origin} />
              <span className="stage-item-id">{question.question_id}</span>
            </div>
            {question.basis && question.basis.length > 0 ? (
              <ul className="stage-basis-list">
                {question.basis.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            {question.source_refs ? <SourceRefsList refs={question.source_refs} /> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
