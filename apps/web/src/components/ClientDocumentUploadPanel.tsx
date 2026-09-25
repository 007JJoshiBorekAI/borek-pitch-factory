"use client";

import React, { useEffect, useRef, useState, type MutableRefObject } from "react";

import {
  deleteClientDocument,
  listClientDocuments,
  uploadClientDocument,
  type ClientDocument,
} from "@/lib/api";
import {
  clientDocumentErrorMessage,
  isClientDocumentEndpointUnavailable,
  isMissingClientDocumentError,
} from "@/lib/apiErrors";
import {
  CLIENT_DOCUMENT_ACCEPT,
  clientDocumentStatusLabel,
  validateClientDocumentFile,
} from "@/lib/clientDocuments";

interface UploadRow {
  id: string;
  fileName: string;
  status: "uploading" | "error";
  errorMessage?: string;
}

interface ClientDocumentUploadPanelProps {
  accessToken: string | null;
  opportunityId: string | null;
  disabled?: boolean;
  onDocumentsChange?: (documents: ClientDocument[]) => void;
  heading?: string;
  description?: string;
  scopeNote?: string;
  variant?: "default" | "compact";
  uploadTriggerRef?: MutableRefObject<(() => void) | null>;
}

function statusClassName(status: string): string {
  return `status-badge status-${status === "processed" ? "success" : status}`;
}

