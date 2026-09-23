/** BT-36 Stage 2 (Deepening) contract shapes for MS-35 output review. */

export interface TranscriptTurnRef {
  conversation_id: string;
  speaker_role: string;
  excerpt_pointer: string;
}

export interface TranscriptSummaryRef {
  artifact_kind: "transcript_summary";
  schema_version: "1.0";
  transcript_id: string;
  conversation_id: string;
  generated_at?: string;
}

export interface Stage2SummaryBlock {
  status: "generated" | "unknown";
  origin: "SOURCE_FACT" | "UNKNOWN";
  text: string | null;
  source_refs: TranscriptTurnRef[];
}

export interface MomSection {
  heading: string;
  body: string;
  source_refs: TranscriptTurnRef[];
}

export interface MinutesOfMeeting {
  status: "generated" | "unknown";
  origin: "SOURCE_FACT" | "UNKNOWN";
  sections: MomSection[];
  source_refs: TranscriptTurnRef[];
}

export interface StatedItem {
  text: string | null;
  origin: "SOURCE_FACT" | "UNKNOWN";
  source_refs: TranscriptTurnRef[];
  confidence: "high" | "medium" | "low" | "unknown";
}

export interface ActionItem {
  action: string;
  owner: string | null;
  due: string | null;
  origin: "SOURCE_FACT" | "UNKNOWN";
  source_refs: TranscriptTurnRef[];
  confidence: "high" | "medium" | "low" | "unknown";
}

export interface Stage2PresentationRef {
  status: "pending" | "generated" | "unknown";
  profile: "deepening_adjusted";
  presentation_id: string | null;
  presentation_version_id: string | null;
}

export interface Stage2Outputs {
  schema_version: "1.0";
  opportunity_id: string;
  journey_stage: "deepening";
  prompt_version: string;
  transcript_summary_ref: TranscriptSummaryRef;
  call_summary: Stage2SummaryBlock;
  minutes_of_meeting: MinutesOfMeeting;
  decisions: StatedItem[];
  action_items: ActionItem[];
  open_questions: StatedItem[];
  presentation_ref: Stage2PresentationRef;
  email_draft?: {
    status: string;
    followup_extraction_id?: string | null;
  };
  dependencies: string[];
}
