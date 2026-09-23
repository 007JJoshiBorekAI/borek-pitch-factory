/**
 * Trimmed BT-36 contract fixtures for MS-35 Phase A demonstration mode only.
 * Source: origin/bt/bt36-stage-outputs packages/contracts/fixtures/*.generated.json
 */

export const stage1ResearchDemo = {
  company_facts: {
    description: { status: "unknown", value: null },
    headquarters: { status: "unknown", value: null },
    employee_headcount: { status: "unknown", value: null },
    decision_makers: { status: "unknown", value: null },
    revenue: { status: "unknown", value: null },
  },
  hypothesis: { status: "unknown", text: null },
  borek_offering: {
    status: "verified",
    value:
      "Invoice 3-way Match matches supplier invoices to purchase orders and goods receipts before payment release.",
  },
  product_relevance: { status: "unknown", text: null },
} as const;

export const stage1OutputsDemo = {
  discovery_questions: {
    items: [
      { text: "Which ERP modules are in scope for the initial automation pilot?" },
      { text: "Who owns the month-end close process today?" },
      { text: "What systems feed the reconciliation workflow?" },
      { text: "What compliance constraints apply to stored financial records?" },
      { text: "What is the target go-live window for a first automation?" },
    ],
  },
  use_cases: {
    items: [
      {
        title: "Finance close automation",
        relevance_summary:
          "Similar mid-market manufacturer reduced close cycle by 40% using document extraction and reconciliation agents.",
      },
    ],
  },
  meeting_agenda: {
    items: [
      { topic: "Introductions and objectives", duration_minutes: 10, notes: null },
      { topic: "Current finance close pain points", duration_minutes: 20, notes: "Use discovery questions Q1–Q3" },
      { topic: "Borek approach and relevant use case", duration_minutes: 15, notes: "Reference UC1" },
      { topic: "Next steps and data access", duration_minutes: 15, notes: null },
    ],
  },
  presentation_ref: {
    profile: "first_meeting_3_slide",
  },
} as const;

export const stage2OutputsDemo = {
  call_summary: {
    text: "Acme confirmed finance close automation as the pilot scope. SAP remains the system of record. EU data residency is mandatory.",
  },
  minutes_of_meeting: {
    sections: [
      {
        heading: "Scope confirmation",
        body: "Pilot limited to month-end reconciliation between SAP and shared Excel workbooks.",
      },
      {
        heading: "Compliance",
        body: "All automation artifacts must remain in EU-hosted infrastructure.",
      },
    ],
  },
} as const;
