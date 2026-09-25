import assert from "node:assert/strict";
import { test } from "node:test";

import { ApiRequestError } from "./api.js";
import type { ActiveJobResponse, JobResponse } from "./api.js";
import type { FrameworkVersionResponse } from "./frameworkTypes.js";
import type { PresentationPlanResponse } from "./planTypes.js";
import { PresentationPipelineError } from "./presentationPipeline.js";
import {
  ensureStage2Framework,
  pitchReviewResultHref,
  presentationReadyForFramework,
  runStage2SlidePrepare,
  stage2JourneyStage,
  type Stage2PrepareApi,
} from "./stage2PreparePipeline.js";

test("pitchReviewResultHref targets pitch review with presentation ids", () => {
  assert.equal(
    pitchReviewResultHref("opp-1", {
      presentationId: "pres-1",
      presentationVersionId: "ver-1",
    }),
    "/pitch-review?opportunityId=opp-1&presentationId=pres-1&presentationVersionId=ver-1",
  );
  assert.equal(
    pitchReviewResultHref("opp-1", { presentationId: "pres-1" }),
    "/pitch-review?opportunityId=opp-1&presentationId=pres-1",
  );
});

test("stage2JourneyStage prefers deepening when it is startable", () => {
  assert.equal(
    stage2JourneyStage({
      schema_version: "1.0",
      opportunity_id: "opp-1",
      requested_journey_stage: "deepening",
      startable: true,
      prerequisite_stage: "first_contact",
      prior_stage_presentation_version_id: "ver-1",
      reason: null,
      next_action: null,
      stages: [
        {
          journey_stage: "first_contact",
          startable: true,
          prerequisite_stage: null,
          prior_stage_presentation_version_id: null,
          reason: null,
          next_action: null,
        },
        {
          journey_stage: "deepening",
          startable: true,
          prerequisite_stage: "first_contact",
          prior_stage_presentation_version_id: "ver-1",
          reason: null,
          next_action: null,
        },
        {
          journey_stage: "concretisation",
          startable: false,
          prerequisite_stage: "deepening",
          prior_stage_presentation_version_id: null,
          reason: "NO_COMPLETED_PREREQUISITE",
          next_action: "complete_deepening",
        },
      ],
    }),
    "deepening",
  );
});

test("stage2JourneyStage falls back to first contact when deepening is locked", () => {
  assert.equal(
    stage2JourneyStage({
      schema_version: "1.0",
      opportunity_id: "opp-1",
      requested_journey_stage: "deepening",
      startable: false,
      prerequisite_stage: "first_contact",
      prior_stage_presentation_version_id: null,
      reason: "NO_COMPLETED_PREREQUISITE",
      next_action: "complete_first_contact",
      stages: [
        {
          journey_stage: "first_contact",
          startable: true,
          prerequisite_stage: null,
          prior_stage_presentation_version_id: null,
          reason: null,
          next_action: null,
        },
        {
          journey_stage: "deepening",
          startable: false,
          prerequisite_stage: "first_contact",
          prior_stage_presentation_version_id: null,
          reason: "NO_COMPLETED_PREREQUISITE",
          next_action: "complete_first_contact",
        },
        {
          journey_stage: "concretisation",
          startable: false,
          prerequisite_stage: "deepening",
          prior_stage_presentation_version_id: null,
          reason: "NO_COMPLETED_PREREQUISITE",
          next_action: "complete_deepening",
        },
      ],
    }),
    "first_contact",
  );
});

const FRAMEWORK: FrameworkVersionResponse = {
  id: "fw-2",
  opportunity_id: "opp-1",
  version_number: 2,
  status: "in_review",
  created_by: "user-1",
  created_at: "2026-09-24T10:00:00Z",
  framework_json: {
    schema_version: "1.0",
    opportunity_id: "opp-1",
    title: "Story",
    department: "Finance",
    status: "in_review",
    priority_rank: null,
    quality_scores: {
      opportunity_rating: 4,
      conversation_quality: 4,
      build_readiness: 4,
      rationale: {},
    },
    kpis: [],
    systems: [],
    rules: [],
    exceptions: [],
    access_needs: [],
    evolution_stages: [],
    open_items: [],
    chapters: [],
    version: 2,
    generated_from: [],
    previous_version_id: null,
    change_log: [],
    created_at: "2026-09-24T10:00:00Z",
    updated_at: "2026-09-24T10:00:00Z",
  },
};

