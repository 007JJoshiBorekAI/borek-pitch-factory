import type { ClientInformationViewModel } from "./discoveryFirst";

export type ClientInformationField = keyof ClientInformationViewModel;
export type ClientInformationFieldErrors = Partial<Record<ClientInformationField, string>>;

export interface ClientInformationExtras {
  company_logo_name: string;
  business_industry: string;
  contact_phone: string;
  contact_position: string;
  pitch_notes: string;
  pitch_file_names: string[];
  additional_opportunity_information: string;
}

export type ClientInformationExtraErrors = Partial<Record<keyof ClientInformationExtras, string>>;

export const EMPTY_CLIENT_INFORMATION_EXTRAS: ClientInformationExtras = {
  company_logo_name: "",
  business_industry: "",
  contact_phone: "",
  contact_position: "",
  pitch_notes: "",
  pitch_file_names: [],
  additional_opportunity_information: "",
};

export function restoreClientInformationDraft(record: ClientInformationRecord, extras = EMPTY_CLIENT_INFORMATION_EXTRAS) {
  return { values: { ...record.values }, extras: normalizeClientInformationExtras(extras) };
}

export interface ClientInformationRecord {
  opportunity_id: string;
  revision: number;
  values: ClientInformationViewModel;
  source: "fixture" | "live";
}

export interface SaveClientInformationInput {
  opportunity_id: string;
  expected_revision: number;
  values: ClientInformationViewModel;
}

export interface ClientInformationAdapter {
  load(opportunityId: string): Promise<ClientInformationRecord>;
  save(input: SaveClientInformationInput): Promise<ClientInformationRecord>;
}

export type ClientInformationFailureKind =
  | "validation"
  | "conflict"
  | "authorization"
  | "retryable"
  | "unknown";

export class ClientInformationAdapterError extends Error {
  constructor(
    public readonly kind: ClientInformationFailureKind,
    message: string,
    public readonly fieldErrors: ClientInformationFieldErrors = {},
  ) {
    super(message);
    this.name = "ClientInformationAdapterError";
  }
}

export function normalizeWebsiteUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Every user-entered field is optional: an empty value is valid and stays empty.
 * A value that is provided is still checked.
 */
export function validateClientInformation(
  values: ClientInformationViewModel,
): ClientInformationFieldErrors {
  const errors: ClientInformationFieldErrors = {};
  const website = normalizeWebsiteUrl(values.website_url);
  if (website) {
    try {
      const parsed = new URL(website);
      if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname.includes(".")) {
        errors.website_url = "Enter a valid HTTP or HTTPS website URL.";
      }
    } catch {
      errors.website_url = "Enter a valid HTTP or HTTPS website URL.";
    }
  }
  return errors;
}

export function normalizeClientInformation(
  values: ClientInformationViewModel,
): ClientInformationViewModel {
  return {
    company_name: values.company_name.trim(),
    contact_person: values.contact_person.trim(),
    website_url: normalizeWebsiteUrl(values.website_url),
    meeting_purpose: values.meeting_purpose.trim(),
    additional_information: values.additional_information.trim(),
  };
}

export function validateClientInformationExtras(values: ClientInformationExtras): ClientInformationExtraErrors {
  const errors: ClientInformationExtraErrors = {};
  const phone = values.contact_phone.trim();
  if (phone && !/^[+\d][\d\s()./-]{6,}$/.test(phone)) {
    errors.contact_phone = "Enter a valid phone number including the country code.";
  }
  return errors;
}

/** Shown in place of a missing company name. Display only: it is never saved or sent to the API. */
export function displayClientName(name: string | null | undefined, placeholder: string): string {
  return name?.trim() || placeholder;
}

export function normalizeClientInformationExtras(values: ClientInformationExtras): ClientInformationExtras {
  return {
    company_logo_name: values.company_logo_name.trim(),
    business_industry: values.business_industry.trim(),
    contact_phone: values.contact_phone.trim(),
    contact_position: values.contact_position.trim(),
    pitch_notes: values.pitch_notes.trim(),
    pitch_file_names: values.pitch_file_names.map((name) => name.trim()).filter(Boolean),
    additional_opportunity_information: values.additional_opportunity_information.trim(),
  };
}

export function clientInformationErrorMessage(error: unknown): string {
  if (!(error instanceof ClientInformationAdapterError)) {
    return "Client information could not be saved. Try again.";
  }
  if (error.kind === "conflict") {
    return "This client information changed in another session. Reload it before editing again.";
  }
  if (error.kind === "authorization") {
    return "You do not have permission to update this client information.";
  }
  if (error.kind === "retryable") {
    return "The connection was interrupted. Your edits are still here; try saving again.";
  }
  return error.message;
}

interface FixtureAdapterOptions {
  nextFailure?: ClientInformationAdapterError;
}

export function createFixtureClientInformationAdapter(
  initial: ClientInformationRecord,
  options: FixtureAdapterOptions = {},
): ClientInformationAdapter {
  let record = structuredClone(initial);
  let nextFailure = options.nextFailure;
  return {
    async load(opportunityId) {
      if (opportunityId !== record.opportunity_id) {
        throw new ClientInformationAdapterError(
          "authorization",
          "Fixture data belongs to a different opportunity.",
        );
      }
      return structuredClone(record);
    },
    async save(input) {
      if (record.source !== "fixture") {
        throw new ClientInformationAdapterError("authorization", "Live client information cannot be saved through the fixture adapter.");
      }
      if (nextFailure) {
        const failure = nextFailure;
        nextFailure = undefined;
        throw failure;
      }
      if (input.opportunity_id !== record.opportunity_id) {
        throw new ClientInformationAdapterError(
          "authorization",
          "Fixture data belongs to a different opportunity.",
        );
      }
      if (input.expected_revision !== record.revision) {
        throw new ClientInformationAdapterError("conflict", "The expected revision is stale.");
      }
      const fieldErrors = validateClientInformation(input.values);
      if (Object.keys(fieldErrors).length > 0) {
        throw new ClientInformationAdapterError(
          "validation",
          "Check the highlighted fields and try again.",
          fieldErrors,
        );
      }
      record = {
        ...record,
        revision: record.revision + 1,
        values: normalizeClientInformation(input.values),
      };
      return structuredClone(record);
    },
  };
}
