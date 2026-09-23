/**
 * Adapters: Mayank retrieval envelopes → MS-35 review-panel shapes.
 * Does not fabricate source_refs, prompt versions, or provenance absent from the API response.
 *
 * `prompt_version` on panel outputs is left empty for retrieval responses; the retrieval
 * envelope does not expose a generation prompt version. `RETRIEVAL_PROMPT_VERSION_UNAVAILABLE`
 * is listed in dependencies as presentation-only compatibility metadata.
 */

import type {
  EmailDraftEnvelope,
  EmailDraftLength,
  EmailLengthBody,
  Stage1OutputsEnvelope,
  Stage1OutputsPayload,
  Stage2OutputsEnvelope,
  Stage2OutputsPayload,
} from "./journeyOutputsContracts";
import type { FollowupDraft } from "./followupReview";
import type {
  ActionItem,
  MinutesOfMeeting,
  Stage2Outputs,
  Stage2PresentationRef,
  Stage2SummaryBlock,
  StatedItem,
  TranscriptSummaryRef,
} from "./stage2Contracts";
import type {
  DiscoveryQuestionCollection,
  MeetingAgenda,
  PresentationRef,
  Stage1Hypothesis,
  Stage1Outputs,
  Stage1Research,
  UseCaseCollection,
} from "./stage1Contracts";

export const STAGE1_OUTPUTS_NOT_GENERATED = "STAGE1_OUTPUTS_NOT_GENERATED";
export const STAGE2_OUTPUTS_NOT_GENERATED = "STAGE2_OUTPUTS_NOT_GENERATED";
export const FIRST_MEETING_PPT_UNFROZEN = "FIRST_MEETING_PPT_PROFILE_UNFROZEN";
export const DEEPENING_PPT_UNFROZEN = "DEEPENING_PRESENTATION_UNFROZEN";
/** Retrieval responses omit prompt_version; panels treat empty string as unavailable. */
export const RETRIEVAL_PROMPT_VERSION_UNAVAILABLE = "RETRIEVAL_PROMPT_VERSION_UNAVAILABLE";

export interface AdaptedStage1Review {
  envelopeStatus: Stage1OutputsEnvelope["status"];
  panelOutputs: Stage1Outputs | null;
  embeddedResearch: Stage1Research | null;
  dependencies: string[];
  presentationUnfrozen: boolean;
}

export interface AdaptedStage2Review {
  envelopeStatus: Stage2OutputsEnvelope["status"];
  panelOutputs: Stage2Outputs | null;
  dependencies: string[];
  presentationUnfrozen: boolean;
}

export interface AdaptedEmailDraftReview {
  draftId: string | null;
  journeyStage: EmailDraftEnvelope["journey_stage"];
  lengths: Record<EmailDraftLength, EmailLengthBody> | null;
  selectedLength: EmailDraftLength | null;
  serverStatus: "draft" | "confirmed" | null;
  sendStatus: "not_sent" | null;
  confirmedAt: string | null;
  /** Panel-compatible draft for the active or selected length only. */
  panelDraft: FollowupDraft | null;
  serverConfirmed: boolean;
}

function apiHypothesisToPanel(statement: string): Stage1Hypothesis {
  const text = statement.trim();
  return {
    status: text ? "generated" : "unknown",
    origin: "AI_INFERENCE",
    text: text || null,
    basis: [],
  };
}

function isStage1Research(value: unknown): value is Stage1Research {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.schema_version === "1.0" && typeof record.opportunity_id === "string";
}

function mergeResearchPayload(
  payload: Stage1OutputsPayload,
): Stage1Research | null {
  const embedded = payload.research;
  if (!isStage1Research(embedded)) {
    return null;
  }
  return {
    ...embedded,
    hypothesis: apiHypothesisToPanel(payload.hypothesis.statement),
    product_relevance: apiHypothesisToPanel(payload.product_relevance.statement),
  };
}

function adaptDiscoveryQuestions(
  questions: Stage1OutputsPayload["discovery_questions"],
): DiscoveryQuestionCollection {
  if (!questions.length) {
    return { status: "unknown", items: [] };
  }
  return {
    status: "generated",
    items: questions.map((item) => ({
      question_id: item.id,
      text: item.text,
      origin: "UNKNOWN" as const,
      status: "generated" as const,
    })),
  };
}

function adaptUseCases(useCases: Stage1OutputsPayload["use_cases"]): UseCaseCollection {
  if (!useCases.length) {
    return { status: "unknown", items: [] };
  }
  return {
    status: "generated",
    items: useCases.map((item) => ({
      use_case_id: item.title,
      title: item.title,
      relevance_summary: item.rationale || null,
      origin: "UNKNOWN" as const,
      status: item.availability === "matched" ? ("matched" as const) : ("unknown" as const),
    })),
  };
}

