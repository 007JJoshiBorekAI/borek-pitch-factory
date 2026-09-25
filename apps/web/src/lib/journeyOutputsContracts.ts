/**
 * Mayank BT-36 / TSK-013 retrieval API envelopes (origin/mayank @ 3656fc8).
 * These differ from the worker/generation shapes on origin/bt/bt36-stage-outputs.
 */

import type { JourneyStageName } from "./api";

export type StageOutputsStatus = "not_generated" | "ready";

export type EmailDraftLength = "short" | "medium" | "extensive";

export type EmailDraftServerStatus = "draft" | "confirmed";

export interface Stage1ApiHypothesis {
  statement: string;
  origin: "AI_HYPOTHESIS";
}

export interface Stage1ApiDiscoveryQuestion {
  id: string;
  text: string;
}

export interface Stage1ApiUseCase {
  title: string;
  rationale: string;
  availability: "matched" | "unknown";
}

export interface Stage1ApiAgendaItem {
  order: number;
  label: string;
}

export interface Stage1ApiAgenda {
  title: string;
  items: Stage1ApiAgendaItem[];
}

export interface Stage1ApiPresentation {
  status: "unfrozen" | "ready";
  profile: "first_meeting_3";
  code: string | null;
  presentation_id: string | null;
  download_url: string | null;
}

export interface Stage1OutputsPayload {
  hypothesis: Stage1ApiHypothesis;
  product_relevance: Stage1ApiHypothesis;
  discovery_questions: Stage1ApiDiscoveryQuestion[];
  use_cases: Stage1ApiUseCase[];
  agenda: Stage1ApiAgenda;
  presentation: Stage1ApiPresentation;
  research: Record<string, unknown> | null;
  generated_at: string;
}

export interface Stage1OutputsEnvelope {
  schema_version: "1.0";
  opportunity_id: string;
  status: StageOutputsStatus;
  outputs: Stage1OutputsPayload | null;
}

export interface Stage2ApiMom {
  title: string;
  participants: string[];
  decisions: string[];
  action_items: string[];
  open_questions: string[];
  meeting_feedback: string | null;
}

export interface Stage2ApiPresentation {
  status: "unfrozen" | "ready";
  code: string | null;
  presentation_id: string | null;
  download_url: string | null;
}

export interface Stage2OutputsPayload {
  call_summary: string;
  mom: Stage2ApiMom;
  presentation: Stage2ApiPresentation;
  transcript_summary: Record<string, unknown>;
  generated_at: string;
}

export interface Stage2OutputsEnvelope {
  schema_version: "1.0";
  opportunity_id: string;
  status: StageOutputsStatus;
  outputs: Stage2OutputsPayload | null;
}

export interface MeetingFeedbackResponse {
  schema_version: "1.0";
  opportunity_id: string;
  text: string | null;
  updated_at: string | null;
}

export interface MeetingFeedbackUpdateRequest {
  text: string | null;
}

export interface EmailLengthBody {
  subject: string;
  body: string;
  word_count: number;
}

export interface EmailDraftRecord {
  id: string;
  status: EmailDraftServerStatus;
  send_status: "not_sent";
  selected_length: EmailDraftLength | null;
  lengths: Record<EmailDraftLength, EmailLengthBody>;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailDraftEnvelope {
  schema_version: "1.0";
  opportunity_id: string;
  journey_stage: JourneyStageName;
  draft: EmailDraftRecord | null;
}

export interface EmailDraftGenerateRequest {
  journey_stage: JourneyStageName;
}

export interface EmailDraftConfirmRequest {
  selected_length: EmailDraftLength;
}

/** Documented MS-35 / BT-36 journey-output error codes. */
export type JourneyOutputsErrorCode =
  | "CLIENT_DOCUMENT_REQUIRED"
  | "TRANSCRIPT_REQUIRED"
  | "INVALID_JOURNEY_STAGE"
  | "INVALID_EMAIL_LENGTH"
  | "EMAIL_SEND_FORBIDDEN"
  | "EMAIL_DRAFT_NOT_FOUND";
