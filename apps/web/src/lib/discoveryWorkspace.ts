import {
  DISCOVERY_PAGE_CATALOG,
  DISCOVERY_PAGE_STATES,
  type DiscoveryPageId,
  type DiscoveryPageState,
} from "./discoveryFirst";

export type DiscoveryDocumentState = "draft" | "approved";

export interface DiscoverySourceReference {
  id: string;
  label: string;
  detail: string;
}

export interface DiscoveryWorkspacePage {
  id: DiscoveryPageId;
  label: string;
  state: DiscoveryPageState;
  title: string;
  body: string;
  source_references: DiscoverySourceReference[];
  failure_message: string | null;
}

export interface DiscoveryWorkspaceVersion {
  opportunity_id: string;
  version_id: string;
  revision: number;
  document_state: DiscoveryDocumentState;
  pages: DiscoveryWorkspacePage[];
  pdf_artifact_id: string | null;
  pdf_download_url: string | null;
  pdf_source_revision?: number | null;
  source: "fixture" | "live";
}

export type DiscoveryWorkspaceFailureKind =
  | "validation"
  | "conflict"
  | "authorization"
  | "retryable"
  | "ineligible";

export class DiscoveryWorkspaceError extends Error {
  constructor(public readonly kind: DiscoveryWorkspaceFailureKind, message: string) {
    super(message);
    this.name = "DiscoveryWorkspaceError";
  }
}

export interface SaveDiscoveryPageInput {
  opportunity_id: string;
  version_id: string;
  page_id: DiscoveryPageId;
  expected_revision: number;
  title: string;
  body: string;
}

export interface DiscoveryWorkspaceAdapter {
  load(opportunityId: string, versionId: string): Promise<DiscoveryWorkspaceVersion>;
  savePage(input: SaveDiscoveryPageInput): Promise<DiscoveryWorkspaceVersion>;
  retryPage(input: {
    opportunity_id: string;
    version_id: string;
    page_id: DiscoveryPageId;
    expected_revision: number;
  }): Promise<DiscoveryWorkspaceVersion>;
  advanceGeneration(input: {
    opportunity_id: string;
    version_id: string;
    expected_revision: number;
  }): Promise<DiscoveryWorkspaceVersion>;
  approve(input: {
    opportunity_id: string;
    version_id: string;
    expected_revision: number;
  }): Promise<DiscoveryWorkspaceVersion>;
  createSuccessor(input: {
    opportunity_id: string;
    approved_version_id: string;
  }): Promise<DiscoveryWorkspaceVersion>;
}

export async function continueDiscoveryGeneration(
  adapter: DiscoveryWorkspaceAdapter,
  version: DiscoveryWorkspaceVersion,
): Promise<DiscoveryWorkspaceVersion> {
  let current = version;
  for (const page of version.pages) {
    const latest = current.pages.find((candidate) => candidate.id === page.id);
    if (latest?.state !== "failed") continue;
    current = await adapter.retryPage({
      opportunity_id: current.opportunity_id,
      version_id: current.version_id,
      page_id: latest.id,
      expected_revision: current.revision,
    });
  }
  if (current.pages.every((page) => page.state === "ready") || current.document_state !== "draft") {
    return current;
  }
  return adapter.advanceGeneration({
    opportunity_id: current.opportunity_id,
    version_id: current.version_id,
    expected_revision: current.revision,
  });
}

const PAGE_CONTENT: Record<DiscoveryPageId, { title: string; body: string }> = {
  cover: {
    title: "Acme GmbH Discovery Paper",
    body: "Prepared for the first client conversation.",
  },
  client_context: {
    title: "Client context",
    body: "Acme is reviewing how multilingual operations can scale without losing quality.",
  },
  opportunity: {
    title: "A multilingual operation that scales without losing quality",
    body: "The first meeting should validate quality consistency, onboarding speed, and visible governance.",
  },
  borek_approach: {
    title: "Borek approach",
    body: "Use a focused discovery process to turn confirmed context into an actionable pilot direction.",
  },
  relevant_use_case: {
    title: "Relevant use case",
    body: "A completed use case will be selected from the approved corpus.",
  },
  pilot_proposal: {
    title: "Pilot proposal",
    body: "Define a bounded pilot only after requirements and success measures are confirmed.",
  },
  next_steps: {
    title: "Next steps",
    body: "Confirm stakeholders, evidence needs, and the next owner checkpoint.",
  },
};

const DEFAULT_STATES: readonly DiscoveryPageState[] = [
  "ready",
  "ready",
  "ready",
  "generating",
  "failed",
  "waiting",
  "waiting",
];

function pageFixture(
  state: DiscoveryPageState,
  index: number,
): DiscoveryWorkspacePage {
  const catalog = DISCOVERY_PAGE_CATALOG[index];
  const content = PAGE_CONTENT[catalog.id];
  return {
    id: catalog.id,
    label: catalog.label,
    state,
    title: state === "waiting" ? "" : content.title,
    body: state === "waiting" ? "" : content.body,
    source_references: state === "ready"
      ? [{
          id: `source-${catalog.id}`,
          label: "Client information",
          detail: "Fixture evidence for UI integration only.",
        }]
      : [],
    failure_message: state === "failed" ? "Generation stopped before this page was completed." : null,
  };
}

