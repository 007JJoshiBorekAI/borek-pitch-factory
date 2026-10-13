import { presentationSource, type PreviewOpportunity } from "./previewJourney";

export function previewMeetingStorageKey(ownerId: string, opportunityId: string) {
  return `borek-preview-meeting-v1:${encodeURIComponent(ownerId)}:${encodeURIComponent(opportunityId)}`;
}

export function canCompletePreviewMeeting(opportunity: PreviewOpportunity | null) {
  return Boolean(opportunity?.client.source === "fixture" && opportunity.presentation.state === "ready" &&
    opportunity.presentation.version_id && opportunity.presentation.slide_count === 7 && presentationSource(opportunity));
}

export function readPreviewMeetingCompletion(
  storage: Pick<Storage, "getItem">, ownerId: string | null, opportunityId: string, previewMode: boolean,
) {
  return Boolean(previewMode && ownerId && storage.getItem(previewMeetingStorageKey(ownerId, opportunityId)) === "completed");
}

export function completePreviewMeetingAndGetRoute(
  storage: Pick<Storage, "getItem" | "setItem">, ownerId: string | null,
  opportunity: PreviewOpportunity | null, previewMode: boolean,
) {
  if (!previewMode || !ownerId || !opportunity || opportunity.client.source !== "fixture") {
    throw new Error("Local meeting completion is available only for a preview pitch and its signed-in preview owner.");
  }
  const id = opportunity.opportunity_id;
  if (!readPreviewMeetingCompletion(storage, ownerId, id, previewMode)) {
    if (!canCompletePreviewMeeting(opportunity)) throw new Error("Finish all seven preview PPT #1 slides before confirming the meeting.");
    storage.setItem(previewMeetingStorageKey(ownerId, id), "completed");
    if (!readPreviewMeetingCompletion(storage, ownerId, id, previewMode)) {
      throw new Error("The preview confirmation could not be saved in this browser. Allow local storage and retry.");
    }
  }
  return `/opportunities/${encodeURIComponent(id)}/meeting`;
}
