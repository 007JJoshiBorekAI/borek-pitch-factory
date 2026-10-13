export const DISCOVERY_PAGE_CATALOG = [
  { id: "cover", label: "Cover" },
  { id: "client_context", label: "Client context" },
  { id: "opportunity", label: "Opportunity" },
  { id: "borek_approach", label: "Borek approach" },
  { id: "relevant_use_case", label: "Relevant use case" },
  { id: "pilot_proposal", label: "Pilot proposal" },
  { id: "next_steps", label: "Next steps" },
] as const;

export const WORKFLOW_STATUS_CATALOG = [
  { id: "client_information", label: "Client Information", route: "client-information" },
  { id: "discovery_prepared", label: "Discovery Prepared", route: "discovery" },
  { id: "ppt_1_ready", label: "PPT #1 Ready", route: "presentations" },
  { id: "first_meeting_completed", label: "First Meeting Completed", route: "meeting" },
  { id: "transcript_added", label: "Transcript Added", route: "meeting" },
  { id: "ppt_2_generated", label: "PPT #2 Generated", route: "presentations" },
  { id: "owner_review", label: "Owner Review", route: "review" },
  { id: "finalized", label: "Finalized", route: "follow-up" },
] as const;

export const DISCOVERY_PAGE_STATES = ["waiting", "generating", "ready", "failed"] as const;
export const PRESENTATION_FAMILIES = ["ppt_1", "ppt_2"] as const;
export const EXTRACTION_STATES = ["not_started", "processing", "completed", "failed"] as const;

export type DiscoveryPageId = (typeof DISCOVERY_PAGE_CATALOG)[number]["id"];
export type DiscoveryPageState = (typeof DISCOVERY_PAGE_STATES)[number];
export type WorkflowStatus = (typeof WORKFLOW_STATUS_CATALOG)[number]["id"];
export type PresentationFamily = (typeof PRESENTATION_FAMILIES)[number];
export type ExtractionState = (typeof EXTRACTION_STATES)[number];

export interface ClientInformationViewModel {
  company_name: string;
  contact_person: string;
  website_url: string;
  meeting_purpose: string;
  additional_information: string;
}

export interface DiscoveryPageViewModel {
  id: DiscoveryPageId;
  label: string;
  state: DiscoveryPageState;
}

export interface DiscoveryViewModel {
  version_id: string | null;
  revision: number;
  pages: DiscoveryPageViewModel[];
}

export interface PresentationVersionViewModel {
  version_id: string;
  source_version_id: string;
  pptx_artifact_id: string | null;
  pdf_artifact_id: string | null;
}

export interface PresentationFamilyViewModel {
  family: PresentationFamily;
  state: DiscoveryPageState;
  versions: PresentationVersionViewModel[];
}

export interface MeetingExtractionViewModel {
  state: ExtractionState;
  requirements: string[];
  challenges: string[];
  priorities: string[];
  opportunities: string[];
  discussed_solutions: string[];
  decisions: string[];
  follow_ups: string[];
}

export interface UseCaseSelectionViewModel {
  selected_body_version_ids: string[];
  confirmed: boolean;
}

export interface OwnerCheckpointViewModel {
  id: string;
  status: "pending" | "reviewed" | "stale";
  revision: number;
}

export interface EmailAttachmentViewModel {
  artifact_id: string;
  version_id: string;
  artifact_kind: "discovery_pdf" | "ppt_1" | "ppt_2";
  included: boolean;
}

export interface WorkflowSnapshotViewModel {
  revision: number;
  current_status: WorkflowStatus;
  completed_statuses: WorkflowStatus[];
  blocked_reason: string | null;
  available_actions: string[];
  /** True when the pitch uses the Master Presentation (V1 before, V2 after the first meeting). */
  master_journey?: boolean;
}

/**
 * The Master Presentation journey: one presentation whose V1 is the pre-meeting and whose V2 is
 * the post-meeting version. Decided from what the API reports, never assumed; earlier pitches
 * with a separate PPT #1 / PPT #2 keep their own wording.
 */
export function isMasterJourney(documents: { ppt1?: { product_version?: string } | null; ppt2?: { product_version?: string } | null } | null | undefined) {
  return documents?.ppt1?.product_version === "V1" || documents?.ppt2?.product_version === "V2";
}

