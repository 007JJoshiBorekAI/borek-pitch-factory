import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { DISCOVERY_PAGE_CATALOG } from "./discoveryFirst.js";
import {
  DiscoveryWorkspaceError,
  canApproveDiscovery,
  canDownloadDiscoveryPdf,
  continueDiscoveryGeneration,
  createDiscoveryWorkspaceFixture,
  createFixtureDiscoveryWorkspaceAdapter,
  isDiscoveryComplete,
  requireDiscoveryWorkspaceVersion,
} from "./discoveryWorkspace.js";

async function run() {
  const mixed = createDiscoveryWorkspaceFixture("opp-ms42");
  assert.equal(mixed.pages.length, 7);
  assert.deepEqual(
    mixed.pages.map(({ id }) => id),
    DISCOVERY_PAGE_CATALOG.map(({ id }) => id),
  );
  assert.deepEqual(
    mixed.pages.map(({ state }) => state),
    ["ready", "ready", "ready", "generating", "failed", "waiting", "waiting"],
  );
  assert.equal(isDiscoveryComplete(mixed), false);
  assert.equal(canApproveDiscovery(mixed), false);
  assert.equal(canDownloadDiscoveryPdf(mixed), false);

  const progressionAdapter = createFixtureDiscoveryWorkspaceAdapter(mixed);
  let progressed = await progressionAdapter.advanceGeneration({
    opportunity_id: mixed.opportunity_id,
    version_id: mixed.version_id,
    expected_revision: mixed.revision,
  });
  assert.equal(progressed.pages[3].state, "ready");
  assert.equal(progressed.pages[5].state, "waiting", "failed page blocks later generation");
  progressed = await progressionAdapter.retryPage({
    opportunity_id: progressed.opportunity_id,
    version_id: progressed.version_id,
    page_id: "relevant_use_case",
    expected_revision: progressed.revision,
  });
  for (let step = 0; step < 3; step += 1) {
    progressed = await progressionAdapter.advanceGeneration({
      opportunity_id: progressed.opportunity_id,
      version_id: progressed.version_id,
      expected_revision: progressed.revision,
    });
  }
  assert.equal(isDiscoveryComplete(progressed), true);
  assert.equal(canDownloadDiscoveryPdf(progressed), true);

  const readyBeforeContinue = mixed.pages.filter((page) => page.state === "ready").map((page) => ({
    id: page.id,
    title: page.title,
    body: page.body,
  }));
  const continueAdapter = createFixtureDiscoveryWorkspaceAdapter(mixed);
  let continued = await continueDiscoveryGeneration(continueAdapter, mixed);
  assert.equal(continued.version_id, mixed.version_id);
  assert.equal(continued.pages[3].state, "ready");
  assert.equal(continued.pages[4].state, "ready");
  assert.equal(continued.pages[4].failure_message, null);
  assert.equal(continued.pages[5].state, "generating");
  assert.equal(continued.pages[6].state, "waiting");
  assert.deepEqual(
    continued.pages.filter((page) => readyBeforeContinue.some((ready) => ready.id === page.id)).map((page) => ({
      id: page.id,
      title: page.title,
      body: page.body,
    })),
    readyBeforeContinue,
  );
  assert.equal(canApproveDiscovery(continued), false);
  while (!isDiscoveryComplete(continued)) {
    continued = await continueDiscoveryGeneration(continueAdapter, continued);
  }
  assert.equal(isDiscoveryComplete(continued), true);
  assert.equal(canApproveDiscovery(continued), true);
  assert.deepEqual(continued.pages.map((page) => page.state), Array(7).fill("ready"));

  const adapter = createFixtureDiscoveryWorkspaceAdapter(mixed);
  const readyBeforeRetry = mixed.pages.filter((page) => page.state === "ready");
  const retried = await adapter.retryPage({
    opportunity_id: mixed.opportunity_id,
    version_id: mixed.version_id,
    page_id: "relevant_use_case",
    expected_revision: mixed.revision,
  });
  assert.equal(retried.pages.find((page) => page.id === "relevant_use_case")?.state, "ready");
  assert.deepEqual(
    retried.pages.filter((page) => readyBeforeRetry.some((ready) => ready.id === page.id)),
    readyBeforeRetry,
  );

  const saved = await adapter.savePage({
    opportunity_id: retried.opportunity_id,
    version_id: retried.version_id,
    page_id: "cover",
    expected_revision: retried.revision,
    title: "Updated cover",
    body: "Updated owner-reviewed content.",
  });
  assert.equal(saved.pages[0].title, "Updated cover");
  assert.equal(saved.revision, retried.revision + 1);
  await assert.rejects(
    () => adapter.savePage({
      opportunity_id: saved.opportunity_id,
      version_id: saved.version_id,
      page_id: "cover",
      expected_revision: retried.revision,
      title: "Stale edit",
      body: "Must not overwrite.",
    }),
    (error: unknown) => error instanceof DiscoveryWorkspaceError && error.kind === "conflict",
  );

  const allReady = createDiscoveryWorkspaceFixture("opp-ready", Array(7).fill("ready"));
  assert.equal(canApproveDiscovery(allReady), true);
  assert.equal(canDownloadDiscoveryPdf(allReady), true);
  assert.equal(allReady.pdf_artifact_id, "discovery-pdf-v1");
  assert.equal(allReady.pdf_source_revision, allReady.revision);
  const editAdapter = createFixtureDiscoveryWorkspaceAdapter(allReady);
  const editedReady = await editAdapter.savePage({
    opportunity_id: allReady.opportunity_id,
    version_id: allReady.version_id,
    page_id: "cover",
    expected_revision: allReady.revision,
    title: "Updated ready cover",
    body: "The exact PDF must follow this revision.",
  });
  assert.equal(canApproveDiscovery(editedReady), true);
  assert.equal(editedReady.pdf_source_revision, editedReady.revision);
  assert.notEqual(editedReady.pdf_artifact_id, allReady.pdf_artifact_id);
  assert.equal(canApproveDiscovery({ ...editedReady, pdf_source_revision: editedReady.revision - 1 }), false);
  const approvalAdapter = createFixtureDiscoveryWorkspaceAdapter(allReady);
  const approved = await approvalAdapter.approve({
    opportunity_id: allReady.opportunity_id,
    version_id: allReady.version_id,
    expected_revision: allReady.revision,
  });
  assert.equal(approved.document_state, "approved");
  await assert.rejects(
    () => approvalAdapter.savePage({
      opportunity_id: approved.opportunity_id,
      version_id: approved.version_id,
      page_id: "cover",
      expected_revision: approved.revision,
      title: "Mutation",
      body: "Approved versions are immutable.",
    }),
    (error: unknown) => error instanceof DiscoveryWorkspaceError && error.kind === "ineligible",
  );
  const successor = await approvalAdapter.createSuccessor({
    opportunity_id: approved.opportunity_id,
    approved_version_id: approved.version_id,
  });
  assert.equal(successor.document_state, "draft");
  assert.equal(successor.version_id, "discovery-v2");
  assert.equal(successor.pdf_artifact_id, null);
  assert.equal(approved.version_id, "discovery-v1", "creating a successor must not mutate approved data");
  assert.equal(approved.document_state, "approved");

  assert.equal(canApproveDiscovery(successor), false);
  const prepared = await approvalAdapter.advanceGeneration({
    opportunity_id: successor.opportunity_id,
    version_id: successor.version_id,
    expected_revision: successor.revision,
  });
  assert.deepEqual(prepared.pages, successor.pages, "preparing a manifest must not change page content or sources");
  assert.equal(prepared.version_id, successor.version_id);
  assert.equal(prepared.pdf_source_revision, prepared.revision);
  assert.equal(canApproveDiscovery(prepared), true, "all-ready successor can recover without editing a page");
  assert.equal(canDownloadDiscoveryPdf(prepared), true);
  assert.equal(successor.pdf_artifact_id, null, "preparation must not mutate its input snapshot");

  assert.throws(
    () => requireDiscoveryWorkspaceVersion({ ...mixed, pages: mixed.pages.slice(0, 6) }),
    DiscoveryWorkspaceError,
  );

  const component = readFileSync("src/components/DiscoveryWorkspace.tsx", "utf8");
  assert.match(component, /Waiting/);
  assert.match(component, /Generating/);
  assert.match(component, /Ready/);
  assert.match(component, /Failed/);
  assert.match(component, /expected_revision/);
  assert.match(component, /Retry this page/);
  assert.match(component, /Continue generation/);
  assert.match(component, /Create successor draft/);
  assert.match(component, /Prepare PDF preview manifest/);
  assert.match(component, /data-artifact-id/);
  assert.match(component, /<progress[^>]*max=\{version.pages.length\}[^>]*value=\{readyCount\}/);
  assert.match(component, /discovery-thumbnail/);
  assert.match(component, /discovery-paper-header/);
  assert.match(component, /discovery-paper-footer/);
  assert.match(component, /discovery-generation-card/);
  assert.match(component, /discovery-download-card/);
  assert.match(component, /Real PDF downloads require live integration/);
  assert.doesNotMatch(component, /setSelectedId\(preview\.discovery\.pages\[0\]\.id\)/);
  const css = readFileSync("src/app/pitch-shell.css", "utf8");
  assert.match(css, /\.discovery-document-workspace \.discovery-ready-page\s*\{[^}]*aspect-ratio: 210 \/ 297;[^}]*border-radius: 0;/);
  assert.match(css, /@media \(max-width: 960px\)\s*\{\s*\.artifact-preview-workspace \.workflow-artifact-grid\s*\{\s*grid-template-columns: minmax\(0, 1fr\);/);
  assert.doesNotMatch(component, /discovery_questions|Gamma|concretisation/);

  console.log("MS-42 Discovery workspace tests passed");
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