export function createDiscoveryWorkspaceFixture(
  opportunityId: string,
  states: readonly DiscoveryPageState[] = DEFAULT_STATES,
): DiscoveryWorkspaceVersion {
  if (!opportunityId.trim() || states.length !== DISCOVERY_PAGE_CATALOG.length) {
    throw new DiscoveryWorkspaceError("validation", "A scoped opportunity and exactly seven page states are required.");
  }
  const allReady = states.every((state) => state === "ready");
  return requireDiscoveryWorkspaceVersion({
    opportunity_id: opportunityId,
    version_id: "discovery-v1",
    revision: 1,
    document_state: "draft",
    pages: states.map(pageFixture),
    pdf_artifact_id: allReady ? "discovery-pdf-v1" : null,
    pdf_download_url: allReady ? `/fixtures/${encodeURIComponent(opportunityId)}/discovery-v1.pdf` : null,
    pdf_source_revision: allReady ? 1 : null,
    source: "fixture",
  });
}

export function requireDiscoveryWorkspaceVersion(value: unknown): DiscoveryWorkspaceVersion {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DiscoveryWorkspaceError("validation", "Discovery workspace payload must be an object.");
  }
  const row = value as Partial<DiscoveryWorkspaceVersion>;
  if (
    typeof row.opportunity_id !== "string" ||
    typeof row.version_id !== "string" ||
    typeof row.revision !== "number" ||
    (row.document_state !== "draft" && row.document_state !== "approved") ||
    row.source !== "fixture" && row.source !== "live" ||
    !Array.isArray(row.pages) ||
    row.pages.length !== DISCOVERY_PAGE_CATALOG.length
  ) {
    throw new DiscoveryWorkspaceError("validation", "Discovery workspace payload is incomplete.");
  }
  row.pages.forEach((page, index) => {
    const expected = DISCOVERY_PAGE_CATALOG[index];
    if (
      page.id !== expected.id ||
      page.label !== expected.label ||
      !(DISCOVERY_PAGE_STATES as readonly string[]).includes(page.state) ||
      typeof page.title !== "string" ||
      typeof page.body !== "string" ||
      !Array.isArray(page.source_references)
    ) {
      throw new DiscoveryWorkspaceError("validation", `Discovery page ${index + 1} is invalid.`);
    }
  });
  return structuredClone(row as DiscoveryWorkspaceVersion);
}

export function isDiscoveryComplete(version: DiscoveryWorkspaceVersion): boolean {
  return version.pages.every((page) => page.state === "ready");
}

export function canApproveDiscovery(version: DiscoveryWorkspaceVersion): boolean {
  return version.document_state === "draft" && canDownloadDiscoveryPdf(version);
}

export function canDownloadDiscoveryPdf(version: DiscoveryWorkspaceVersion): boolean {
  return isDiscoveryComplete(version) &&
    version.pdf_source_revision === version.revision &&
    Boolean(version.pdf_artifact_id && version.pdf_download_url);
}

function fixturePdf(version: DiscoveryWorkspaceVersion, revision: number) {
  return {
    pdf_artifact_id: `discovery-pdf-${version.version_id}-r${revision}`,
    pdf_download_url: `/fixtures/${encodeURIComponent(version.opportunity_id)}/${version.version_id}-r${revision}.pdf`,
    pdf_source_revision: revision,
  };
}

function successorVersionId(versionId: string): string {
  const match = /^(.*?)-v(\d+)$/.exec(versionId);
  return match ? `${match[1]}-v${Number(match[2]) + 1}` : `${versionId}-v2`;
}

function assertIdentity(
  version: DiscoveryWorkspaceVersion,
  opportunityId: string,
  versionId: string,
) {
  if (version.opportunity_id !== opportunityId || version.version_id !== versionId) {
    throw new DiscoveryWorkspaceError("authorization", "Discovery data belongs to another opportunity or version.");
  }
}

function assertRevision(version: DiscoveryWorkspaceVersion, expectedRevision: number) {
  if (version.revision !== expectedRevision) {
    throw new DiscoveryWorkspaceError("conflict", "The Discovery version changed in another session.");
  }
}

