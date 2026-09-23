/** BT-34 / BT-36 contract shapes used by MS-35 First Contact output review. */

export type OriginKind = "SOURCE_FACT" | "AI_INFERENCE" | "UNKNOWN" | "USER_INPUT";

export interface SourceRef {
  source_id: string;
  locator: string;
  excerpt: string;
}

export interface CorpusSourceRef {
  entry_id: string;
  title: string;
  excerpt: string;
  locator?: string;
}

export interface Stage1Fact {
  status: "verified" | "unknown";
  origin: "SOURCE_FACT" | "UNKNOWN";
  value: string | null;
  source_refs: SourceRef[];
}

export interface Stage1Hypothesis {
  status: "generated" | "unknown";
  origin: "AI_INFERENCE";
  text: string | null;
  basis: string[];
}

export interface Stage1Research {
  schema_version: "1.0";
  opportunity_id: string;
  client_name: string;
  company_facts: {
    description: Stage1Fact;
    headquarters: Stage1Fact;
    employee_headcount: Stage1Fact;
    decision_makers: Stage1Fact;
    revenue: Stage1Fact;
  };
  user_statements: {
    origin: "USER_INPUT";
    fields: Record<string, string>;
  };
  borek_offering: Stage1Fact;
  hypothesis: Stage1Hypothesis;
  product_relevance: Stage1Hypothesis;
  dependencies: string[];
}

export interface DiscoveryQuestion {
  question_id: string;
  text: string | null;
  origin: "SOURCE_FACT" | "AI_INFERENCE" | "UNKNOWN";
  status: "generated" | "unknown";
  basis?: string[];
  source_refs?: SourceRef[];
}

export interface DiscoveryQuestionCollection {
  status: "generated" | "unknown";
  items: DiscoveryQuestion[];
}

export interface UseCaseMatch {
  use_case_id: string;
  title: string | null;
  relevance_summary: string | null;
  origin: "SOURCE_FACT" | "AI_INFERENCE" | "UNKNOWN";
  status: "matched" | "none_found" | "unknown";
  basis?: string[];
  source_refs?: CorpusSourceRef[];
}

export interface UseCaseCollection {
  status: "generated" | "unknown";
  items: UseCaseMatch[];
}

export interface AgendaItem {
  order: number;
  topic: string;
  duration_minutes: number | null;
  notes: string | null;
}

export interface MeetingAgenda {
  status: "generated" | "unknown";
  origin: "AI_INFERENCE" | "SOURCE_FACT" | "UNKNOWN";
  items: AgendaItem[];
  source_refs: SourceRef[];
}

export interface PresentationRef {
  status: "pending" | "generated" | "unknown";
  profile: "first_meeting_3_slide";
  presentation_id: string | null;
  presentation_version_id: string | null;
}

export interface Stage1Outputs {
  schema_version: "1.0";
  opportunity_id: string;
  journey_stage: "first_contact";
  prompt_version: string;
  research_ref: {
    artifact_kind: "stage1_research";
    schema_version: "1.0";
    opportunity_id: string;
    generated_at?: string;
  };
  discovery_questions: DiscoveryQuestionCollection;
  use_cases: UseCaseCollection;
  meeting_agenda: MeetingAgenda;
  presentation_ref: PresentationRef;
  email_draft?: {
    status: string;
    followup_extraction_id?: string | null;
  };
  dependencies: string[];
}