function adaptAgenda(agenda: Stage1OutputsPayload["agenda"]): MeetingAgenda {
  if (!agenda.items.length) {
    return { status: "unknown", origin: "UNKNOWN", items: [], source_refs: [] };
  }
  return {
    status: "generated",
    origin: "UNKNOWN",
    source_refs: [],
    items: agenda.items.map((item) => ({
      order: item.order,
      topic: item.label,
      duration_minutes: null,
      notes: null,
    })),
  };
}

function adaptStage1Presentation(
  presentation: Stage1OutputsPayload["presentation"],
): { ref: PresentationRef; unfrozen: boolean } {
  const unfrozen = presentation.status === "unfrozen";
  return {
    unfrozen,
    ref: {
      status: unfrozen ? "pending" : presentation.presentation_id ? "generated" : "unknown",
      profile: "first_meeting_3_slide",
      presentation_id: presentation.presentation_id,
      presentation_version_id: null,
    },
  };
}

function buildStage1Dependencies(
  payload: Stage1OutputsPayload,
  presentationUnfrozen: boolean,
): string[] {
  const deps: string[] = [RETRIEVAL_PROMPT_VERSION_UNAVAILABLE];
  if (presentationUnfrozen || payload.presentation.code === FIRST_MEETING_PPT_UNFROZEN) {
    deps.push(FIRST_MEETING_PPT_UNFROZEN);
  }
  if (!payload.research) {
    deps.push("COMPANY_RESEARCH_UNAVAILABLE");
  }
  return deps;
}

export function adaptStage1OutputsEnvelope(
  envelope: Stage1OutputsEnvelope,
): AdaptedStage1Review {
  if (envelope.status === "not_generated" || envelope.outputs === null) {
    return {
      envelopeStatus: envelope.status,
      panelOutputs: null,
      embeddedResearch: null,
      dependencies: [STAGE1_OUTPUTS_NOT_GENERATED],
      presentationUnfrozen: false,
    };
  }

  const payload = envelope.outputs;
  const { ref: presentationRef, unfrozen: presentationUnfrozen } =
    adaptStage1Presentation(payload.presentation);

  const panelOutputs: Stage1Outputs = {
    schema_version: "1.0",
    opportunity_id: envelope.opportunity_id,
    journey_stage: "first_contact",
    prompt_version: "",
    research_ref: {
      artifact_kind: "stage1_research",
      schema_version: "1.0",
      opportunity_id: envelope.opportunity_id,
      generated_at: payload.generated_at,
    },
    discovery_questions: adaptDiscoveryQuestions(payload.discovery_questions),
    use_cases: adaptUseCases(payload.use_cases),
    meeting_agenda: adaptAgenda(payload.agenda),
    presentation_ref: presentationRef,
    dependencies: buildStage1Dependencies(payload, presentationUnfrozen),
  };

  return {
    envelopeStatus: envelope.status,
    panelOutputs,
    embeddedResearch: mergeResearchPayload(payload),
    dependencies: panelOutputs.dependencies,
    presentationUnfrozen,
  };
}

function stringItemsToStatedItems(items: string[]): StatedItem[] {
  return items.map((text) => ({
    text,
    origin: "UNKNOWN" as const,
    source_refs: [],
    confidence: "unknown" as const,
  }));
}

function adaptMom(mom: Stage2OutputsPayload["mom"]): MinutesOfMeeting {
  const sections: MinutesOfMeeting["sections"] = [];
  if (mom.participants.length) {
    sections.push({
      heading: "Participants",
      body: mom.participants.join(", "),
      source_refs: [],
    });
  }
  if (mom.decisions.length) {
    sections.push({
      heading: "Decisions",
      body: mom.decisions.join("\n"),
      source_refs: [],
    });
  }
  if (mom.action_items.length) {
    sections.push({
      heading: "Action items",
      body: mom.action_items.join("\n"),
      source_refs: [],
    });
  }
  if (mom.open_questions.length) {
    sections.push({
      heading: "Open questions",
      body: mom.open_questions.join("\n"),
      source_refs: [],
    });
  }
  if (mom.meeting_feedback) {
    sections.push({
      heading: "Meeting feedback",
      body: mom.meeting_feedback,
      source_refs: [],
    });
  }

  return {
    status: sections.length ? "generated" : "unknown",
    origin: "UNKNOWN",
    sections,
    source_refs: [],
  };
}

function adaptTranscriptSummaryRef(
  summary: Record<string, unknown>,
  opportunityId: string,
): TranscriptSummaryRef {
  return {
    artifact_kind: "transcript_summary",
    schema_version: "1.0",
    transcript_id: typeof summary.transcript_id === "string" ? summary.transcript_id : "",
    conversation_id:
      typeof summary.conversation_id === "string" ? summary.conversation_id : "C0",
    generated_at: typeof summary.generated_at === "string" ? summary.generated_at : undefined,
  };
}

