import type { FrameworkVersionResponse } from "./frameworkTypes";
import {
  confirmFramework,
  getActiveJob,
  getJob,
  getLatestFramework,
  getLatestPresentation,
  getLatestPresentationPlan,
  getPresentation,
  getPresentationPlan,
  generatePresentationPlan,
  waitForJob,
} from "./api";
import { isMissingFrameworkError, isMissingPresentationError } from "./apiErrors";
import { isFrameworkConfirmed } from "./frameworkEdit";
import { journeyStageForGenerate } from "./journeyStageSelection";
import {
  snapshotFromActiveJob,
  snapshotFromJob,
  type JobProgressSnapshot,
} from "./jobProgress";
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
  result: Pick<PresentationPipelineResult, "presentationId" | "presentationVersionId">,
): string {
  const params = new URLSearchParams({
    opportunityId,
    presentationId: result.presentationId,
    presentationVersionId: result.presentationVersionId,
  });
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
  ensureFramework(): Promise<FrameworkVersionResponse>;
  runPresentationPipeline(framework: FrameworkVersionResponse): Promise<PresentationPipelineResult>;
}

function frameworkConfirmed(framework: FrameworkVersionResponse): boolean {
  return (
    isFrameworkConfirmed(framework.status) ||
    isFrameworkConfirmed(framework.framework_json.status)
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
    generatePresentationPlan: (frameworkVersionId, autoContinue) =>
      generatePresentationPlan(
        accessToken,
        opportunityId,
        frameworkVersionId,
        autoContinue,
        journeyStageForGenerate(opportunityId),
      ),
    getLatestPresentationPlan: () => getLatestPresentationPlan(accessToken, opportunityId),
    getPresentationPlan: (presentationPlanId) =>
      getPresentationPlan(accessToken, presentationPlanId),
    getPresentation: (presentationId) => getPresentation(accessToken, presentationId),
  };

  async function ensureFramework(): Promise<FrameworkVersionResponse> {
    try {
      return await getLatestFramework(accessToken, opportunityId);
    } catch (loadError) {
      if (!isMissingFrameworkError(loadError)) {
        throw loadError;
      }
    }

    const active = await getActiveJob(accessToken, opportunityId, "framework");
    if (
      active &&
      (active.job_type === "framework_generation" || active.job_type === "framework_regenerate_chapter")
    ) {
      progressState = {
        ...progressState,
        frameworkJob: snapshotFromActiveJob(active),
      };
      onProgress(progressState);
      await waitForJob(accessToken, active.job_id, {
        onProgress: (job) => {
          progressState = { ...progressState, frameworkJob: snapshotFromJob(job) };
          onProgress(progressState);
        },
      });
      return getLatestFramework(accessToken, opportunityId);
    }

    throw new PresentationPipelineError(
      "confirmation",
      "The customer story is still being prepared. Try again in a moment.",
      { code: "FRAMEWORK_NOT_READY", retryable: true },
    );
  }

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
    });
  }

  return {
    getLatestPresentation: () => getLatestPresentation(accessToken, opportunityId),
    ensureFramework,
    runPresentationPipeline,
  };
}

export async function runStage2SlidePrepare(
  api: Stage2PrepareApi,
): Promise<PresentationPipelineResult | "already_ready"> {
  try {
    await api.getLatestPresentation();
    return "already_ready";
  } catch (loadError) {
    if (!isMissingPresentationError(loadError)) {
      throw loadError;
    }
  }

  const framework = await api.ensureFramework();
  const result = await api.runPresentationPipeline(framework);
  return result;
}