/** Step names of the Master Presentation journey; the other steps keep their usual names. */
export const MASTER_JOURNEY_STEP_LABELS: Partial<Record<WorkflowStatus, string>> = {
  ppt_1_ready: "Master Presentation V1 Ready",
  ppt_2_generated: "Master Presentation V2 Ready",
};

export function workflowStepLabel(id: WorkflowStatus, label: string, masterJourney: boolean | undefined, labels = MASTER_JOURNEY_STEP_LABELS) {
  return (masterJourney && labels[id]) || label;
}

export interface DiscoveryFirstWorkspaceFixture {
  schema_version: "ms-ui-1.0";
  opportunity_id: string;
  source: "fixture";
  client_information: ClientInformationViewModel;
  workflow: WorkflowSnapshotViewModel;
  discovery: DiscoveryViewModel;
  presentations: PresentationFamilyViewModel[];
  meeting_extraction: MeetingExtractionViewModel;
  use_case_selection: UseCaseSelectionViewModel;
  checkpoints: OwnerCheckpointViewModel[];
  email_attachments: EmailAttachmentViewModel[];
}

export class DiscoveryFirstContractError extends Error {
  constructor(path: string) {
    super(`Invalid discovery-first UI contract at ${path}.`);
    this.name = "DiscoveryFirstContractError";
  }
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DiscoveryFirstContractError(path);
  }
  return value as Record<string, unknown>;
}

function stringAt(value: unknown, path: string): string {
  if (typeof value !== "string") throw new DiscoveryFirstContractError(path);
  return value;
}

function nullableStringAt(value: unknown, path: string): string | null {
  if (value === null) return null;
  return stringAt(value, path);
}

function numberAt(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new DiscoveryFirstContractError(path);
  }
  return value;
}

function booleanAt(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new DiscoveryFirstContractError(path);
  return value;
}

function arrayAt(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new DiscoveryFirstContractError(path);
  return value;
}

function enumAt<T extends string>(value: unknown, values: readonly T[], path: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new DiscoveryFirstContractError(path);
  }
  return value as T;
}

const WORKFLOW_STATUS_IDS = WORKFLOW_STATUS_CATALOG.map(({ id }) => id);
const DISCOVERY_PAGE_IDS = DISCOVERY_PAGE_CATALOG.map(({ id }) => id);