export function createFixtureDiscoveryWorkspaceAdapter(
  initial: DiscoveryWorkspaceVersion,
): DiscoveryWorkspaceAdapter {
  let version = requireDiscoveryWorkspaceVersion(initial);
  return {
    async load(opportunityId, versionId) {
      assertIdentity(version, opportunityId, versionId);
      return structuredClone(version);
    },
    async savePage(input) {
      assertIdentity(version, input.opportunity_id, input.version_id);
      assertRevision(version, input.expected_revision);
      if (version.document_state === "approved") {
        throw new DiscoveryWorkspaceError("ineligible", "Approved Discovery versions are read-only.");
      }
      const pageIndex = version.pages.findIndex((page) => page.id === input.page_id);
      const page = version.pages[pageIndex];
      if (!page || page.state !== "ready") {
        throw new DiscoveryWorkspaceError("ineligible", "Only ready pages can be edited.");
      }
      if (!input.title.trim() || !input.body.trim()) {
        throw new DiscoveryWorkspaceError("validation", "Title and page content are required.");
      }
      const revision = version.revision + 1;
      const allReady = version.pages.every((current, index) => index === pageIndex || current.state === "ready");
      version = {
        ...version,
        revision,
        ...(allReady ? fixturePdf(version, revision) : {
          pdf_artifact_id: null,
          pdf_download_url: null,
          pdf_source_revision: null,
        }),
        pages: version.pages.map((current, index) => index === pageIndex
          ? { ...current, title: input.title.trim(), body: input.body.trim() }
          : current),
      };
      return structuredClone(version);
    },
    async retryPage(input) {
      assertIdentity(version, input.opportunity_id, input.version_id);
      assertRevision(version, input.expected_revision);
      const pageIndex = version.pages.findIndex((page) => page.id === input.page_id);
      const page = version.pages[pageIndex];
      if (!page || page.state !== "failed") {
        throw new DiscoveryWorkspaceError("ineligible", "Only failed pages can be retried.");
      }
      const pages = version.pages.map((current, index) => index === pageIndex
        ? {
            ...current,
            ...PAGE_CONTENT[current.id],
            state: "ready" as const,
            failure_message: null,
            source_references: [{
              id: `source-${current.id}`,
              label: "Client information",
              detail: "Fixture evidence for UI integration only.",
            }],
          }
        : current);
      const revision = version.revision + 1;
      const allReady = pages.every((page) => page.state === "ready");
      version = {
        ...version,
        revision,
        pages,
        ...(allReady ? fixturePdf(version, revision) : {}),
      };
      return structuredClone(version);
    },
    async advanceGeneration(input) {
      assertIdentity(version, input.opportunity_id, input.version_id);
      assertRevision(version, input.expected_revision);
      if (version.document_state !== "draft") {
        throw new DiscoveryWorkspaceError("ineligible", "Approved Discovery versions cannot generate more pages.");
      }
      const pages = version.pages.map((page) => ({ ...page }));
      const generatingIndex = pages.findIndex((page) => page.state === "generating");
      if (generatingIndex >= 0) {
        pages[generatingIndex] = {
          ...pages[generatingIndex],
          ...PAGE_CONTENT[pages[generatingIndex].id],
          state: "ready",
          source_references: [{
            id: `source-${pages[generatingIndex].id}`,
            label: "Client information",
            detail: "Fixture evidence for UI integration only.",
          }],
        };
      }
      const waitingIndex = pages.findIndex((page, index) =>
        page.state === "waiting" && pages.slice(0, index).every((previous) => previous.state === "ready"),
      );
      if (waitingIndex >= 0) pages[waitingIndex] = { ...pages[waitingIndex], state: "generating" };
      const allReady = pages.every((page) => page.state === "ready");
      const revision = version.revision + 1;
      version = {
        ...version,
        revision,
        pages,
        ...(allReady ? fixturePdf(version, revision) : {
          pdf_artifact_id: null,
          pdf_download_url: null,
          pdf_source_revision: null,
        }),
      };
      return structuredClone(version);
    },
    async approve(input) {
      assertIdentity(version, input.opportunity_id, input.version_id);
      assertRevision(version, input.expected_revision);
      if (!canApproveDiscovery(version)) {
        throw new DiscoveryWorkspaceError("ineligible", "Every Discovery page and its exact-version PDF must be ready before approval.");
      }
      const revision = version.revision + 1;
      version = { ...version, revision, document_state: "approved", pdf_source_revision: revision };
      return structuredClone(version);
    },
    async createSuccessor(input) {
      assertIdentity(version, input.opportunity_id, input.approved_version_id);
      if (version.document_state !== "approved") {
        throw new DiscoveryWorkspaceError("ineligible", "Only an approved version can have a successor draft.");
      }
      version = {
        ...version,
        version_id: successorVersionId(version.version_id),
        revision: 1,
        document_state: "draft",
        pdf_artifact_id: null,
        pdf_download_url: null,
        pdf_source_revision: null,
      };
      return structuredClone(version);
    },
  };
}

export function discoveryWorkspaceErrorMessage(error: unknown): string {
  if (!(error instanceof DiscoveryWorkspaceError)) return "Discovery could not be updated. Try again.";
  if (error.kind === "conflict") return "This Discovery version changed in another session. Reload before continuing.";
  if (error.kind === "authorization") return "This Discovery version is not available for this opportunity.";
  if (error.kind === "retryable") return "The connection was interrupted. Try the action again.";
  return error.message;
}
