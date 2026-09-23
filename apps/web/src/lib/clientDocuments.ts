export const CLIENT_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const CLIENT_DOCUMENT_ACCEPT =
  ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt"] as const;

const EXTENSION_MIME: Record<string, readonly string[]> = {
  ".txt": ["text/plain"],
  ".pdf": ["application/pdf", "application/octet-stream"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
};

export interface ClientDocumentValidation {
  ok: boolean;
  reason?: string;
}

export function validateClientDocumentFile(
  file: Pick<File, "name" | "size" | "type">,
): ClientDocumentValidation {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(extension)) {
    return { ok: false, reason: "Use a PDF, DOCX, or TXT client document." };
  }
  const mime = file.type.toLowerCase();
  if (mime && EXTENSION_MIME[extension] && !EXTENSION_MIME[extension].includes(mime)) {
    return { ok: false, reason: "The file extension does not match its format." };
  }
  if (file.size === 0) {
    return { ok: false, reason: "This file is empty. Choose another document." };
  }
  if (file.size > CLIENT_DOCUMENT_MAX_BYTES) {
    return { ok: false, reason: "Each client document must be 10 MB or smaller." };
  }
  return { ok: true };
}

export function clientDocumentStatusLabel(status: string): string {
  switch (status) {
    case "processed":
      return "Processed";
    case "failed":
      return "Failed";
    default:
      return status.replace(/_/g, " ");
  }
}

export function formatDocumentFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
