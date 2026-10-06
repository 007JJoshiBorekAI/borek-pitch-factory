import {
  ApiRequestError,
  generateStage1Outputs,
  getActiveJob,
  getJob,
  getStage1Outputs,
  getWorkflowStatus,
  waitForJob,
  type JobResponse,
  type Stage1OutputsEnvelope,
} from "./api";

export interface FirstPitchResult {
  presentationId: string;
  presentationVersionId: string;
  jobId: string | null;
}

function presentationOf(envelope: Stage1OutputsEnvelope) {
  return envelope.outputs?.presentation;
}

/**
 * Generate PPT #1 from the approved Discovery paper and poll until that deck is ready.
 * This uses the Stage 1 output path, not the retired intake-stamp presentation generate.
 */
export async function generateAndAwaitFirstPitch(
  accessToken: string,
  opportunityId: string,
  onJob?: (job: JobResponse) => void,
): Promise<FirstPitchResult> {
  const started = await generateStage1Outputs(accessToken, opportunityId);
  let presentation = presentationOf(started);
  let jobId: string | null = null;

  if (presentation?.status !== "ready") {
    const active = await getActiveJob(accessToken, opportunityId, "presentation");
    if (!active?.job_id) {
      throw new ApiRequestError(
        "PPT #1 generation did not return a job to poll.",
        409,
        "PPT1_NOT_READY",
      );
    }
    jobId = active.job_id;
    if (active.status === "COMPLETED") {
      onJob?.(await getJob(accessToken, active.job_id));
    } else {
      await waitForJob(accessToken, active.job_id, { onProgress: onJob });
    }
    presentation = presentationOf(await getStage1Outputs(accessToken, opportunityId));
  }

  const workflow = await getWorkflowStatus(accessToken, opportunityId);
  const ppt1 = workflow.documents?.ppt1;
  if (ppt1?.presentation_id && presentation?.presentation_id && ppt1.presentation_id !== presentation.presentation_id) {
    throw new ApiRequestError(
      "PPT #1 workflow identity does not match the generated presentation.",
      409,
      "PPT1_IDENTITY_MISMATCH",
    );
  }
  const presentationId = ppt1?.presentation_id || presentation?.presentation_id || "";
  const presentationVersionId = ppt1?.latest_ready_version_id || "";
  if (!presentationId || !presentationVersionId || presentation?.status === "failed") {
    throw new ApiRequestError(
      "PPT #1 generation finished without a ready version.",
      409,
      "PPT1_NOT_READY",
    );
  }
  return { presentationId, presentationVersionId, jobId };
}
