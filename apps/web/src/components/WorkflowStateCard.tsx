"use client";

import Link from "next/link";
import React from "react";

import type { WorkflowStatePresentation } from "@/lib/workflowState";

interface WorkflowStateCardProps {
  presentation: WorkflowStatePresentation;
  variant?: "default" | "compact" | "embedded";
  busy?: boolean;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  dataTestId?: string;
  primaryActionTestId?: string;
  className?: string;
  showTechnical?: boolean;
}

function actionLabel(label: string): string {
  if (label.endsWith("→")) {
    return label;
  }
  return `${label} →`;
}

function renderActionButton(
  action: NonNullable<WorkflowStatePresentation["primaryAction"]>,
  options: {
    busy: boolean;
    onAction?: () => void;
    testId: string;
    className: string;
  },
) {
  if (action.href) {
    return (
      <Link href={action.href} className={options.className} data-testid={options.testId}>
        {actionLabel(action.label)}
      </Link>
    );
  }

  const disabled = options.busy || action.disabled || !options.onAction;
  return (
    <button
      type="button"
      className={options.className}
      disabled={disabled}
      aria-disabled={disabled}
      title={disabled ? action.disabledReason : undefined}
      data-testid={options.testId}
      onClick={options.onAction}
    >
      {actionLabel(action.label)}
    </button>
  );
}

export function WorkflowStateCard({
  presentation,
  variant = "default",
  busy = false,
  onPrimaryAction,
  onSecondaryAction,
  dataTestId = "workflow-state-card",
  primaryActionTestId = "workflow-state-primary-action",
  className,
  showTechnical = false,
}: WorkflowStateCardProps) {
  const technical = presentation.technical;
  const hasTechnical = Boolean(
    showTechnical &&
      (technical?.code || technical?.stage || technical?.jobId || technical?.message),
  );

  return (
    <section
      className={[
        "workflow-state-card",
        `workflow-state-${presentation.key}`,
        `workflow-state-tone-${presentation.tone}`,
        variant !== "default" ? `workflow-state-${variant}` : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role={presentation.role}
      aria-live={presentation.ariaLive}
      data-testid={dataTestId}
      data-workflow-state-key={presentation.key}
    >
      <div className="workflow-state-accent" aria-hidden="true" />
      <div className="workflow-state-body">
        <p className="workflow-state-eyebrow">{presentation.eyebrow}</p>
        <div className="workflow-state-content">
          <span className="workflow-state-icon" aria-hidden="true">
            {presentation.iconLabel}
          </span>
          <div className="workflow-state-copy">
            <h2 className="workflow-state-title">{presentation.title}</h2>
            <p className="workflow-state-description">{presentation.description}</p>
          </div>
        </div>
        {presentation.primaryAction || presentation.secondaryAction || presentation.meta ? (
          <div className="workflow-state-actions">
            {presentation.primaryAction
              ? renderActionButton(presentation.primaryAction, {
                  busy,
                  onAction: onPrimaryAction,
                  testId: primaryActionTestId,
                  className: "workflow-state-action workflow-state-action-primary",
                })
              : null}
            {presentation.secondaryAction
              ? renderActionButton(presentation.secondaryAction, {
                  busy,
                  onAction: onSecondaryAction,
                  testId: "workflow-state-secondary-action",
                  className: "workflow-state-action workflow-state-action-secondary",
                })
              : null}
            {presentation.meta ? (
              <span className="workflow-state-meta" aria-live="polite">
                {presentation.meta}
              </span>
            ) : null}
          </div>
        ) : null}
        {hasTechnical ? (
          <details className="workflow-state-details recovery-details">
            <summary>Details for support</summary>
            {technical?.code ? <p>Error code: {technical.code}</p> : null}
            {technical?.stage ? <p>Stage: {technical.stage}</p> : null}
            {technical?.jobId ? <p>Job reference: {technical.jobId}</p> : null}
            {technical?.message ? <p>Technical message: {technical.message}</p> : null}
          </details>
        ) : null}
      </div>
    </section>
  );
}