function frameworkJob(status: ActiveJobResponse["status"]): ActiveJobResponse {
  return {
    job_id: "fw-job-1",
    job_type: "framework_generation",
    status,
    current_stage: status === "COMPLETED" ? "COMPLETED" : "FRAMEWORK_SYNTHESIZING",
    started_at: "2026-09-24T10:00:00Z",
    error:
      status === "FAILED"
        ? {
            code: "FRAMEWORK_GENERATION_FAILED",
            message: "Synthesis failed",
            stage: "FRAMEWORK_SYNTHESIZING",
            retryable: true,
          }
        : null,
  };
}

function completedFrameworkJob(): JobResponse {
  return {
    ...frameworkJob("COMPLETED"),
    created_at: "2026-09-24T10:00:00Z",
    completed_at: "2026-09-24T10:01:00Z",
    result: { framework_version_id: FRAMEWORK.id },
    error: null,
  };
}

function mockApi(overrides: Partial<Stage2PrepareApi> = {}): Stage2PrepareApi {
  return {
    async getLatestPresentation() {
      throw new ApiRequestError("missing", 404, "PRESENTATION_NOT_FOUND");
    },
    async getPresentationPlan() {
      throw new ApiRequestError("missing", 404, "PRESENTATION_PLAN_NOT_FOUND");
    },
    async getLatestFramework() {
      return FRAMEWORK;
    },
    async getActiveFrameworkJob() {
      return null;
    },
    async getFrameworkJob() {
      return completedFrameworkJob();
    },
    async waitForFrameworkJob() {
      return completedFrameworkJob();
    },
    async startFrameworkGeneration() {
      throw new Error("must not start framework generation");
    },
    async runPresentationPipeline() {
      return {
        frameworkVersionId: FRAMEWORK.id,
        planningJobId: "plan-job",
        presentationPlanId: "plan-2",
        presentationGenerationJobId: "gen-job",
        presentationId: "pres-2",
        presentationVersionId: "ver-2",
      };
    },
    ...overrides,
  };
}

test("presentationReadyForFramework is false for an older Stage 1 deck", async () => {
  const ready = await presentationReadyForFramework(
    {
      async getLatestPresentation() {
        return {
          id: "pres-1",
          presentation_plan_id: "plan-1",
          name: "Stage 1",
          status: "ready",
          created_at: "2026-09-01T10:00:00Z",
        };
      },
      async getPresentationPlan() {
        return {
          id: "plan-1",
          framework_version_id: "fw-1",
          plan_json: { schema_version: "1.0", title: "Old", slides: [] },
          created_at: "2026-09-01T10:00:00Z",
        } satisfies PresentationPlanResponse;
      },
    },
    FRAMEWORK.id,
  );
  assert.equal(ready, false);
});

test("presentationReadyForFramework is true when the latest deck matches this Framework", async () => {
  const ready = await presentationReadyForFramework(
    {
      async getLatestPresentation() {
        return {
          id: "pres-2",
          presentation_plan_id: "plan-2",
          name: "Stage 2",
          status: "ready",
          created_at: "2026-09-24T10:02:00Z",
        };
      },
      async getPresentationPlan() {
        return {
          id: "plan-2",
          framework_version_id: FRAMEWORK.id,
          plan_json: { schema_version: "1.0", title: "New", slides: [] },
          created_at: "2026-09-24T10:02:00Z",
        } satisfies PresentationPlanResponse;
      },
    },
    FRAMEWORK.id,
  );
  assert.equal(ready, true);
});

