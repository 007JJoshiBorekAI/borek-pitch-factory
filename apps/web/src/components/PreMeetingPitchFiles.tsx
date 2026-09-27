"use client";

import React, { useEffect, useRef, useState } from "react";

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
import { CLIENT_DOCUMENT_ACCEPT, validateClientDocumentFile } from "@/lib/clientDocuments";

interface PreMeetingPitchFilesProps {
  accessToken: string | null;
  opportunityId: string | null;
  disabled?: boolean;
  onDocumentsChange?: (documents: ClientDocument[]) => void;
  stagedFiles: File[];
  onStagedFilesChange: (files: File[]) => void;
}

export function PreMeetingPitchFiles({
  accessToken,
  opportunityId,
  disabled = false,
  onDocumentsChange,
  stagedFiles,
  onStagedFilesChange,
}: PreMeetingPitchFilesProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endpointUnavailable, setEndpointUnavailable] = useState(false);

  const panelDisabled = disabled || loading || uploading;

  function updateDocuments(rows: ClientDocument[]) {
    const sorted = [...rows].sort((a, b) => a.document_key.localeCompare(b.document_key));
    setDocuments(sorted);
    onDocumentsChange?.(sorted);
  }

  useEffect(() => {
    setDocuments([]);
    setError(null);
    setEndpointUnavailable(false);
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
        if (!cancelled && isClientDocumentEndpointUnavailable(loadError)) {
          setEndpointUnavailable(true);
        }
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
      onStagedFilesChange([...stagedFiles, ...files]);
      return;
    }

    setUploading(true);
    setError(null);
    for (const file of files) {
      const validation = validateClientDocumentFile(file);
      if (!validation.ok) {
        setError(validation.reason ?? "This document could not be uploaded.");
        continue;
      }
      try {
        const response = await uploadClientDocument(accessToken, opportunityId, file);
        setDocuments((current) => {
          const next = [...current.filter((row) => row.id !== response.document.id), response.document].sort(
            (a, b) => a.document_key.localeCompare(b.document_key),
          );
          onDocumentsChange?.(next);
          return next;
        });
      } catch (uploadError) {
        if (isClientDocumentEndpointUnavailable(uploadError)) {
          setEndpointUnavailable(true);
        }
        setError(clientDocumentErrorMessage(uploadError));
      }
    }
    setUploading(false);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function handlePick(fileList: FileList | null) {
    if (!fileList?.length || panelDisabled) {
      return;
    }
    void uploadFiles(Array.from(fileList));
  }

  async function removeDocument(document: ClientDocument) {
    if (!accessToken || !opportunityId) {
      return;
    }
    try {
      await deleteClientDocument(accessToken, opportunityId, document.id);
      setDocuments((current) => {
        const next = current.filter((row) => row.id !== document.id);
        onDocumentsChange?.(next);
        return next;
      });
    } catch (deleteError) {
      if (isMissingClientDocumentError(deleteError)) {
        setDocuments((current) => {
          const next = current.filter((row) => row.id !== document.id);
          onDocumentsChange?.(next);
          return next;
        });
      } else {
        setError(clientDocumentErrorMessage(deleteError));
      }
    }
  }

  function removeStaged(index: number) {
    onStagedFilesChange(stagedFiles.filter((_, fileIndex) => fileIndex !== index));
  }

  const hasItems = documents.length > 0 || stagedFiles.length > 0;

  return (
    <div className="pre-meeting-pitch-files">
      <input
        ref={inputRef}
        type="file"
        accept={CLIENT_DOCUMENT_ACCEPT}
        multiple
        className="sr-only"
        disabled={panelDisabled || endpointUnavailable}
        onChange={(event) => handlePick(event.target.files)}
      />
      <button
        type="button"
        className="pre-meeting-pitch-files-dropzone"
        disabled={panelDisabled || endpointUnavailable}
        onClick={() => inputRef.current?.click()}
      >
        <span className="pre-meeting-pitch-files-icon" aria-hidden="true">
          ＋
        </span>
        <span className="pre-meeting-pitch-files-copy">
          <strong>Add pitch files</strong>
          <span>PDF, DOC or other files</span>
        </span>
      </button>

      {error ? (
        <p className="pre-meeting-inline-error" role="alert">
          {error}
        </p>
      ) : null}
      {endpointUnavailable ? (
        <p className="pre-meeting-inline-hint">Client document upload requires the BT-35 backend.</p>
      ) : null}

      {hasItems ? (
        <ul className="pre-meeting-file-list" aria-label="Pitch files">
          {stagedFiles.map((file, index) => (
            <li key={`${file.name}-${file.size}-${index}`}>
              <span>{file.name}</span>
              <button type="button" disabled={panelDisabled} onClick={() => removeStaged(index)}>
                Remove
              </button>
            </li>
          ))}
          {documents.map((document) => (
            <li key={document.id}>
              <span>
                {document.file_name}{" "}
                <em className="pre-meeting-file-status">{document.processing_status}</em>
              </span>
              <button type="button" disabled={panelDisabled} onClick={() => void removeDocument(document)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {uploading ? <p className="pre-meeting-inline-hint">Uploading…</p> : null}
    </div>
  );
}

export async function uploadStagedPitchFiles(
  accessToken: string,
  opportunityId: string,
  stagedFiles: File[],
): Promise<ClientDocument[]> {
  const uploaded: ClientDocument[] = [];
  for (const file of stagedFiles) {
    const validation = validateClientDocumentFile(file);
    if (!validation.ok) {
      throw new Error(validation.reason ?? "A staged document could not be uploaded.");
    }
    const response = await uploadClientDocument(accessToken, opportunityId, file);
    uploaded.push(response.document);
  }
  return uploaded;
}
