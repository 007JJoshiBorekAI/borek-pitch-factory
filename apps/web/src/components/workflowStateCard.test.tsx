import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { WorkflowStateCard } from "./WorkflowStateCard.js";
import {
  generationFailedWorkflowState,
  newClientWorkflowState,
  researchingWorkflowState,
} from "../lib/workflowState.js";

const newClientHtml = renderToStaticMarkup(
  <WorkflowStateCard presentation={newClientWorkflowState()} dataTestId="clients-new-client-state" />,
);
assert.match(newClientHtml, /data-testid="clients-new-client-state"/);
assert.match(newClientHtml, /data-workflow-state-key="new_client"/);
assert.match(newClientHtml, /Start with the essentials/);
assert.match(newClientHtml, /Add client →/);
assert.match(newClientHtml, /href="\/upload\?new=1"/);
assert.match(newClientHtml, /role="status"/);

const failedHtml = renderToStaticMarkup(
  <WorkflowStateCard
    presentation={generationFailedWorkflowState({
      title: "The pitch could not be prepared",
      description: "Your client data is safe. Try again.",
      primaryAction: { label: "Try again" },
      technical: { code: "RENDERER_FAILED", jobId: "job-secret", message: "internal path" },
    })}
    showTechnical
    onPrimaryAction={() => undefined}
  />,
);
assert.match(failedHtml, /role="alert"/);
assert.match(failedHtml, /GENERATION FAILED/);
assert.match(failedHtml, /Try again →/);
assert.match(failedHtml, /<details class="workflow-state-details recovery-details">/);
assert.ok(failedHtml.indexOf("<details") < failedHtml.indexOf("job-secret"));

const researchingHtml = renderToStaticMarkup(
  <WorkflowStateCard presentation={researchingWorkflowState()} variant="embedded" />,
);
assert.match(researchingHtml, /workflow-state-embedded/);
assert.match(researchingHtml, /Usually under 3 min/);
assert.match(researchingHtml, /aria-live="polite"/);

const noActionHtml = renderToStaticMarkup(
  <WorkflowStateCard
    presentation={generationFailedWorkflowState({})}
    onPrimaryAction={() => undefined}
  />,
);
assert.doesNotMatch(noActionHtml, /workflow-state-primary-action/);
assert.doesNotMatch(noActionHtml, /Try again →/);

console.log("FIGMA-08 WorkflowStateCard tests passed");
