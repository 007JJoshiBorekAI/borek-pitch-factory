/**
 * BT-36 contract fixtures for MS-35 demonstration mode only.
 * Source: origin/bt/bt36-stage-outputs packages/contracts/fixtures/*.json
 */

import type { Stage1Outputs, Stage1Research } from "./stage1Contracts";
import type { Stage2Outputs } from "./stage2Contracts";

export const stage1ResearchDemo: Stage1Research = {
  schema_version: "1.0",
  opportunity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  client_name: "Acme",
  company_facts: {
    description: {
      status: "unknown",
      origin: "UNKNOWN",
      value: null,
      source_refs: [],
    },
    headquarters: {
      status: "unknown",
      origin: "UNKNOWN",
      value: null,
      source_refs: [],
    },
    employee_headcount: {
      status: "unknown",
      origin: "UNKNOWN",
      value: null,
      source_refs: [],
    },
    decision_makers: {
      status: "unknown",
      origin: "UNKNOWN",
      value: null,
      source_refs: [],
    },
    revenue: {
      status: "unknown",
      origin: "UNKNOWN",
      value: null,
      source_refs: [],
    },
  },
  user_statements: {
    origin: "USER_INPUT",
    fields: {
      client_name: "Acme",
      client_web_page: "https://example.com",
      sales_topic_description: "Explore invoice matching",
      about_company: "Sales reports that the company distributes equipment.",
    },
  },
  borek_offering: {
    status: "verified",
    origin: "SOURCE_FACT",
    value:
      "Invoice 3-way Match matches supplier invoices to purchase orders and goods receipts before payment release.",
    source_refs: [
      {
        source_id: "service.invoice-3way.definition",
        locator: "2026.09.03/SVC-INV3WAY-v1",
        excerpt:
          "Invoice 3-way Match matches supplier invoices to purchase orders and goods receipts before payment release.",
      },
    ],
  },
  hypothesis: {
    status: "unknown",
    origin: "AI_INFERENCE",
    text: null,
    basis: [],
  },
  product_relevance: {
    status: "unknown",
    origin: "AI_INFERENCE",
    text: null,
    basis: [],
  },
  dependencies: ["COMPANY_RESEARCH_PROVIDER_UNAVAILABLE", "HYPOTHESIS_GENERATION_NOT_RUN"],
};

export const stage1OutputsDemo: Stage1Outputs = {
  schema_version: "1.0",
  opportunity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  journey_stage: "first_contact",
  prompt_version: "stage1-outputs:v1",
  research_ref: {
    artifact_kind: "stage1_research",
    schema_version: "1.0",
    opportunity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    generated_at: "2026-09-22T10:00:00Z",
  },
  discovery_questions: {
    status: "generated",
    items: [
      {
        question_id: "Q1",
        text: "Which ERP modules are in scope for the initial automation pilot?",
        origin: "AI_INFERENCE",
        status: "generated",
        basis: ["sales_topic_description mentions finance close"],
      },
      {
        question_id: "Q2",
        text: "Who owns the month-end close process today?",
        origin: "AI_INFERENCE",
        status: "generated",
        basis: ["hypothesis targets finance operations"],
      },
      {
        question_id: "Q3",
        text: "What systems feed the reconciliation workflow?",
        origin: "AI_INFERENCE",
        status: "generated",
        basis: ["client document D1 section 2"],
      },
      {
        question_id: "Q4",
        text: "What compliance constraints apply to stored financial records?",
        origin: "SOURCE_FACT",
        status: "generated",
        source_refs: [
          {
            source_id: "D1",
            locator: "section:2",
            excerpt: "All records must remain in EU data residency.",
          },
        ],
      },
      {
        question_id: "Q5",
        text: "What is the target go-live window for a first automation?",
        origin: "AI_INFERENCE",
        status: "generated",
        basis: ["first meeting agenda planning"],
      },
      {
        question_id: "Q6",
        text: "Which manual steps consume the most analyst hours each month?",
        origin: "AI_INFERENCE",
        status: "generated",
        basis: ["use case UC1 relevance"],
      },
      {
        question_id: "Q7",
        text: "Are there existing RPA or workflow tools in production?",
        origin: "AI_INFERENCE",
        status: "generated",
        basis: ["product_relevance hypothesis"],
      },
      {
        question_id: "Q8",
        text: "Who must approve changes to finance automation rules?",
        origin: "AI_INFERENCE",
        status: "generated",
        basis: ["decision_makers unknown in research"],
      },
      {
        question_id: "Q9",
        text: "What volume of transactions should the pilot handle?",
        origin: "AI_INFERENCE",
        status: "generated",
        basis: ["employee_headcount scale signal"],
      },
      {
        question_id: "Q10",
        text: "Which success metrics would define a successful first phase?",
        origin: "AI_INFERENCE",
        status: "generated",
        basis: ["first meeting discovery goals"],
      },
    ],
  },
  use_cases: {
    status: "generated",
    items: [
      {
        use_case_id: "UC1",
        title: "Finance close automation",
        relevance_summary:
          "Similar mid-market manufacturer reduced close cycle by 40% using document extraction and reconciliation agents.",
        origin: "SOURCE_FACT",
        status: "matched",
        source_refs: [
          {
            entry_id: "borek-uc-finance-01",
            title: "Manufacturing finance close",
            excerpt: "Automated reconciliation across SAP and Excel workbooks.",
            locator: "corpus:use_cases/01",
          },
        ],
      },
    ],
  },
  meeting_agenda: {
    status: "generated",
    origin: "AI_INFERENCE",
    items: [
      {
        order: 1,
        topic: "Introductions and objectives",
        duration_minutes: 10,
        notes: null,
      },
      {
        order: 2,
        topic: "Current finance close pain points",
        duration_minutes: 20,
        notes: "Use discovery questions Q1–Q3",
      },
      {
        order: 3,
        topic: "Borek approach and relevant use case",
        duration_minutes: 15,
        notes: "Reference UC1",
      },
      {
        order: 4,
        topic: "Next steps and data access",
        duration_minutes: 15,
        notes: null,
      },
    ],
    source_refs: [],
  },
  presentation_ref: {
    status: "generated",
    profile: "first_meeting_3_slide",
    presentation_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    presentation_version_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  },
  email_draft: {
    status: "not_requested",
    followup_extraction_id: null,
  },
  dependencies: [],
};

