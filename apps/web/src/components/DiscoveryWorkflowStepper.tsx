"use client";

import Link from "next/link";
import React from "react";
import { useLanguage } from "@/components/LanguageProvider";

import {
  WORKFLOW_STATUS_CATALOG,
  type WorkflowSnapshotViewModel,
} from "@/lib/discoveryFirst";

interface DiscoveryWorkflowStepperProps {
  opportunityId: string;
  workflow: WorkflowSnapshotViewModel;
}

export function DiscoveryWorkflowStepper({
  opportunityId,
  workflow,
}: DiscoveryWorkflowStepperProps) {
  const { copy } = useLanguage();
  const completed = new Set(workflow.completed_statuses);

  return (
    <nav className="discovery-workflow-stepper" aria-label="Opportunity workflow">
      <ol>
        {WORKFLOW_STATUS_CATALOG.map((step, index) => {
          const isCurrent = step.id === workflow.current_status;
          const isComplete = completed.has(step.id);
          const stateLabel = isCurrent ? copy.workflow.current : isComplete ? copy.workflow.completed : copy.workflow.unavailable;
          const content = (
            <>
              <span className="discovery-step-number" aria-hidden="true">
                {index + 1}
              </span>
              <span className="discovery-step-copy">
                <span>{copy.workflow.statuses[step.id]}</span>
                <small>{stateLabel}</small>
              </span>
            </>
          );
          return (
            <li
              key={step.id}
              className={isCurrent ? "is-current" : isComplete ? "is-complete" : "is-blocked"}
            >
              {isCurrent || isComplete ? (
                <Link
                  href={`/opportunities/${encodeURIComponent(opportunityId)}/${step.route}`}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {content}
                </Link>
              ) : (
                <span aria-disabled="true">{content}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