export function parseDiscoveryFirstWorkspaceFixture(value: unknown): DiscoveryFirstWorkspaceFixture {
  const root = objectAt(value, "root");
  if (root.schema_version !== "ms-ui-1.0" || root.source !== "fixture") {
    throw new DiscoveryFirstContractError("schema_version");
  }

  const client = objectAt(root.client_information, "client_information");
  const workflow = objectAt(root.workflow, "workflow");
  const discovery = objectAt(root.discovery, "discovery");
  const rawPages = arrayAt(discovery.pages, "discovery.pages");
  if (rawPages.length !== DISCOVERY_PAGE_CATALOG.length) {
    throw new DiscoveryFirstContractError("discovery.pages");
  }
  const pages = rawPages.map((value, index): DiscoveryPageViewModel => {
    const page = objectAt(value, `discovery.pages.${index}`);
    const expected = DISCOVERY_PAGE_CATALOG[index];
    const id = enumAt(page.id, DISCOVERY_PAGE_IDS, `discovery.pages.${index}.id`);
    const label = stringAt(page.label, `discovery.pages.${index}.label`);
    if (id !== expected.id || label !== expected.label) {
      throw new DiscoveryFirstContractError(`discovery.pages.${index}`);
    }
    return {
      id,
      label,
      state: enumAt(page.state, DISCOVERY_PAGE_STATES, `discovery.pages.${index}.state`),
    };
  });

  const presentations = arrayAt(root.presentations, "presentations").map((value, index) => {
    const item = objectAt(value, `presentations.${index}`);
    const versions = arrayAt(item.versions, `presentations.${index}.versions`).map((versionValue, versionIndex) => {
      const version = objectAt(versionValue, `presentations.${index}.versions.${versionIndex}`);
      return {
        version_id: stringAt(version.version_id, `presentations.${index}.versions.${versionIndex}.version_id`),
        source_version_id: stringAt(version.source_version_id, `presentations.${index}.versions.${versionIndex}.source_version_id`),
        pptx_artifact_id: nullableStringAt(version.pptx_artifact_id, `presentations.${index}.versions.${versionIndex}.pptx_artifact_id`),
        pdf_artifact_id: nullableStringAt(version.pdf_artifact_id, `presentations.${index}.versions.${versionIndex}.pdf_artifact_id`),
      };
    });
    return {
      family: enumAt(item.family, PRESENTATION_FAMILIES, `presentations.${index}.family`),
      state: enumAt(item.state, DISCOVERY_PAGE_STATES, `presentations.${index}.state`),
      versions,
    };
  });
  if (presentations.length !== 2 || presentations[0]?.family !== "ppt_1" || presentations[1]?.family !== "ppt_2") {
    throw new DiscoveryFirstContractError("presentations");
  }

  const extraction = objectAt(root.meeting_extraction, "meeting_extraction");
  const stringArray = (key: string) =>
    arrayAt(extraction[key], `meeting_extraction.${key}`).map((item, index) =>
      stringAt(item, `meeting_extraction.${key}.${index}`),
    );
  const selection = objectAt(root.use_case_selection, "use_case_selection");

  return {
    schema_version: "ms-ui-1.0",
    opportunity_id: stringAt(root.opportunity_id, "opportunity_id"),
    source: "fixture",
    client_information: {
      company_name: stringAt(client.company_name, "client_information.company_name"),
      contact_person: stringAt(client.contact_person, "client_information.contact_person"),
      website_url: stringAt(client.website_url, "client_information.website_url"),
      meeting_purpose: stringAt(client.meeting_purpose, "client_information.meeting_purpose"),
      additional_information: stringAt(client.additional_information, "client_information.additional_information"),
    },
    workflow: {
      revision: numberAt(workflow.revision, "workflow.revision"),
      current_status: enumAt(workflow.current_status, WORKFLOW_STATUS_IDS, "workflow.current_status"),
      completed_statuses: arrayAt(workflow.completed_statuses, "workflow.completed_statuses").map((item, index) =>
        enumAt(item, WORKFLOW_STATUS_IDS, `workflow.completed_statuses.${index}`),
      ),
      blocked_reason: nullableStringAt(workflow.blocked_reason, "workflow.blocked_reason"),
      available_actions: arrayAt(workflow.available_actions, "workflow.available_actions").map((item, index) =>
        stringAt(item, `workflow.available_actions.${index}`),
      ),
    },
    discovery: {
      version_id: nullableStringAt(discovery.version_id, "discovery.version_id"),
      revision: numberAt(discovery.revision, "discovery.revision"),
      pages,
    },
    presentations,
    meeting_extraction: {
      state: enumAt(extraction.state, EXTRACTION_STATES, "meeting_extraction.state"),
      requirements: stringArray("requirements"),
      challenges: stringArray("challenges"),
      priorities: stringArray("priorities"),
      opportunities: stringArray("opportunities"),
      discussed_solutions: stringArray("discussed_solutions"),
      decisions: stringArray("decisions"),
      follow_ups: stringArray("follow_ups"),
    },
    use_case_selection: {
      selected_body_version_ids: arrayAt(selection.selected_body_version_ids, "use_case_selection.selected_body_version_ids").map((item, index) =>
        stringAt(item, `use_case_selection.selected_body_version_ids.${index}`),
      ),
      confirmed: booleanAt(selection.confirmed, "use_case_selection.confirmed"),
    },
    checkpoints: arrayAt(root.checkpoints, "checkpoints").map((value, index) => {
      const checkpoint = objectAt(value, `checkpoints.${index}`);
      return {
        id: stringAt(checkpoint.id, `checkpoints.${index}.id`),
        status: enumAt(checkpoint.status, ["pending", "reviewed", "stale"] as const, `checkpoints.${index}.status`),
        revision: numberAt(checkpoint.revision, `checkpoints.${index}.revision`),
      };
    }),
    email_attachments: arrayAt(root.email_attachments, "email_attachments").map((value, index) => {
      const attachment = objectAt(value, `email_attachments.${index}`);
      return {
        artifact_id: stringAt(attachment.artifact_id, `email_attachments.${index}.artifact_id`),
        version_id: stringAt(attachment.version_id, `email_attachments.${index}.version_id`),
        artifact_kind: enumAt(attachment.artifact_kind, ["discovery_pdf", "ppt_1", "ppt_2"] as const, `email_attachments.${index}.artifact_kind`),
        included: booleanAt(attachment.included, `email_attachments.${index}.included`),
      };
    }),
  };
}
