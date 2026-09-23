import { getDeckCenter, getLatestPresentation } from "./api";
import { isMissingPresentationError, isPresentationNotReadyError } from "./apiErrors";
import { FIRST_CONTACT_SLIDE_COUNT } from "./stageOutputArtifacts";

export interface VerifiedFirstMeetingPresentation {
  presentationId: string;
  slideCount: number;
  profile: "first_meeting_3_slide";
}

/** BT-36 first-meeting profile requires exactly three slides. */
export function matchesFirstMeetingSlideProfile(slideCount: number): boolean {
  return slideCount === FIRST_CONTACT_SLIDE_COUNT;
}

/**
 * Resolve a presentation that matches the first_meeting_3_slide profile.
 * Returns null when the latest deck cannot be verified — e.g. deepening decks
 * with a different slide count, or presentations that are not ready yet.
 */
export async function resolveVerifiedFirstMeetingPresentation(
  accessToken: string,
  opportunityId: string,
): Promise<VerifiedFirstMeetingPresentation | null> {
  try {
    const presentation = await getLatestPresentation(accessToken, opportunityId);
    if (!presentation.id) {
      return null;
    }

    try {
      const deck = await getDeckCenter(accessToken, presentation.id);
      const slideCount = deck.slides.length;
      if (!matchesFirstMeetingSlideProfile(slideCount)) {
        return null;
      }
      return {
        presentationId: presentation.id,
        slideCount,
        profile: "first_meeting_3_slide",
      };
    } catch (caught) {
      if (isPresentationNotReadyError(caught) || isMissingPresentationError(caught)) {
        return null;
      }
      return null;
    }
  } catch (caught) {
    if (isMissingPresentationError(caught)) {
      return null;
    }
    return null;
  }
}
