import type { JourneyStageName } from "./api";
import type { FollowupDraft, FollowupExtraction, FollowupProjectStatics } from "./followupReview";
import { renderFollowupDraft } from "./followupReview";
import { appendDemoQuery } from "./stageOutputReview";
import type { StageOutputArtifactId } from "./stageOutputArtifacts";

import workshopClear from "../../../../packages/contracts/fixtures/followup_extraction/workshop_clear.json";

export const EMAIL_REVIEW_JOURNEY_STAGE_QUERY = "journeyStage";

export interface StageEmailReviewContext {
  journeyStage: JourneyStageName;
  kicker: string;
  title: string;
  lead: string;
  sourceBadgeLabel: string | null;
  unsentNote: string;
  confirmHint: string;
  checklistIntro: string;
  draftUnavailableTitle: string;
  draftUnavailableMessage: string;
  staticsSavedInfoDemo: string;
  staticsSavedInfoLive: string;
  confirmReviewedMessage: string;
}

const STAGE_EMAIL_CONTEXT: Record<JourneyStageName, Omit<StageEmailReviewContext, "journeyStage" | "sourceBadgeLabel" | "staticsSavedInfoDemo" | "staticsSavedInfoLive" | "confirmReviewedMessage">> = {
  first_contact: {
    kicker: "Pre-meeting email",
    title: "Review the optional intro email",
    lead: "Optional note to the client before the first meeting. Confirm wording, names, and tone before anything reaches Outlook.",
    unsentNote:
      "Review only — no Outlook draft or client email has been created or sent from this screen.",
    confirmHint:
      "Confirmation never sends an email. BT-33 must persist an Outlook draft before this can become a live client send.",
    checklistIntro: "Confirm each statement before marking this email reviewed.",
    draftUnavailableTitle: "No live email draft yet",
    draftUnavailableMessage:
      "Stage 1 email drafts require BT-36 Phase 3 GET endpoints and BT-33 draft persistence. Project email settings can be saved now; a generated draft will appear here once the backend is available.",
  },
  deepening: {
    kicker: "Meeting follow-up",
    title: "Review the client email",
    lead: "Check the exact subject, wording, names, dates, and intended recipient before anything reaches Outlook.",
    unsentNote:
      "Review only — no Outlook draft or client email has been created or sent from this screen.",
    confirmHint:
      "Confirmation never sends an email. BT-33 must persist an Outlook draft before this can become a live client send.",
    checklistIntro: "Confirm each statement against the meeting before marking this email reviewed.",
    draftUnavailableTitle: "No live email draft yet",
    draftUnavailableMessage:
      "Post-meeting email drafts require BT-36 Stage 2 output GET endpoints and BT-33 draft persistence. Project email settings can be saved now; a generated draft will appear here once the backend is available.",
  },
  concretisation: {
    kicker: "Proposal follow-up",
    title: "Review the proposal follow-up email",
    lead: "Optional follow-up after sharing the proposal deck. Confirm wording before anything reaches Outlook.",
    unsentNote:
      "Review only — no Outlook draft or client email has been created or sent from this screen.",
    confirmHint:
      "Confirmation never sends an email. BT-33 must persist an Outlook draft before this can become a live client send.",
    checklistIntro: "Confirm each statement before marking this email reviewed.",
    draftUnavailableTitle: "No live email draft yet",
    draftUnavailableMessage:
      "Proposal follow-up email drafts require BT-36 Concretisation output GET endpoints and BT-33 draft persistence. Project email settings can be saved now; a generated draft will appear here once the backend is available.",
  },
};

export function parseEmailReviewJourneyStage(
  value: string | null | undefined,
): JourneyStageName {
  if (value === "first_contact" || value === "deepening" || value === "concretisation") {
    return value;
  }
  return "deepening";
}

export function journeyStageForEmailArtifact(artifactId: StageOutputArtifactId): JourneyStageName | null {
  switch (artifactId) {
    case "optional_email":
      return "first_contact";
    case "draft_email":
      return "deepening";
    case "proposal_followup_email":
      return "concretisation";
    default:
      return null;
  }
}

