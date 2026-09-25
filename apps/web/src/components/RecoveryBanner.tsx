"use client";

import React from "react";

import { WorkflowStateCard } from "@/components/WorkflowStateCard";
import type { RecoveryNotice } from "@/lib/recoveryUx";
import { recoveryNoticeToWorkflowState } from "@/lib/workflowState";

interface RecoveryBannerProps {
  notice: RecoveryNotice;
  busy?: boolean;
  onAction?: () => void;
}

export function RecoveryBanner({ notice, busy = false, onAction }: RecoveryBannerProps) {
  const presentation = recoveryNoticeToWorkflowState(notice);

  return (
    <div data-recovery-category={notice.category}>
      <WorkflowStateCard
        presentation={presentation}
        busy={busy}
        onPrimaryAction={onAction}
        dataTestId="recovery-banner"
        primaryActionTestId="recovery-action"
        showTechnical={presentation.key === "generation_failed"}
        className="recovery-banner"
      />
    </div>
  );
}