export const stage2OutputsDemo: Stage2Outputs = {
  schema_version: "1.0",
  opportunity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  journey_stage: "deepening",
  prompt_version: "stage2-outputs:v1",
  transcript_summary_ref: {
    artifact_kind: "transcript_summary",
    schema_version: "1.0",
    transcript_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    conversation_id: "C1",
    generated_at: "2026-09-22T14:30:00Z",
  },
  call_summary: {
    status: "generated",
    origin: "SOURCE_FACT",
    text: "Acme confirmed finance close automation as the pilot scope. SAP remains the system of record. EU data residency is mandatory.",
    source_refs: [
      {
        conversation_id: "C1",
        speaker_role: "client",
        excerpt_pointer: "turn:4",
      },
    ],
  },
  minutes_of_meeting: {
    status: "generated",
    origin: "SOURCE_FACT",
    sections: [
      {
        heading: "Scope confirmation",
        body: "Pilot limited to month-end reconciliation between SAP and shared Excel workbooks.",
        source_refs: [
          {
            conversation_id: "C1",
            speaker_role: "client",
            excerpt_pointer: "turn:6",
          },
        ],
      },
      {
        heading: "Compliance",
        body: "All automation artifacts must remain in EU-hosted infrastructure.",
        source_refs: [
          {
            conversation_id: "C1",
            speaker_role: "client",
            excerpt_pointer: "turn:8",
          },
        ],
      },
    ],
    source_refs: [
      {
        conversation_id: "C1",
        speaker_role: "client",
        excerpt_pointer: "turn:6",
      },
    ],
  },
  decisions: [
    {
      text: "Proceed with a six-week discovery for finance close automation.",
      origin: "SOURCE_FACT",
      source_refs: [
        {
          conversation_id: "C1",
          speaker_role: "client",
          excerpt_pointer: "turn:12",
        },
      ],
      confidence: "high",
    },
  ],
  action_items: [
    {
      action: "Share sample reconciliation workbook",
      owner: "Anna Keller",
      due: "TBD",
      origin: "SOURCE_FACT",
      source_refs: [
        {
          conversation_id: "C1",
          speaker_role: "client",
          excerpt_pointer: "turn:15",
        },
      ],
      confidence: "high",
    },
    {
      action: "Confirm SAP export schedule",
      owner: null,
      due: null,
      origin: "UNKNOWN",
      source_refs: [],
      confidence: "unknown",
    },
  ],
  open_questions: [
    {
      text: "Which SAP modules export the reconciliation data?",
      origin: "SOURCE_FACT",
      source_refs: [
        {
          conversation_id: "C1",
          speaker_role: "borek",
          excerpt_pointer: "turn:18",
        },
      ],
      confidence: "medium",
    },
  ],
  presentation_ref: {
    status: "pending",
    profile: "deepening_adjusted",
    presentation_id: null,
    presentation_version_id: null,
  },
  email_draft: {
    status: "pending",
    followup_extraction_id: null,
  },
  dependencies: [],
};