export function shouldShowConcretisationEmailReviewLink(
  journeyStage: JourneyStageName | undefined,
  presentationReady: boolean,
): boolean {
  return presentationReady && journeyStage === "concretisation";
}

export function followupReviewHref(
  opportunityId: string,
  journeyStage: JourneyStageName,
  demoMode: boolean,
): string {
  const base = `/followup-review?opportunityId=${encodeURIComponent(opportunityId)}&${EMAIL_REVIEW_JOURNEY_STAGE_QUERY}=${journeyStage}`;
  return appendDemoQuery(base, demoMode);
}

export function getStageEmailReviewContext(
  journeyStage: JourneyStageName,
  demoMode: boolean,
): StageEmailReviewContext {
  const base = STAGE_EMAIL_CONTEXT[journeyStage];
  return {
    journeyStage,
    ...base,
    sourceBadgeLabel: demoMode ? "MS-35 demonstration email" : null,
    staticsSavedInfoDemo: "Demonstration project settings applied. Review the labeled demonstration draft below.",
    staticsSavedInfoLive: "Project email settings saved. A live draft will appear here once BT-36 and BT-33 endpoints are available.",
    confirmReviewedMessage: demoMode
      ? "Demonstration email reviewed locally — not sent and not persisted on the server."
      : "Review recorded locally — not sent. Server-side approval requires BT-33 draft persistence.",
  };
}

export function demoFollowupProjectStatics(): FollowupProjectStatics {
  return {
    project_name: "Acme Invoice Pilot",
    client_short: "Acme",
    salutation_style: "informal",
    standard_recipients: [
      {
        email: "markus@example.com",
        first_name: "Markus",
        last_name: "Weber",
        salutation: "Mr",
        kind: "to",
        primary: true,
      },
    ],
    sender_profile: {
      name: "Lena Hoffmann",
      role: "Project Lead",
      email: "lena@borek.example",
    },
  };
}

function greeting(statics: FollowupProjectStatics): string {
  const recipient = statics.standard_recipients.find((row) => row.kind === "to" && row.primary);
  if (!recipient) {
    return "Hello,";
  }
  return statics.salutation_style === "formal"
    ? `Dear ${recipient.salutation ?? ""} ${recipient.last_name ?? ""},`.replace(/\s+/g, " ").trim()
    : `Hi ${recipient.first_name ?? recipient.email},`;
}

function renderFirstContactIntroDraft(statics: FollowupProjectStatics): FollowupDraft {
  const lines = [
    greeting(statics),
    "",
    `Ahead of our first session on ${statics.project_name}, I wanted to share a short note so we can use the time well.`,
    "",
    "We will walk through the agenda, confirm scope, and leave with clear next steps.",
    "",
    "If anything changes on your side before we meet, just reply to this thread.",
    "",
    "Best regards",
    statics.sender_profile.name,
    `${statics.sender_profile.role} - BOREK`,
  ];

  return {
    subject: `${statics.project_name} — Intro before our first meeting`,
    body: lines.join("\n"),
    review_flags: [],
    attachment_name: null,
    status: "draft",
  };
}

function renderConcretisationProposalDraft(statics: FollowupProjectStatics): FollowupDraft {
  const lines = [
    greeting(statics),
    "",
    `Thank you for reviewing the ${statics.project_name} proposal deck.`,
    "",
    "The attached summary captures scope, timeline, and the next decision points we discussed.",
    "",
    "Let me know if you would like any section clarified before we move to contract drafting.",
    "",
    "Best regards",
    statics.sender_profile.name,
    `${statics.sender_profile.role} - BOREK`,
  ];

  return {
    subject: `${statics.project_name} — Proposal follow-up`,
    body: lines.join("\n"),
    review_flags: ["proposal_scope"],
    attachment_name: `${statics.client_short}_proposal_summary.docx`,
    status: "draft",
  };
}

export function demoEmailDraftForStage(
  journeyStage: JourneyStageName,
  statics: FollowupProjectStatics,
): FollowupDraft {
  switch (journeyStage) {
    case "first_contact":
      return renderFirstContactIntroDraft(statics);
    case "deepening":
      return renderFollowupDraft(workshopClear as FollowupExtraction, statics);
    case "concretisation":
      return renderConcretisationProposalDraft(statics);
  }
}
