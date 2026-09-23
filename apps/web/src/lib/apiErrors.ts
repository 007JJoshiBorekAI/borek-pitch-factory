import { ApiRequestError } from "./api";

export function isMissingOpportunityError(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) {
    return false;
  }
  return error.status === 404 || error.code === "NOT_FOUND" || error.code === "OPPORTUNITY_NOT_FOUND";
}

export function isMissingFrameworkError(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) {
    return false;
  }
  return error.status === 404 || error.code === "FRAMEWORK_NOT_FOUND";
}

export function isMissingPresentationPlanError(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) {
    return false;
  }
  return error.status === 404 || error.code === "PRESENTATION_PLAN_NOT_FOUND";
}

export function isMissingPresentationError(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) {
    return false;
  }
  return error.status === 404 || error.code === "PRESENTATION_NOT_FOUND";
}

export function isMissingActiveJobError(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) {
    return false;
  }
  return error.status === 404 || error.code === "ACTIVE_JOB_NOT_FOUND";
}

export function isPresentationNotReadyError(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) {
    return false;
  }
  return error.code === "PRESENTATION_NOT_READY";
}

export function isDeckFileMissingError(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) {
    return false;
  }
  return error.status === 404 || error.code === "DECK_FILE_NOT_FOUND" || error.code === "SLIDE_PREVIEW_NOT_FOUND";
}

export function isMissingClientLogoError(error: unknown): boolean {
  return error instanceof ApiRequestError &&
    (error.status === 404 || error.code === "CLIENT_LOGO_NOT_FOUND");
}

function isNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof Error &&
      /failed to fetch|networkerror|network request failed|load failed/i.test(error.message))
  );
}

export function opportunityErrorMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return "The connection was interrupted. Check your network and try creating the opportunity again.";
  }
  if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
    return "Your session could not be verified. Sign in again and retry.";
  }
  if (error instanceof ApiRequestError && error.status === 400) {
    return "Check the opportunity details and try again.";
  }
  return "The opportunity could not be created. Try again or contact support if this continues.";
}

export function uploadErrorMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return "Upload interrupted. Check your connection and try this file again.";
  }
  if (error instanceof ApiRequestError) {
    if (error.status === 401 || error.status === 403) {
      return "Your session could not be verified. Sign in again before uploading.";
    }
    if (error.status === 413) {
      return "This file is too large to upload.";
    }
    if (error.code === "INVALID_TRANSCRIPT_FORMAT") {
      return "This file format is not supported. Use TXT, VTT, SRT, or DOCX.";
    }
    if (error.code === "INVALID_TRANSCRIPT_CONTENT") {
      return "This transcript could not be read. Check the file contents and try again.";
    }
  }
  return "This transcript could not be uploaded. Remove it and try again.";
}

export function isStage1VoiceUnavailableError(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "STAGE1_VOICE_UNAVAILABLE";
}

export function stage1IntakeErrorMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return "The connection was interrupted. Check your network and try saving again.";
  }
  if (error instanceof ApiRequestError) {
    if (error.status === 401 || error.status === 403) {
      return "Your session could not be verified. Sign in again and retry.";
    }
    if (error.status === 422) {
      return "Check the pre-meeting fields and try again.";
    }
  }
  return "Pre-meeting information could not be saved. Try again or contact support if this continues.";
}

export function isMissingClientDocumentError(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    (error.status === 404 || error.code === "CLIENT_DOCUMENT_NOT_FOUND")
  );
}

export function isClientDocumentEndpointUnavailable(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) {
    return false;
  }
  if (error.status === 503) {
    return true;
  }
  // Route missing (BT-35 not deployed) vs a single document that no longer exists.
  return error.status === 404 && error.code !== "CLIENT_DOCUMENT_NOT_FOUND";
}

