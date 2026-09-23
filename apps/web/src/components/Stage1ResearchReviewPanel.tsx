import React from "react";

import { OriginBadge } from "@/components/OriginBadge";
import { SourceRefsList } from "@/components/SourceRefsList";
import type { Stage1Research } from "@/lib/stage1Contracts";
import {
  companyFactRows,
  dependencyLabel,
  hypothesisDisplayValue,
} from "@/lib/stage1ResearchView";

export function Stage1ResearchReviewPanel({ research }: { research: Stage1Research }) {
  const factRows = companyFactRows(research);
  const hypothesisText = hypothesisDisplayValue(research.hypothesis);
  const productRelevanceText = hypothesisDisplayValue(research.product_relevance);

  return (
    <>
      <section className="upload-panel stage-review-section">
        <h2>Company research brief</h2>
        <dl className="stage-review-facts">
          {factRows.map((row) => (
            <div key={row.fieldKey}>
              <dt>{row.label}</dt>
              <dd className={row.isUnknown ? "stage-fact-unknown" : undefined}>{row.displayValue}</dd>
              <dd className="stage-fact-meta">
                <OriginBadge origin={row.origin} />
              </dd>
              {!row.isUnknown ? <SourceRefsList refs={row.fact.source_refs} /> : null}
            </div>
          ))}
        </dl>
      </section>

      <section className="upload-panel stage-review-section">
        <h2>Borek support hypothesis</h2>
        <p className="upload-hint">Tentative AI inference — not independently verified.</p>
        {hypothesisText ? (
          <>
            <p className="stage-hypothesis-text">{hypothesisText}</p>
            <div className="stage-fact-meta">
              <OriginBadge origin="AI_INFERENCE" />
            </div>
            {research.hypothesis.basis.length > 0 ? (
              <ul className="stage-basis-list">
                {research.hypothesis.basis.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="stage-fact-unknown">Unknown — support hypothesis not generated.</p>
        )}
      </section>

      <section className="upload-panel stage-review-section">
        <h2>Product or service relevance</h2>
        <p className="upload-hint">Tentative AI inference — not independently verified.</p>
        {productRelevanceText ? (
          <>
            <p className="stage-hypothesis-text">{productRelevanceText}</p>
            <div className="stage-fact-meta">
              <OriginBadge origin="AI_INFERENCE" />
            </div>
            {research.product_relevance.basis.length > 0 ? (
              <ul className="stage-basis-list">
                {research.product_relevance.basis.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="stage-fact-unknown">Unknown — product relevance not generated.</p>
        )}
      </section>

      <section className="upload-panel stage-review-section">
        <h2>Borek offering reference</h2>
        <p>{research.borek_offering.value ?? "Unknown — offering not resolved."}</p>
        <div className="stage-fact-meta">
          <OriginBadge origin={research.borek_offering.origin} />
        </div>
        <SourceRefsList refs={research.borek_offering.source_refs} />
      </section>

      {research.dependencies.length > 0 ? (
        <section className="upload-panel stage-review-section">
          <h2>Research dependencies</h2>
          <ul className="stage-dependency-list">
            {research.dependencies.map((dependency) => (
              <li key={dependency}>{dependencyLabel(dependency)}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
