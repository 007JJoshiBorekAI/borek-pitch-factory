export const CLIENT_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const CLIENT_DOCUMENT_ACCEPT = ".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const CLIENT_DOCUMENT_EXTENSIONS = [".pdf", ".docx", ".txt"] as const;

export interface ClientDocumentValidation {
  ok: boolean;
  reason?: string;
}

export function validateClientDocumentFile(
  file: Pick<File, "name" | "size">,
): ClientDocumentValidation {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!(CLIENT_DOCUMENT_EXTENSIONS as readonly string[]).includes(extension)) {
    return { ok: false, reason: "Use a PDF, DOCX, or TXT client document." };
  }
  if (file.size === 0) {
    return { ok: false, reason: "This file is empty. Choose another document." };
  }
  if (file.size > CLIENT_DOCUMENT_MAX_BYTES) {
    return { ok: false, reason: "Each client document must be 10 MiB or smaller." };
  }
  return { ok: true };
}
