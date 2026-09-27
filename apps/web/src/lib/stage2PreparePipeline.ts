import type { ActiveJobResponse, JobResponse, JourneyStageEligibilityResponse, JourneyStageName } from "./api";
import {
  confirmFramework,
  generateFramework,
  generatePresentationPlan,
  getActiveJob,
  getJob,
  getJourneyStageEligibility,
  getLatestFramework,
  getLatestPresentation,
  getLatestPresentationPlan,
  getPresentation,
  getPresentationPlan,
  waitForJob,
} from "./api";
import { isMissingFrameworkError, isMissingPresentationError, isMissingPresentationPlanError } from "./apiErrors";
import { isFrameworkConfirmed } from "./frameworkEdit";
import type { FrameworkVersionResponse } from "./frameworkTypes";
import { journeyStageForGenerate, saveSelectedJourneyStage } from "./journeyStageSelection";
import {
  snapshotFromActiveJob,
  snapshotFromJob,
  type JobProgressSnapshot,
} from "./jobProgress";
import { isMonitorableJobStatus } from "./jobReconnect";
import type { PresentationPipelineProgress } from "./presentationPipeline";
import {
  approveAndBuildPresentation,
  buildPresentationPipeline,
  PresentationPipelineError,
  recoverPresentationPipeline,
  type PresentationPipelineApi,
  type PresentationPipelineResult,
} from "./presentationPipeline";

export function pitchReviewResultHref(
  opportunityId: string,
  result: Pick<PresentationPipelineResult, "presentationId"> & {
    presentationVersionId?: string;
  },
): string {
  const params = new URLSearchParams({
    opportunityId,
    presentationId: result.presentationId,
  });
  if (result.presentationVersionId?.trim()) {
    params.set("presentationVersionId", result.presentationVersionId);
  }
  return `/pitch-review?${params.toString()}`;
}

export interface Stage2PrepareProgress {
  frameworkJob: JobProgressSnapshot | null;
  pipelineHandoff: boolean;
  plannedSlideCount: number | null;
  pipelineJob: JobProgressSnapshot | null;
}

export interface Stage2PrepareApi {
  getLatestPresentation(): ReturnType<typeof getLatestPresentation>;
  getPresentationPlan(presentationPlanId: string): ReturnType<typeof getPresentationPlan>;
  getLatestFramework(): Promise<FrameworkVersionResponse>;
  getActiveFrameworkJob(): Promise<ActiveJobResponse | null>;
  getFrameworkJob(jobId: string): Promise<JobResponse>;
  waitForFrameworkJob(jobId: string, onJobUpdate?: (job: JobResponse) => void): Promise<JobResponse>;
  startFrameworkGeneration(): Promise<{ job_id: string }>;
  runPresentationPipeline(framework: FrameworkVersionResponse): Promise<PresentationPipelineResult>;
}

function frameworkConfirmed(framework: FrameworkVersionResponse): boolean {
  return (
    isFrameworkConfirmed(framework.status) ||
    isFrameworkConfirmed(framework.framework_json.status)
  );
}

function isFrameworkJobType(jobType: string): boolean {
  return jobType === "framework_generation" || jobType === "framework_regenerate_chapter";
}

function frameworkJobError(
  job: Pick<ActiveJobResponse, "job_id" | "status" | "error">,
): PresentationPipelineError {
  return new PresentationPipelineError(
    "confirmation",
    job.error?.message ?? "The customer story could not be finished.",
    {
      code: job.error?.code ?? "FRAMEWORK_GENERATION_FAILED",
      stage: job.error?.stage,
      retryable: job.error?.retryable ?? true,
      jobId: job.job_id,
    },
  );
}

function mapPipelineProgress(
  progress: PresentationPipelineProgress,
  onProgress: (update: Stage2PrepareProgress) => void,
  current: Stage2PrepareProgress,
): Stage2PrepareProgress {
  if (progress.state === "handoff") {
    const next = { ...current, pipelineHandoff: true };
    onProgress(next);
    return next;
  }
  if (progress.state === "running") {
    const next = {
      ...current,
      pipelineHandoff: false,
      pipelineJob: progress.job,
    };
    onProgress(next);
    return next;
  }
  if (progress.state === "completed" && progress.phase === "planning") {
    const next = {
      ...current,
      plannedSlideCount: progress.plannedSlideCount,
      pipelineHandoff: false,
    };
    onProgress(next);
    return next;
  }
  return current;
}

