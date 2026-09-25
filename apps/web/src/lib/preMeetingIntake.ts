import type { OpportunityCreatePayload } from "./api";
import {
  buildStage1IntakePayload,
  validateStage1IntakeForm,
  type Stage1IntakeFormValues,
} from "./stage1Intake";

export interface PreMeetingFormValues {
  client_name: string;
  client_web_page: string;
  poc_name: string;
  poc_position: string;
  about_company: string;
  sales_opportunity: string;
  notes: string;
  department: string;
  language: string;
  pii_redaction_enabled: boolean;
}

export const EMPTY_PRE_MEETING_FORM: PreMeetingFormValues = {
  client_name: "",
  client_web_page: "",
  poc_name: "",
  poc_position: "",
  about_company: "",
  sales_opportunity: "",
  notes: "",
  department: "",
  language: "en",
  pii_redaction_enabled: true,
};

export function preMeetingToStage1Values(values: PreMeetingFormValues): Stage1IntakeFormValues {
  return {
    client_web_page: values.client_web_page,
    poc_name: values.poc_name,
    poc_position: values.poc_position,
    sales_topic_description: values.notes,
    about_company: values.about_company,
  };
}

export function stage1ToPreMeetingValues(
  stage1: Stage1IntakeFormValues,
  base: PreMeetingFormValues,
): PreMeetingFormValues {
  return {
    ...base,
    client_web_page: stage1.client_web_page,
    poc_name: stage1.poc_name,
    poc_position: stage1.poc_position,
    notes: stage1.sales_topic_description,
    about_company: stage1.about_company,
  };
}

export function validatePreMeetingForm(values: PreMeetingFormValues): string | undefined {
  const clientName = values.client_name.trim();
  if (!clientName) {
    return "Enter a client name.";
  }
  const salesOpportunity = values.sales_opportunity.trim();
  if (!salesOpportunity) {
    return "Describe the sales opportunity for this first pitch.";
  }
  const department = values.department.trim();
  if (!department) {
    return "Enter a department in Additional opportunity information.";
  }
  return validateStage1IntakeForm(preMeetingToStage1Values(values));
}

export function buildPreMeetingCreatePayload(values: PreMeetingFormValues): OpportunityCreatePayload {
  const stage1Payload = buildStage1IntakePayload(preMeetingToStage1Values(values));
  return {
    client_name: values.client_name.trim(),
    opportunity_name: values.sales_opportunity.trim(),
    department: values.department.trim(),
    language: values.language || "en",
    pii_redaction_enabled: values.pii_redaction_enabled,
    stage1_intake: stage1Payload,
  };
}

export function isClientInformationReady(values: PreMeetingFormValues): boolean {
  return Boolean(values.client_name.trim());
}

export function isPitchInformationReady(values: PreMeetingFormValues): boolean {
  return Boolean(values.sales_opportunity.trim());
}

export function isGenerateReady(
  values: PreMeetingFormValues,
  processedDocumentCount: number,
): boolean {
  return (
    isClientInformationReady(values) &&
    isPitchInformationReady(values) &&
    Boolean(values.department.trim()) &&
    !validateStage1IntakeForm(preMeetingToStage1Values(values)) &&
    processedDocumentCount > 0
  );
}