test("ensureStage2Framework waits for an in-flight framework job before using an older version", async () => {
  const events: string[] = [];
  let frameworkReady = false;
  const framework = await ensureStage2Framework(
    mockApi({
      async getActiveFrameworkJob() {
        events.push("active");
        return frameworkJob("RUNNING");
      },
      async waitForFrameworkJob(jobId) {
        events.push(`wait:${jobId}`);
        frameworkReady = true;
        return completedFrameworkJob();
      },
      async getLatestFramework() {
        events.push("load");
        if (!frameworkReady) {
          return { ...FRAMEWORK, id: "fw-1" };
        }
        return FRAMEWORK;
      },
    }),
    () => undefined,
  );
  assert.equal(framework.id, FRAMEWORK.id);
  assert.deepEqual(events, ["active", "wait:fw-job-1", "load"]);
});

test("ensureStage2Framework starts generation when no Framework exists yet", async () => {
  const events: string[] = [];
  let created = false;
  const framework = await ensureStage2Framework(
    mockApi({
      async getLatestFramework() {
        if (!created) {
          throw new ApiRequestError("missing", 404, "FRAMEWORK_NOT_FOUND");
        }
        return FRAMEWORK;
      },
      async startFrameworkGeneration() {
        events.push("start");
        created = true;
        return { job_id: "fw-job-1" };
      },
      async getFrameworkJob(jobId) {
        events.push(`job:${jobId}`);
        return {
          ...frameworkJob("RUNNING"),
          created_at: "2026-09-24T10:00:00Z",
          completed_at: null,
          result: {},
        };
      },
      async waitForFrameworkJob(jobId) {
        events.push(`wait:${jobId}`);
        return completedFrameworkJob();
      },
    }),
    () => undefined,
  );
  assert.equal(framework.id, FRAMEWORK.id);
  assert.deepEqual(events, ["start", "job:fw-job-1", "wait:fw-job-1"]);
});

test("runStage2SlidePrepare generates a new deck when only a prior-stage presentation exists", async () => {
  let pipelineCalls = 0;
  const outcome = await runStage2SlidePrepare(
    mockApi({
      async getLatestPresentation() {
        return {
          id: "pres-1",
          presentation_plan_id: "plan-1",
          name: "Stage 1",
          status: "ready",
          created_at: "2026-09-01T10:00:00Z",
        };
      },
      async getPresentationPlan() {
        return {
          id: "plan-1",
          framework_version_id: "fw-1",
          plan_json: { schema_version: "1.0", title: "Old", slides: [] },
          created_at: "2026-09-01T10:00:00Z",
        };
      },
      async runPresentationPipeline() {
        pipelineCalls += 1;
        return {
          frameworkVersionId: FRAMEWORK.id,
          planningJobId: "plan-job",
          presentationPlanId: "plan-2",
          presentationGenerationJobId: "gen-job",
          presentationId: "pres-2",
          presentationVersionId: "ver-2",
        };
      },
    }),
  );
  assert.equal(pipelineCalls, 1);
  assert.equal(outcome.presentationId, "pres-2");
  assert.equal(outcome.presentationVersionId, "ver-2");
});

test("runStage2SlidePrepare reuses this Framework's deck and still returns review ids", async () => {
  let pipelineCalls = 0;
  const outcome = await runStage2SlidePrepare(
    mockApi({
      async getLatestPresentation() {
        return {
          id: "pres-2",
          presentation_plan_id: "plan-2",
          name: "Stage 2",
          status: "ready",
          created_at: "2026-09-24T10:02:00Z",
        };
      },
      async getPresentationPlan() {
        return {
          id: "plan-2",
          framework_version_id: FRAMEWORK.id,
          plan_json: { schema_version: "1.0", title: "New", slides: [] },
          created_at: "2026-09-24T10:02:00Z",
        };
      },
      async runPresentationPipeline() {
        pipelineCalls += 1;
        throw new Error("must not generate");
      },
    }),
  );
  assert.equal(pipelineCalls, 0);
  assert.equal(outcome.presentationId, "pres-2");
});

test("ensureStage2Framework surfaces a failed framework job", async () => {
  await assert.rejects(
    () =>
      ensureStage2Framework(
        mockApi({
          async getActiveFrameworkJob() {
            return frameworkJob("FAILED");
          },
        }),
        () => undefined,
      ),
    (error: unknown) =>
      error instanceof PresentationPipelineError &&
      error.code === "FRAMEWORK_GENERATION_FAILED" &&
      error.retryable === true,
  );
});