export function stage2JourneyStage(
  eligibility: JourneyStageEligibilityResponse | null,
  selected?: JourneyStageName,
): JourneyStageName {
  const startable = new Set(
    (eligibility?.stages ?? [])
      .filter((row) => row.startable)
      .map((row) => row.journey_stage),
  );
  if (selected && (startable.size === 0 || startable.has(selected))) {
    return selected;
  }
  if (startable.has("deepening")) {
    return "deepening";
  }
  if (startable.has("concretisation")) {
    return "concretisation";
  }
  if (startable.has("first_contact")) {
    return "first_contact";
  }
  return selected ?? "deepening";
}

export async function presentationForFramework(
  api: Pick<Stage2PrepareApi, "getLatestPresentation" | "getPresentationPlan">,
  frameworkVersionId: string,
): Promise<{ id: string; presentation_plan_id: string } | null> {
  try {
    const presentation = await api.getLatestPresentation();
    const plan = await api.getPresentationPlan(presentation.presentation_plan_id);
    if (plan.framework_version_id !== frameworkVersionId) {
      return null;
    }
    return { id: presentation.id, presentation_plan_id: presentation.presentation_plan_id };
  } catch (loadError) {
    if (isMissingPresentationError(loadError) || isMissingPresentationPlanError(loadError)) {
      return null;
    }
    throw loadError;
  }
}

export async function presentationReadyForFramework(
  api: Pick<Stage2PrepareApi, "getLatestPresentation" | "getPresentationPlan">,
  frameworkVersionId: string,
): Promise<boolean> {
  return Boolean(await presentationForFramework(api, frameworkVersionId));
}

async function settleFrameworkJob(
  api: Pick<Stage2PrepareApi, "getFrameworkJob" | "waitForFrameworkJob">,
  job: Pick<ActiveJobResponse, "job_id" | "job_type" | "status" | "error" | "current_stage" | "started_at">,
  onProgress: (update: Stage2PrepareProgress) => void,
  current: Stage2PrepareProgress,
): Promise<Stage2PrepareProgress> {
  if (!isFrameworkJobType(job.job_type)) {
    return current;
  }
  if (job.status === "FAILED") {
    throw frameworkJobError(job);
  }
  if (!isMonitorableJobStatus(job.status)) {
    return current;
  }
  let progress: Stage2PrepareProgress = {
    ...current,
    frameworkJob: snapshotFromActiveJob({
      job_id: job.job_id,
      job_type: job.job_type,
      status: job.status,
      current_stage: job.current_stage,
      started_at: job.started_at,
      error: job.error,
    }),
  };
  onProgress(progress);
  const completed = await api.waitForFrameworkJob(job.job_id, (next) => {
    progress = { ...progress, frameworkJob: snapshotFromJob(next) };
    onProgress(progress);
  });
  if (completed.status === "FAILED") {
    throw frameworkJobError(completed);
  }
  return progress;
}

export async function ensureStage2Framework(
  api: Stage2PrepareApi,
  onProgress: (update: Stage2PrepareProgress) => void,
  preferredJobId?: string,
): Promise<FrameworkVersionResponse> {
  let progress: Stage2PrepareProgress = {
    frameworkJob: null,
    pipelineHandoff: false,
    plannedSlideCount: null,
    pipelineJob: null,
  };

  if (preferredJobId?.trim()) {
    const preferred = await api.getFrameworkJob(preferredJobId.trim());
    progress = await settleFrameworkJob(api, preferred, onProgress, progress);
  } else {
    const active = await api.getActiveFrameworkJob();
    if (active) {
      progress = await settleFrameworkJob(api, active, onProgress, progress);
    }
  }

  try {
    return await api.getLatestFramework();
  } catch (loadError) {
    if (!isMissingFrameworkError(loadError)) {
      throw loadError;
    }
  }

  const started = await api.startFrameworkGeneration();
  const startedJob = await api.getFrameworkJob(started.job_id);
  progress = await settleFrameworkJob(api, startedJob, onProgress, progress);

  try {
    return await api.getLatestFramework();
  } catch (loadError) {
    if (!isMissingFrameworkError(loadError)) {
      throw loadError;
    }
  }

  throw new PresentationPipelineError(
    "confirmation",
    "The customer story is still being prepared. Try again in a moment.",
    { code: "FRAMEWORK_NOT_READY", retryable: true },
  );
}

