import Link from "next/link";
import React from "react";

import type { JourneyStageName } from "@/lib/api";
import { pipelineHref } from "@/lib/pipelineContext";
import {
  appendDemoQuery,
  CONCRETISATION_REVIEW_STEPS,
  DEEPENING_REVIEW_STEPS,
  FIRST_CONTACT_REVIEW_STEPS,
  followupReviewHref,
  type ConcretisationReviewStep,
  type DeepeningReviewStep,
  type FirstContactReviewStep,
} from "@/lib/stageOutputReview";

interface JourneyOutputStepperProps {
  journeyStage: JourneyStageName;
  currentStep: FirstContactReviewStep | DeepeningReviewStep | ConcretisationReviewStep;
  opportunityId: string;
  demoMode?: boolean;
  eligibilityLockCopy?: string | null;
}

function stepHref(
  path: string,
  opportunityId: string,
  demoMode: boolean,
  journeyStage: JourneyStageName,
): string {
  if (path === "__followup_review__") {
    return followupReviewHref(opportunityId, journeyStage, demoMode);
  }
  return appendDemoQuery(pipelineHref(path, opportunityId), demoMode);
}

export function JourneyOutputStepper({
  journeyStage,
  currentStep,
  opportunityId,
  demoMode = false,
  eligibilityLockCopy = null,
}: JourneyOutputStepperProps) {
  const steps =
    journeyStage === "first_contact"
      ? FIRST_CONTACT_REVIEW_STEPS
      : journeyStage === "deepening"
        ? DEEPENING_REVIEW_STEPS
        : CONCRETISATION_REVIEW_STEPS;

  const currentIndex = steps.findIndex((step) => step.id === currentStep);

  return (
    <nav className="journey-output-stepper" aria-label="Stage review steps">
      {eligibilityLockCopy ? (
        <p className="journey-output-lock-copy" role="status">
          {eligibilityLockCopy}
        </p>
      ) : null}
      <ol className="journey-output-stepper-list">
        {steps.map((step, index) => {
          const state =
            index === currentIndex ? "current" : index < currentIndex ? "prior" : "upcoming";
          return (
            <li
              key={step.id}
              className={`journey-output-step journey-output-step-${state}`}
              aria-current={state === "current" ? "step" : undefined}
            >
              {index > 0 ? <span className="journey-output-step-rule" aria-hidden="true" /> : null}
              <Link href={stepHref(step.path, opportunityId, demoMode, journeyStage)} className="journey-output-step-link">
                <span className="journey-output-step-index" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="journey-output-step-label">{step.label}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
