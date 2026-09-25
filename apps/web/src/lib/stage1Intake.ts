import type { Stage1Intake } from "./api";

export const STAGE1_CLIENT_WEB_PAGE_MAX = 2_048;
export const STAGE1_POC_MAX = 200;
export const STAGE1_TEXT_MAX = 20_000;
export const STAGE1_ABOUT_COMPANY_UI_GUIDANCE = 4_000;

export const STAGE1_VOICE_ACCEPT = ".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/wave";

export interface Stage1IntakeFormValues {
  client_web_page: string;
  poc_name: string;
  poc_position: string;
  sales_topic_description: string;
  about_company: string;
}

export const EMPTY_STAGE1_FORM: Stage1IntakeFormValues = {
  client_web_page: "",
  poc_name: "",
  poc_position: "",
  sales_topic_description: "",
  about_company: "",
};

export function stage1IntakeToFormValues(intake: Stage1Intake | null | undefined): Stage1IntakeFormValues {
  return {
    client_web_page: intake?.client_web_page ?? "",
    poc_name: intake?.poc_name ?? "",
    poc_position: intake?.poc_position ?? "",
    sales_topic_description: intake?.sales_topic_description ?? "",
    about_company: intake?.about_company ?? "",
  };
}

export function normalizeStage1Field(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  if (value.includes("\u0000")) {
    return value;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

/** Always returns all five nested fields for BT-34 PATCH replace semantics. */
export function buildStage1IntakePayload(values: Stage1IntakeFormValues): Stage1Intake {
  return {
    client_web_page: normalizeStage1Field(values.client_web_page),
    poc_name: normalizeStage1Field(values.poc_name),
    poc_position: normalizeStage1Field(values.poc_position),
    sales_topic_description: normalizeStage1Field(values.sales_topic_description),
    about_company: normalizeStage1Field(values.about_company),
  };
}

export function hasStage1IntakeContent(intake: Stage1Intake | null | undefined): boolean {
  if (!intake) {
    return false;
  }
  return Boolean(
    intake.client_web_page ||
      intake.poc_name ||
      intake.poc_position ||
      intake.sales_topic_description ||
      intake.about_company,
  );
}

export function validateClientWebPage(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length > STAGE1_CLIENT_WEB_PAGE_MAX) {
    return `The client website must be ${STAGE1_CLIENT_WEB_PAGE_MAX.toLocaleString()} characters or fewer.`;
  }
  if (trimmed.includes("\u0000") || /[\s\r\n\t]/.test(trimmed)) {
    return "Enter an absolute HTTP(S) URL without spaces.";
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return "Enter an absolute HTTP(S) URL, for example https://example.com.";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "Enter an absolute HTTP(S) URL, for example https://example.com.";
  }
  if (!url.hostname || url.username || url.password) {
    return "Enter an absolute HTTP(S) URL without credentials.";
  }
  return undefined;
}

function validateTextField(
  value: string,
  label: string,
  maxLength: number,
): string | undefined {
  if (value.includes("\u0000")) {
    return `${label} must not contain invalid characters.`;
  }
  if (value.length > maxLength) {
    return `${label} must be ${maxLength.toLocaleString()} characters or fewer.`;
  }
  return undefined;
}

export function validateStage1IntakeForm(values: Stage1IntakeFormValues): string | undefined {
  const webPageError = validateClientWebPage(values.client_web_page);
  if (webPageError) {
    return webPageError;
  }
  return (
    validateTextField(values.poc_name, "POC name", STAGE1_POC_MAX) ??
    validateTextField(values.poc_position, "POC position", STAGE1_POC_MAX) ??
    validateTextField(values.sales_topic_description, "Sales topic", STAGE1_TEXT_MAX) ??
    validateTextField(values.about_company, "About company", STAGE1_TEXT_MAX)
  );
}

export function validateStage1VoiceFile(file: Pick<File, "name" | "size" | "type">): {
  ok: boolean;
  reason?: string;
} {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  const allowedExtensions = [".mp3", ".m4a", ".wav"];
  if (!allowedExtensions.includes(extension)) {
    return { ok: false, reason: "Use an MP3, M4A, or WAV recording." };
  }
  if (file.size === 0) {
    return { ok: false, reason: "This recording is empty. Choose another file." };
  }
  return { ok: true };
}