export function createStage2PrepareApi(
  accessToken: string,
  opportunityId: string,
  onProgress: (update: Stage2PrepareProgress) => void,
): Stage2PrepareApi {
  let progressState: Stage2PrepareProgress = {
    frameworkJob: null,
    pipelineHandoff: false,
    plannedSlideCount: null,
    pipelineJob: null,
  };

  const presentationPipelineApi: PresentationPipelineApi = {
    getActivePresentationJob: () => getActiveJob(accessToken, opportunityId, "presentation"),
    getJob: (jobId) => getJob(accessToken, jobId),
    waitForJob: (jobId, onJobUpdate) =>
      waitForJob(accessToken, jobId, {
        onProgress: (job) => {
          onJobUpdate?.(job);
        },
      }),
    generatePresentationPlan: async (frameworkVersionId, autoContinue) => {
      let eligibility: JourneyStageEligibilityResponse | null = null;
      try {
        eligibility = await getJourneyStageEligibility(accessToken, opportunityId, "deepening");
      } catch {
        eligibility = null;
      }
      const journeyStage = stage2JourneyStage(eligibility, journeyStageForGenerate(opportunityId));
      saveSelectedJourneyStage(journeyStage, opportunityId);
      return generatePresentationPlan(
        accessToken,
        opportunityId,
        frameworkVersionId,
        autoContinue,
        journeyStage,
      );
    },
    getLatestPresentationPlan: () => getLatestPresentationPlan(accessToken, opportunityId),
    getPresentationPlan: (presentationPlanId) =>
      getPresentationPlan(accessToken, presentationPlanId),
    getPresentation: (presentationId) => getPresentation(accessToken, presentationId),
  };

  async function runPresentationPipeline(
    framework: FrameworkVersionResponse,
  ): Promise<PresentationPipelineResult> {
    const onPipelineProgress = (pipelineProgress: PresentationPipelineProgress) => {
      progressState = mapPipelineProgress(pipelineProgress, onProgress, progressState);
    };

    const recovery = await recoverPresentationPipeline({
      frameworkVersionId: framework.id,
      api: presentationPipelineApi,
      onProgress: onPipelineProgress,
    });
    if (recovery.state === "completed") {
      return recovery.result;
    }

    if (frameworkConfirmed(framework)) {
      return buildPresentationPipeline({
        frameworkVersionId: framework.id,
        api: presentationPipelineApi,
        onProgress: onPipelineProgress,
        resumeFailedGeneration: false,
      });
    }

    return approveAndBuildPresentation({
      alreadyConfirmed: false,
      frameworkVersionId: framework.id,
      confirmFramework: async () => {
        const confirmed = await confirmFramework(accessToken, opportunityId, framework.id);
        return { id: confirmed.id, status: confirmed.status };
      },
      api: presentationPipelineApi,
      onProgress: onPipelineProgress,
      resumeFailedGeneration: false,
    });
  }

  return {
    getLatestPresentation: () => getLatestPresentation(accessToken, opportunityId),
    getPresentationPlan: (presentationPlanId) => getPresentationPlan(accessToken, presentationPlanId),
    getLatestFramework: () => getLatestFramework(accessToken, opportunityId),
    getActiveFrameworkJob: () => getActiveJob(accessToken, opportunityId, "framework"),
    getFrameworkJob: (jobId) => getJob(accessToken, jobId),
    waitForFrameworkJob: (jobId, onJobUpdate) =>
      waitForJob(accessToken, jobId, {
        onProgress: (job) => {
          onJobUpdate?.(job);
        },
      }),
    startFrameworkGeneration: () => generateFramework(accessToken, opportunityId),
    runPresentationPipeline,
  };
}

export async function runStage2SlidePrepare(
  api: Stage2PrepareApi,
  onProgress: (update: Stage2PrepareProgress) => void = () => undefined,
  options: { frameworkJobId?: string } = {},
): Promise<Pick<PresentationPipelineResult, "presentationId" | "presentationVersionId">> {
  const framework = await ensureStage2Framework(api, onProgress, options.frameworkJobId);
  const existing = await presentationForFramework(api, framework.id);
  if (existing) {
    return { presentationId: existing.id, presentationVersionId: "" };
  }
  const result = await api.runPresentationPipeline(framework);
  return {
    presentationId: result.presentationId,
    presentationVersionId: result.presentationVersionId,
  };
}
