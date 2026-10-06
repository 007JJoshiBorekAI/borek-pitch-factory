"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/AuthProvider";
import { WorkflowArtifactTabs } from "@/components/WorkflowArtifactTabs";
import { usePreviewJourney } from "@/components/PreviewJourneyProvider";
import { ApiRequestError, approveDiscoveryPaper, generateDiscoveryPaper } from "@/lib/api";
import {
  canApproveDiscovery,
  canDownloadDiscoveryPdf,
  continueDiscoveryGeneration,
  createFixtureDiscoveryWorkspaceAdapter,
  discoveryWorkspaceErrorMessage,
  isDiscoveryComplete,
  type DiscoveryWorkspacePage,
  type DiscoveryWorkspaceVersion,
} from "@/lib/discoveryWorkspace";

interface DiscoveryWorkspaceProps {
  initialVersion: DiscoveryWorkspaceVersion;
}

function downloadDiscoveryFixture(version: DiscoveryWorkspaceVersion) {
  const content = version.pages.map((page) => `${page.label}\n${page.title}\n${page.body}`).join("\n\n");
  const url = URL.createObjectURL(new Blob([`Preview fixture manifest; not a generated PDF.\n\n${content}`], { type: "text/plain" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${version.version_id}-pdf-preview-manifest.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

const STATUS_LABELS = {
  waiting: "Waiting",
  generating: "Generating",
  ready: "Ready",
  failed: "Failed",
} as const;

export function DiscoveryWorkspace({ initialVersion }: DiscoveryWorkspaceProps) {
  const router = useRouter();
  const { accessToken, previewMode } = useAuth();
  const live = Boolean(accessToken) && !previewMode;
  const { getOpportunity, updateDiscovery, approveDiscovery } = usePreviewJourney();
  const adapterRef = useRef(createFixtureDiscoveryWorkspaceAdapter(initialVersion));
  const [version, setVersion] = useState(initialVersion);
  const [selectedId, setSelectedId] = useState(initialVersion.pages[0].id);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initialVersion.pages[0].title);
  const [body, setBody] = useState(initialVersion.pages[0].body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const selected = version.pages.find((page) => page.id === selectedId) ?? version.pages[0];
  const preview = getOpportunity(initialVersion.opportunity_id);
  const persistedVersion = preview?.discovery;
  const readyCount = version.pages.filter((page) => page.state === "ready").length;
  const generatingPage = version.pages.find((page) => page.state === "generating");
  const failedCount = version.pages.filter((page) => page.state === "failed").length;
  const pageNumber = String(version.pages.indexOf(selected) + 1).padStart(2, "0");

  useEffect(() => {
    const loaded = persistedVersion ?? initialVersion;
    adapterRef.current = createFixtureDiscoveryWorkspaceAdapter(loaded);
    setVersion(loaded);
  }, [persistedVersion, initialVersion]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  function selectPage(page: DiscoveryWorkspacePage) {
    setSelectedId(page.id);
    setTitle(page.title);
    setBody(page.body);
    setEditing(false);
    setError(null);
    setNotice(null);
  }

  async function savePage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await adapterRef.current.savePage({
        opportunity_id: version.opportunity_id,
        version_id: version.version_id,
        page_id: selected.id,
        expected_revision: version.revision,
        title,
        body,
      });
      setVersion(saved);
      updateDiscovery(saved);
      setEditing(false);
      setNotice(`${selected.label} saved in ${saved.version_id}.`);
    } catch (saveError) {
      setError(discoveryWorkspaceErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  }

  async function retryPage() {
    setBusy(true);
    setError(null);
    try {
      const retried = await adapterRef.current.retryPage({
        opportunity_id: version.opportunity_id,
        version_id: version.version_id,
        page_id: selected.id,
        expected_revision: version.revision,
      });
      const nextPage = retried.pages.find((page) => page.id === selected.id)!;
      setVersion(retried);
      updateDiscovery(retried);
      setTitle(nextPage.title);
      setBody(nextPage.body);
      setNotice(`${nextPage.label} is ready. Other completed pages were preserved.`);
    } catch (retryError) {
      setError(discoveryWorkspaceErrorMessage(retryError));
    } finally {
      setBusy(false);
    }
  }

  async function advanceGeneration() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (live && accessToken) {
        await generateDiscoveryPaper(accessToken, version.opportunity_id, preview?.client.values);
      }
      const advanced = await continueDiscoveryGeneration(adapterRef.current, version);
      setVersion(advanced);
      updateDiscovery(advanced);
    } catch (advanceError) {
      setError(advanceError instanceof ApiRequestError ? advanceError.message : discoveryWorkspaceErrorMessage(advanceError));
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      if (live && accessToken) {
        await approveDiscoveryPaper(accessToken, version.opportunity_id, preview?.client.values);
      }
      const approved = await adapterRef.current.approve({
        opportunity_id: version.opportunity_id,
        version_id: version.version_id,
        expected_revision: version.revision,
      });
      setVersion(approved);
      approveDiscovery(approved);
      setEditing(false);
      setNotice(`${approved.version_id} approved and locked.`);
      router.push(`/opportunities/${encodeURIComponent(approved.opportunity_id)}/presentations`);
    } catch (approvalError) {
      setError(approvalError instanceof ApiRequestError ? approvalError.message : discoveryWorkspaceErrorMessage(approvalError));
    } finally {
      setBusy(false);
    }
  }

  async function createSuccessor() {
    setBusy(true);
    setError(null);
    try {
      const successor = await adapterRef.current.createSuccessor({
        opportunity_id: version.opportunity_id,
        approved_version_id: version.version_id,
      });
      setVersion(successor);
      updateDiscovery(successor);
      setNotice(`${successor.version_id} created. The approved version remains unchanged.`);
    } catch (successorError) {
      setError(discoveryWorkspaceErrorMessage(successorError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="workflow-artifact-workspace artifact-preview-workspace discovery-document-workspace">
      <WorkflowArtifactTabs opportunityId={version.opportunity_id} active="discovery" />
      <progress className="discovery-progress" max={version.pages.length} value={readyCount} aria-label={`${readyCount} of ${version.pages.length} Discovery pages ready`} />
      <div id="artifact-panel-discovery" role="tabpanel" aria-labelledby="artifact-tab-discovery">
      <h1 id="discovery-workspace-title" className="sr-only">Discovery Document</h1>
      {error ? <p ref={errorRef} className="client-information-error" role="alert" tabIndex={-1}>{error}</p> : null}
      {notice ? <p className="client-information-notice" role="status" aria-live="polite">{notice}</p> : null}

      <div className="workflow-artifact-grid">
        <aside className="workflow-page-list" aria-label="Discovery pages">
          <div className="discovery-list-heading"><span>Pages</span><span>Status</span></div>
          <ol>
            {version.pages.map((page, index) => (
              <li key={page.id} className={page.id === selected.id ? "is-selected" : undefined}>
                <button type="button" disabled={busy || editing} onClick={() => selectPage(page)} aria-current={page.id === selected.id ? "page" : undefined}>
                  <span className={`discovery-thumbnail is-${page.state}`} aria-hidden="true"><i /><i /><i /><i /></span>
                  <span className="discovery-page-label">
                    <strong><span className="workflow-page-number">{String(index + 1).padStart(2, "0")}</span>{page.label}</strong>
                    <small className={`is-${page.state}`}>{STATUS_LABELS[page.state]}</small>
                  </span>
                  <span className={`discovery-status-mark is-${page.state}`} aria-hidden="true">
                    {page.state === "ready" ? <svg viewBox="0 0 16 16" fill="none"><path d="m4 8 3 3 5-6" stroke="currentColor" strokeWidth="1.5" /></svg> : page.state === "failed" ? "!" : <i />}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        <article className="workflow-preview-panel">
          <div className="discovery-page-toolbar">
            <p className="workflow-panel-label">Page {pageNumber} · {selected.label}</p>
            {selected.state === "ready" && version.document_state === "draft" && !editing ? (
              <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => { setTitle(selected.title); setBody(selected.body); setEditing(true); }}>Edit page</button>
            ) : null}
          </div>

          <div className="discovery-preview-content">
          {editing ? (
            <form className="discovery-page-editor" onSubmit={(event) => void savePage(event)}>
              <label>Page title<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
              <label>Page content<textarea value={body} onChange={(event) => setBody(event.target.value)} rows={12} required /></label>
              <div>
                <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => { setEditing(false); setTitle(selected.title); setBody(selected.body); }}>Cancel</button>
                <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving..." : "Save page"}</button>
              </div>
            </form>
          ) : selected.state === "ready" ? (
            <div className="discovery-ready-page">
              <div className="discovery-paper-header" aria-hidden="true" />
              <p className="discovery-page-eyebrow">{preview?.client.values.company_name ?? "Discovery Paper"} · {selected.label}</p>
              <h2>{selected.title}</h2>
              <div className="discovery-paper-body">{selected.body.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
              <footer className="discovery-paper-footer"><span>BOREK Solutions Group · {pageNumber}</span><span>CONFIDENTIAL</span></footer>
            </div>
          ) : selected.state === "failed" ? (
            <div className="discovery-page-state is-failed" role="alert">
              <strong>Page generation failed</strong>
              <p>{selected.failure_message}</p>
              <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void retryPage()}>{busy ? "Retrying..." : "Retry this page"}</button>
            </div>
          ) : (
            <div className={`discovery-page-state is-${selected.state}`} role="status">
              <strong>{STATUS_LABELS[selected.state]}</strong>
              <p>{selected.state === "generating" ? "This page is being prepared. Ready pages remain available for review." : "This page will start after the preceding generation work completes."}</p>
            </div>
          )}
          <p className="discovery-preview-caption">Generated pages become available here immediately.</p>
          {selected.state === "ready" && selected.source_references.length > 0 ? (
                <div className="discovery-source-list" aria-label="Source references">
                  {selected.source_references.map((reference) => (
                    <details key={reference.id}><summary>{reference.label}</summary><p>{reference.detail}</p></details>
                  ))}
                </div>
          ) : null}

          <div className="discovery-generation-card">
            <div role="status" aria-live="polite">
              <strong>{generatingPage ? `Generating page ${String(version.pages.indexOf(generatingPage) + 1).padStart(2, "0")}` : failedCount ? "Generation needs attention" : isDiscoveryComplete(version) ? "Discovery pages ready" : "Waiting for generation"}</strong>
              <p>{generatingPage?.label ?? `${readyCount} of ${version.pages.length} pages ready`}{failedCount > 0 ? ` · ${failedCount} failed; select a failed page to retry.` : ""}</p>
            </div>
            {!isDiscoveryComplete(version) && version.document_state === "draft" ? (
              <button className="btn btn-secondary" type="button" disabled={busy || editing} onClick={() => void advanceGeneration()}>
                {busy ? "Generating..." : "Continue generation"}
              </button>
            ) : null}
          </div>
          <footer className="discovery-download-card">
            <strong>{isDiscoveryComplete(version) ? "All seven pages are ready for review." : "Download will be available when all seven pages are ready."}</strong>
            <p>{version.source === "fixture" ? "Local fixture preview. Real PDF downloads require live integration; the preview manifest is a text file." : "You can continue reviewing completed pages."}</p>
            <div className="discovery-version-actions">
            {canDownloadDiscoveryPdf(version) ? (
              <button className="btn btn-secondary" type="button" onClick={() => downloadDiscoveryFixture(version)} data-artifact-id={version.pdf_artifact_id!}>Download PDF preview manifest</button>
            ) : (
              <button className="btn btn-secondary" type="button" disabled>Download PDF</button>
            )}
            {version.document_state === "approved" ? (
              <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void createSuccessor()}>Create successor draft</button>
            ) : (
              <button className="btn btn-primary" type="button" disabled={busy || editing || !canApproveDiscovery(version)} onClick={() => void approve()}>Approve {version.version_id}</button>
            )}
          {!canApproveDiscovery(version) && version.document_state === "draft" ? <p className="discovery-gate-copy">Approval remains blocked until all seven pages and their exact-version PDF are ready.</p> : null}
            </div>
            <small className="discovery-version-label">{version.version_id} · Revision {version.revision} · {version.document_state === "approved" ? "Approved and locked" : "Draft"}</small>
          </footer>
          </div>
        </article>
      </div>
      </div>
    </section>
  );
}
