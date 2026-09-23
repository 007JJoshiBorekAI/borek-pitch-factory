import type { JourneyStageName } from "./api";
import { confirmEmailDraft, generateEmailDraft, getEmailDraft } from "./api";
import { journeyOutputsErrorMessage } from "./apiErrors";
import type { EmailDraftLength } from "./journeyOutputsContracts";
import {
  adaptEmailDraftEnvelope,
  followupDraftFromEmailRecord,
  type AdaptedEmailDraftReview,
} from "./stageOutputsApiAdapter";
import type { FollowupDraft } from "./followupReview";

export function emailDraftErrorMessage(error: unknown): string {
  return journeyOutputsErrorMessage(error);
}

export async function fetchAdaptedEmailDraft(
  accessToken: string,
  opportunityId: string,
  journeyStage: JourneyStageName,
  preferredLength?: EmailDraftLength,
): Promise<AdaptedEmailDraftReview> {
  const envelope = await getEmailDraft(accessToken, opportunityId, journeyStage);
  return adaptEmailDraftEnvelope(envelope, preferredLength);
}

export async function generateAdaptedEmailDraft(
  accessToken: string,
  opportunityId: string,
  journeyStage: JourneyStageName,
  preferredLength?: EmailDraftLength,
): Promise<AdaptedEmailDraftReview> {
  const envelope = await generateEmailDraft(accessToken, opportunityId, { journey_stage: journeyStage });
  return adaptEmailDraftEnvelope(envelope, preferredLength);
}

export async function confirmAdaptedEmailDraft(
  accessToken: string,
  opportunityId: string,
  draftId: string,
  selectedLength: EmailDraftLength,
): Promise<AdaptedEmailDraftReview> {
  const envelope = await confirmEmailDraft(accessToken, opportunityId, draftId, {
    selected_length: selectedLength,
  });
  return adaptEmailDraftEnvelope(envelope, selectedLength);
}

export function panelDraftForAdaptedEmail(
  adapted: AdaptedEmailDraftReview,
  length: EmailDraftLength,
): FollowupDraft | null {
  if (!adapted.lengths || !adapted.draftId) {
    return null;
  }
  const variant = adapted.lengths[length];
  return {
    subject: variant.subject,
    body: variant.body,
    review_flags: [],
    attachment_name: null,
    status: adapted.serverConfirmed ? "reviewed" : "draft",
  };
}

export function applyPreferredEmailLength(
  adapted: AdaptedEmailDraftReview,
  length: EmailDraftLength,
): AdaptedEmailDraftReview {
  if (!adapted.lengths) {
    return adapted;
  }
  return {
    ...adapted,
    selectedLength: length,
    panelDraft: panelDraftForAdaptedEmail(adapted, length),
  };
}

export function hasLiveEmailDraft(adapted: AdaptedEmailDraftReview | null): boolean {
  return Boolean(adapted?.draftId && adapted.panelDraft);
}