function adaptStage2Presentation(
  presentation: Stage2OutputsPayload["presentation"],
): { ref: Stage2PresentationRef; unfrozen: boolean } {
  const unfrozen = presentation.status === "unfrozen";
  return {
    unfrozen,
    ref: {
      status: unfrozen ? "pending" : presentation.presentation_id ? "generated" : "unknown",
      profile: "deepening_adjusted",
      presentation_id: presentation.presentation_id,
      presentation_version_id: null,
    },
  };
}

function adaptCallSummary(text: string): Stage2SummaryBlock {
  const trimmed = text.trim();
  return {
    status: trimmed ? "generated" : "unknown",
    origin: "UNKNOWN",
    text: trimmed || null,
    source_refs: [],
  };
}

function adaptActionItems(items: string[]): ActionItem[] {
  return items.map((action) => ({
    action,
    owner: null,
    due: null,
    origin: "UNKNOWN" as const,
    source_refs: [],
    confidence: "unknown" as const,
  }));
}

export function adaptStage2OutputsEnvelope(
  envelope: Stage2OutputsEnvelope,
): AdaptedStage2Review {
  if (envelope.status === "not_generated" || envelope.outputs === null) {
    return {
      envelopeStatus: envelope.status,
      panelOutputs: null,
      dependencies: [STAGE2_OUTPUTS_NOT_GENERATED],
      presentationUnfrozen: false,
    };
  }

  const payload = envelope.outputs;
  const { ref: presentationRef, unfrozen: presentationUnfrozen } =
    adaptStage2Presentation(payload.presentation);

  const dependencies: string[] = [RETRIEVAL_PROMPT_VERSION_UNAVAILABLE];
  if (presentationUnfrozen) {
    dependencies.push(DEEPENING_PPT_UNFROZEN);
  }

  const panelOutputs: Stage2Outputs = {
    schema_version: "1.0",
    opportunity_id: envelope.opportunity_id,
    journey_stage: "deepening",
    prompt_version: "",
    transcript_summary_ref: adaptTranscriptSummaryRef(
      payload.transcript_summary,
      envelope.opportunity_id,
    ),
    call_summary: adaptCallSummary(payload.call_summary),
    minutes_of_meeting: adaptMom(payload.mom),
    decisions: stringItemsToStatedItems(payload.mom.decisions),
    action_items: adaptActionItems(payload.mom.action_items),
    open_questions: stringItemsToStatedItems(payload.mom.open_questions),
    presentation_ref: presentationRef,
    dependencies,
  };

  return {
    envelopeStatus: envelope.status,
    panelOutputs,
    dependencies,
    presentationUnfrozen,
  };
}

export function resolveEmailDraftLength(
  draft: NonNullable<EmailDraftEnvelope["draft"]>,
  preferred?: EmailDraftLength,
): EmailDraftLength {
  if (draft.status === "confirmed" && draft.selected_length) {
    return draft.selected_length;
  }
  if (preferred && draft.lengths[preferred]) {
    return preferred;
  }
  return "medium";
}

export function followupDraftFromEmailRecord(
  draft: NonNullable<EmailDraftEnvelope["draft"]>,
  preferredLength?: EmailDraftLength,
): FollowupDraft {
  const length = resolveEmailDraftLength(draft, preferredLength);
  const body = draft.lengths[length];
  return {
    subject: body.subject,
    body: body.body,
    review_flags: [],
    attachment_name: null,
    status: draft.status === "confirmed" ? "reviewed" : "draft",
  };
}

export function adaptEmailDraftEnvelope(
  envelope: EmailDraftEnvelope,
  preferredLength?: EmailDraftLength,
): AdaptedEmailDraftReview {
  if (!envelope.draft) {
    return {
      draftId: null,
      journeyStage: envelope.journey_stage,
      lengths: null,
      selectedLength: null,
      serverStatus: null,
      sendStatus: null,
      confirmedAt: null,
      panelDraft: null,
      serverConfirmed: false,
    };
  }

  const selectedLength = resolveEmailDraftLength(envelope.draft, preferredLength);

  return {
    draftId: envelope.draft.id,
    journeyStage: envelope.journey_stage,
    lengths: envelope.draft.lengths,
    selectedLength: envelope.draft.selected_length ?? selectedLength,
    serverStatus: envelope.draft.status,
    sendStatus: envelope.draft.send_status,
    confirmedAt: envelope.draft.confirmed_at,
    panelDraft: followupDraftFromEmailRecord(envelope.draft, preferredLength),
    serverConfirmed: envelope.draft.status === "confirmed",
  };
}

/** Returns true when a First Contact presentation download must not be offered. */
export function isFirstContactPresentationDownloadBlocked(
  adapted: AdaptedStage1Review,
): boolean {
  return adapted.presentationUnfrozen || adapted.panelOutputs === null;
}