export function ClientDocumentUploadPanel({
  accessToken,
  opportunityId,
  disabled = false,
  onDocumentsChange,
  heading = "Client documents",
  description = "Upload background material from the client. Meeting transcripts are added after the first call (Deepening stage).",
  scopeNote,
  variant = "default",
  uploadTriggerRef,
}: ClientDocumentUploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [uploadRows, setUploadRows] = useState<UploadRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [endpointUnavailable, setEndpointUnavailable] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ClientDocument | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const canUpload = Boolean(accessToken && opportunityId) && !disabled && !endpointUnavailable;
  const panelDisabled = disabled || loading || uploading || deleteBusy;

  useEffect(() => {
    if (!uploadTriggerRef) {
      return;
    }
    uploadTriggerRef.current = () => {
      inputRef.current?.click();
    };
    return () => {
      uploadTriggerRef.current = null;
    };
  }, [uploadTriggerRef]);

  function updateDocuments(rows: ClientDocument[]) {
    const sorted = [...rows].sort((a, b) => a.document_key.localeCompare(b.document_key));
    setDocuments(sorted);
    onDocumentsChange?.(sorted);
  }

  useEffect(() => {
    setDocuments([]);
    setUploadRows([]);
    setError(null);
    setNotice(null);
    setEndpointUnavailable(false);
    setDeleteTarget(null);
    onDocumentsChange?.([]);

    if (!accessToken || !opportunityId) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    void listClientDocuments(accessToken, opportunityId)
      .then((rows) => {
        if (!cancelled) {
          updateDocuments(rows);
        }
      })
      .catch((loadError) => {
        if (cancelled) {
          return;
        }
        if (isClientDocumentEndpointUnavailable(loadError)) {
          setEndpointUnavailable(true);
        }
        setError(clientDocumentErrorMessage(loadError));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, opportunityId]);

  async function uploadFiles(files: File[]) {
    if (!accessToken || !opportunityId) {
      setError("Create an opportunity before uploading client documents.");
      return;
    }
    if (files.length === 0) {
      return;
    }

    setUploading(true);
    setError(null);
    setNotice(null);

    let successCount = 0;

    for (const file of files) {
      const rowId = `${file.name}-${file.lastModified}-${file.size}`;
      const validation = validateClientDocumentFile(file);
      if (!validation.ok) {
        setUploadRows((current) => [
          ...current,
          { id: rowId, fileName: file.name, status: "error", errorMessage: validation.reason },
        ]);
        setError(validation.reason ?? "This document could not be uploaded.");
        continue;
      }

      setUploadRows((current) => [...current, { id: rowId, fileName: file.name, status: "uploading" }]);

      try {
        const response = await uploadClientDocument(accessToken, opportunityId, file);
        setDocuments((current) => {
          const next = [...current.filter((row) => row.id !== response.document.id), response.document].sort(
            (a, b) => a.document_key.localeCompare(b.document_key),
          );
          onDocumentsChange?.(next);
          return next;
        });
        successCount += 1;
        setUploadRows((current) => current.filter((row) => row.id !== rowId));
      } catch (uploadError) {
        const message = clientDocumentErrorMessage(uploadError);
        if (isClientDocumentEndpointUnavailable(uploadError)) {
          setEndpointUnavailable(true);
        }
        setUploadRows((current) =>
          current.map((row) =>
            row.id === rowId ? { ...row, status: "error", errorMessage: message } : row,
          ),
        );
        setError(message);
      }
    }

    if (successCount > 0) {
      setNotice(
        `${successCount} client document${successCount === 1 ? "" : "s"} uploaded successfully.`,
      );
    }

    setUploading(false);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function handleInputChange(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) {
      return;
    }
    void uploadFiles(Array.from(fileList));
  }

  async function confirmDelete() {
    if (!deleteTarget || !accessToken || !opportunityId) {
      return;
    }
    setDeleteBusy(true);
    setError(null);
    try {
      await deleteClientDocument(accessToken, opportunityId, deleteTarget.id);
      setDocuments((current) => {
        const next = current.filter((row) => row.id !== deleteTarget.id);
        onDocumentsChange?.(next);
        return next;
      });
      setNotice(`${deleteTarget.file_name} removed.`);
      setDeleteTarget(null);
    } catch (deleteError) {
      if (isMissingClientDocumentError(deleteError)) {
        setDocuments((current) => {
          const next = current.filter((row) => row.id !== deleteTarget.id);
          onDocumentsChange?.(next);
          return next;
        });
        setDeleteTarget(null);
      }
      setError(clientDocumentErrorMessage(deleteError));
    } finally {
      setDeleteBusy(false);
    }
  }

  const processedCount = documents.filter((row) => row.processing_status === "processed").length;

  if (variant === "compact") {
    return (
      <div className="post-meeting-documents-compact">
        <input
          ref={inputRef}
          type="file"
          accept={CLIENT_DOCUMENT_ACCEPT}
          multiple
          className="sr-only"
          disabled={panelDisabled || !canUpload}
          onChange={(event) => handleInputChange(event.target.files)}
        />

        {error ? <div className="alert alert-error">{error}</div> : null}
        {notice ? (
          <p className="post-meeting-inline-notice" role="status">
            {notice}
          </p>
        ) : null}

        {loading ? <p className="post-meeting-inline-hint">Loading client documents…</p> : null}

        {documents.length > 0 ? (
          <ul className="post-meeting-document-list" aria-label="Added client documents">
            {documents.map((document) => (
              <li key={document.id} className="post-meeting-document-row">
                <span className="post-meeting-document-name">{document.file_name}</span>
                <span className="post-meeting-status-badge">
                  {document.processing_status === "processed" ? "ADDED" : "PROCESSING"}
                </span>
                <button
                  type="button"
                  className="post-meeting-text-button"
                  disabled={panelDisabled}
                  onClick={() => setDeleteTarget(document)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {uploadRows.length > 0 ? (
          <ul className="post-meeting-document-list" aria-label="Upload progress">
            {uploadRows.map((row) => (
              <li key={row.id} className="post-meeting-document-row">
                <span className="post-meeting-document-name">{row.fileName}</span>
                <span className="post-meeting-status-badge">
                  {row.status === "uploading" ? "UPLOADING" : "FAILED"}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {endpointUnavailable ? (
          <p className="post-meeting-inline-hint">
            Client document upload requires the BT-35 backend on this environment.
          </p>
        ) : null}

        {deleteTarget ? (
          <div className="client-document-delete-dialog" role="dialog" aria-labelledby="delete-document-title">
            <strong id="delete-document-title">Remove {deleteTarget.file_name}?</strong>
            <p>This document will be deleted from the opportunity. This cannot be undone.</p>
            <div className="client-document-delete-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={deleteBusy}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={deleteBusy}
                onClick={() => void confirmDelete()}
              >
                {deleteBusy ? "Removing…" : "Remove document"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <section className="upload-panel client-document-panel" aria-labelledby="client-documents-title">
      <header className="upload-panel-header">
        <div>
          <h2 id="client-documents-title">{heading}</h2>
          <p>{description}</p>
          {scopeNote ? <p className="upload-hint">{scopeNote}</p> : null}
        </div>
        {processedCount > 0 ? (
          <div className="upload-stat-strip" aria-label="Client document summary">
            <span>
              {processedCount} processed document{processedCount === 1 ? "" : "s"}
            </span>
          </div>
        ) : null}
      </header>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? (
        <p className="client-document-notice" role="status">
          {notice}
        </p>
      ) : null}

      {!canUpload && !endpointUnavailable ? (
        <p className="upload-hint">
          Create an opportunity above to upload PDF, DOCX, or TXT files up to 10 MB each.
        </p>
      ) : null}

      {endpointUnavailable ? (
        <p className="upload-hint">
          Client document upload requires the BT-35 backend on this environment. Text intake remains
          available.
        </p>
      ) : (
        <>
          <div
            className={`file-dropzone${dragActive ? " is-active" : ""}${panelDisabled ? " is-disabled" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!panelDisabled) {
                setDragActive(true);
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              if (!panelDisabled) {
                handleInputChange(event.dataTransfer.files);
              }
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept={CLIENT_DOCUMENT_ACCEPT}
              multiple
              className="sr-only"
              disabled={panelDisabled || !canUpload}
              onChange={(event) => handleInputChange(event.target.files)}
            />
            <p>Select or drop client documents</p>
            <p className="upload-hint">PDF, DOCX, or TXT · 10 MB maximum per file</p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={panelDisabled || !canUpload}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? "Uploading…" : "Choose files"}
            </button>
          </div>

          {loading ? <p className="journey-start-loading">Loading client documents…</p> : null}

          {uploadRows.length > 0 ? (
            <ul className="client-document-upload-rows" aria-label="Upload progress">
              {uploadRows.map((row) => (
                <li key={row.id}>
                  <span>{row.fileName}</span>
                  {row.status === "uploading" ? (
                    <span className="journey-start-loading">Uploading…</span>
                  ) : (
                    <span className="alert alert-error">{row.errorMessage}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}

          {documents.length > 0 ? (
            <div className="file-table-wrap">
              <table className="file-table">
                <thead>
                  <tr>
                    <th scope="col">Document</th>
                    <th scope="col">Key</th>
                    <th scope="col">Status</th>
                    <th scope="col">Sections</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((document) => (
                    <tr key={document.id}>
                      <td>{document.file_name}</td>
                      <td>{document.document_key}</td>
                      <td>
                        <span className={statusClassName(document.processing_status)}>
                          {clientDocumentStatusLabel(document.processing_status)}
                        </span>
                      </td>
                      <td>{document.section_count}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-quiet btn-sm"
                          disabled={panelDisabled}
                          onClick={() => setDeleteTarget(document)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}

      {deleteTarget ? (
        <div className="client-document-delete-dialog" role="dialog" aria-labelledby="delete-document-title">
          <strong id="delete-document-title">Remove {deleteTarget.file_name}?</strong>
          <p>This document will be deleted from the opportunity. This cannot be undone.</p>
          <div className="client-document-delete-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={deleteBusy}
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={deleteBusy}
              onClick={() => void confirmDelete()}
            >
              {deleteBusy ? "Removing…" : "Remove document"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function countProcessedClientDocuments(documents: ClientDocument[]): number {
  return documents.filter((row) => row.processing_status === "processed").length;
}