export function clientDocumentErrorMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return "Upload interrupted. Check your connection and try again.";
  }
  if (error instanceof ApiRequestError) {
    if (error.status === 401 || error.status === 403) {
      return "Your session could not be verified. Sign in again before uploading documents.";
    }
    if (error.code === "INVALID_CLIENT_DOCUMENT_FORMAT") {
      return "Use a PDF, DOCX, or TXT client document.";
    }
    if (error.code === "INVALID_CLIENT_DOCUMENT_CONTENT") {
      return "This document is empty or could not be read. Choose another file.";
    }
    if (error.code === "CLIENT_DOCUMENT_TOO_LARGE") {
      return "Each client document must be 10 MB or smaller.";
    }
    if (error.code === "CLIENT_DOCUMENT_NOT_FOUND") {
      return "This document is no longer available. Refresh the list and try again.";
    }
    if (error.status === 404 || error.status === 503) {
      return "Client document upload is not available on this server yet.";
    }
  }
  return "This client document could not be uploaded. Remove it and try again.";
}

export function stage1VoiceErrorMessage(error: unknown): string {
  if (isStage1VoiceUnavailableError(error)) {
    return "Voice transcription is not available yet. Save your text description instead.";
  }
  if (isNetworkError(error)) {
    return "Voice upload was interrupted. Check your connection and try again.";
  }
  if (error instanceof ApiRequestError) {
    if (error.status === 401 || error.status === 403) {
      return "Your session could not be verified. Sign in again before uploading a recording.";
    }
  }
  return "This recording could not be processed. You can continue with text only.";
}

export function isJourneyOutputsEndpointUnavailable(error: unknown): boolean {
  if (!(error instanceof ApiRequestError)) {
    return false;
  }
  if (error.status === 503) {
    return true;
  }
  return error.status === 404 && !isDocumentedJourneyOutputsError(error);
}

export function isDocumentedJourneyOutputsError(error: unknown): boolean {
  if (!(error instanceof ApiRequestError) || !error.code) {
    return false;
  }
  return (
    error.code === "CLIENT_DOCUMENT_REQUIRED" ||
    error.code === "TRANSCRIPT_REQUIRED" ||
    error.code === "INVALID_JOURNEY_STAGE" ||
    error.code === "INVALID_EMAIL_LENGTH" ||
    error.code === "EMAIL_SEND_FORBIDDEN" ||
    error.code === "EMAIL_DRAFT_NOT_FOUND"
  );
}

export function isMissingEmailDraftError(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "EMAIL_DRAFT_NOT_FOUND";
}

export function journeyOutputsErrorMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return "The connection was interrupted. Check your network and try again.";
  }
  if (error instanceof ApiRequestError) {
    if (error.status === 401 || error.status === 403) {
      return "Your session could not be verified. Sign in again and retry.";
    }
    switch (error.code) {
      case "CLIENT_DOCUMENT_REQUIRED":
        return "Upload and process at least one client document before generating First Contact outputs.";
      case "TRANSCRIPT_REQUIRED":
        return "Upload a meeting transcript before generating Deepening outputs or email drafts.";
      case "INVALID_JOURNEY_STAGE":
        return "This journey stage is not supported for that request.";
      case "INVALID_EMAIL_LENGTH":
        return "Choose short, medium, or extensive before confirming the email draft.";
      case "EMAIL_SEND_FORBIDDEN":
        return "Sending email from this application is not permitted. Confirm review only.";
      case "EMAIL_DRAFT_NOT_FOUND":
        return "No email draft exists for this opportunity yet. Generate a draft first.";
      default:
        if (error.status === 404 || error.status === 503) {
          return "Stage output APIs are not available on this server yet.";
        }
    }
  }
  return "This request could not be completed. Try again or contact support if this continues.";
}

export function clientLogoErrorMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return "Logo upload was interrupted. Check your connection and try again.";
  }
  if (error instanceof ApiRequestError) {
    if (error.status === 401 || error.status === 403) {
      return "Your session could not be verified. Sign in again before uploading the logo.";
    }
    if (error.code === "INVALID_CLIENT_LOGO_FORMAT") {
      return "Use a PNG, JPEG, or WebP client logo.";
    }
    if (error.code === "INVALID_CLIENT_LOGO_CONTENT") {
      return "This image could not be read. Choose another PNG, JPEG, or WebP logo.";
    }
    if (error.code === "CLIENT_LOGO_TOO_LARGE") {
      return "The client logo must be 5 MiB or smaller.";
    }
    if (error.code === "CLIENT_LOGO_DIMENSIONS_INVALID") {
      return "Use a logo between 64 and 4096 pixels in both width and height.";
    }
  }
  return "The client logo could not be saved. Try again or continue without it.";
}
