"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { WorkflowActionBar } from "@/components/WorkflowActionBar";
import { useLanguage } from "@/components/LanguageProvider";
import { usePreviewJourney } from "@/components/PreviewJourneyProvider";
import {
  ClientInformationAdapterError,
  clientInformationErrorMessage,
  createFixtureClientInformationAdapter,
  normalizeClientInformation,
  normalizeClientInformationExtras,
  validateClientInformation,
  validateClientInformationExtras,
  type ClientInformationExtraErrors,
  type ClientInformationExtras,
  type ClientInformationField,
  type ClientInformationFieldErrors,
  type ClientInformationRecord,
} from "@/lib/clientInformation";
import type { ClientInformationViewModel } from "@/lib/discoveryFirst";

interface ClientInformationEditorProps {
  initialRecord: ClientInformationRecord;
}

const FIELDS: Array<{
  key: ClientInformationField;
  type?: "url";
  multiline?: boolean;
  required?: boolean;
}> = [
  { key: "company_name", required: true },
  { key: "contact_person", required: true },
  { key: "website_url", type: "url", required: true },
  { key: "meeting_purpose", multiline: true, required: true },
  { key: "additional_information", multiline: true, required: true },
];

const CREATE_DRAFT_STORAGE_KEY = "borek-premeeting-create-draft-v1";

interface CreateDraft {
  step: 1 | 2 | 3;
  values: ClientInformationViewModel;
  extras: ClientInformationExtras;
}

const EMPTY_EXTRAS: ClientInformationExtras = {
  company_logo_name: "",
  business_industry: "",
  contact_phone: "",
  contact_position: "",
  pitch_notes: "",
  pitch_file_names: [],
  additional_opportunity_information: "",
};

const INDUSTRIES = [
  "Automotive and mobility",
  "Consumer and retail",
  "Financial services",
  "Healthcare",
  "Industrial and manufacturing",
  "Professional services",
  "Technology and software",
  "Other",
] as const;

export function ClientInformationEditor({ initialRecord }: ClientInformationEditorProps) {
  const router = useRouter();
  const { copy } = useLanguage();
  const { createOpportunity, getOpportunity, updateClient } = usePreviewJourney();
  const adapterRef = useRef(createFixtureClientInformationAdapter(initialRecord));
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const [record, setRecord] = useState(initialRecord);
  const [draft, setDraft] = useState(initialRecord.values);
  const [editing, setEditing] = useState(initialRecord.opportunity_id === "new");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ClientInformationFieldErrors>({});
  const [extras, setExtras] = useState<ClientInformationExtras>(EMPTY_EXTRAS);
  const [extraErrors, setExtraErrors] = useState<ClientInformationExtraErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createStep, setCreateStep] = useState<1 | 2 | 3>(1);
  const createMode = initialRecord.opportunity_id === "new";
  const labels: Record<ClientInformationField, string> = {
    company_name: copy.clientForm.company,
    contact_person: copy.clientForm.contact,
    website_url: copy.clientForm.website,
    meeting_purpose: copy.clientForm.purpose,
    additional_information: copy.clientForm.additional,
  };

  useEffect(() => {
    if (createMode) return;
    const preview = getOpportunity(initialRecord.opportunity_id);
    if (!preview) return;
    adapterRef.current = createFixtureClientInformationAdapter(preview.client);
    setRecord(preview.client);
    setDraft(preview.client.values);
  }, [createMode, getOpportunity, initialRecord.opportunity_id]);

  useEffect(() => {
    if (!createMode) return;
    try {
      const stored = JSON.parse(window.localStorage.getItem(CREATE_DRAFT_STORAGE_KEY) ?? "null") as Partial<CreateDraft> | null;
      if (!stored || !stored.values || (stored.step !== 2 && stored.step !== 3)) return;
      setDraft({ ...initialRecord.values, ...stored.values });
      setExtras({ ...EMPTY_EXTRAS, ...(stored.extras ?? {}) });
      setCreateStep(stored.step);
      setNotice("Your saved pre-meeting draft was restored.");
    } catch {
      window.localStorage.removeItem(CREATE_DRAFT_STORAGE_KEY);
    }
  }, [createMode, initialRecord.values]);

  function persistCreateDraft(step: 2 | 3) {
    const saved: CreateDraft = {
      step,
      values: normalizeClientInformation(draft),
      extras: normalizeClientInformationExtras(extras),
    };
    window.localStorage.setItem(CREATE_DRAFT_STORAGE_KEY, JSON.stringify(saved));
  }

  function updateExtra<Key extends keyof ClientInformationExtras>(key: Key, value: ClientInformationExtras[Key]) {
    setExtras((current) => ({ ...current, [key]: value }));
    setExtraErrors((current) => ({ ...current, [key]: undefined }));
  }

  function selectLogo(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/svg+xml"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setExtraErrors((current) => ({ ...current, company_logo_name: "Use a PNG, JPG, or SVG file up to 5 MB." }));
      event.target.value = "";
      return;
    }
    updateExtra("company_logo_name", file.name);
  }

  function selectPitchFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const allowed = new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);
    if (files.some((file) => !allowed.has(file.type) || file.size > 10 * 1024 * 1024)) {
      setExtraErrors((current) => ({ ...current, pitch_file_names: "Use PDF, DOC, or DOCX files up to 10 MB each." }));
      event.target.value = "";
      return;
    }
    updateExtra("pitch_file_names", files.map((file) => file.name));
  }

  function updateField(key: ClientInformationField, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function reload() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const loaded = await adapterRef.current.load(record.opportunity_id);
      setRecord(loaded);
      setDraft(loaded.values);
      setFieldErrors({});
      setEditing(false);
      setNotice("Client information reloaded from the adapter.");
    } catch (loadError) {
      setError(clientInformationErrorMessage(loadError));
    } finally {
      setBusy(false);
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createMode && createStep === 1) {
      const stepErrors = validateClientInformation({ ...draft, meeting_purpose: "Pending pitch information" });
      delete stepErrors.meeting_purpose;
      const stepExtraErrors = validateClientInformationExtras(extras);
      if (Object.keys(stepErrors).length > 0 || Object.keys(stepExtraErrors).length > 0) {
        setFieldErrors(stepErrors);
        setExtraErrors(stepExtraErrors);
        setError("Check the highlighted fields and try again.");
        requestAnimationFrame(() => errorSummaryRef.current?.focus());
        return;
      }
      setFieldErrors({});
      setExtraErrors({});
      setError(null);
      persistCreateDraft(2);
      setCreateStep(2);
      setNotice("Client Information saved in this local preview.");
      return;
    }
    const localErrors = validateClientInformation(draft);
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      setError("Check the highlighted fields and try again.");
      requestAnimationFrame(() => errorSummaryRef.current?.focus());
      return;
    }
    if (createMode && createStep === 2) {
      setFieldErrors({});
      setError(null);
      persistCreateDraft(3);
      setCreateStep(3);
      setNotice("Pitch Information saved in this local preview.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (createMode) {
        const created = createOpportunity(
          normalizeClientInformation(draft),
          normalizeClientInformationExtras(extras),
        );
        window.localStorage.removeItem(CREATE_DRAFT_STORAGE_KEY);
        router.push(`/opportunities/${encodeURIComponent(created.opportunity_id)}/discovery`);
        return;
      }
      const saved = await adapterRef.current.save({
        opportunity_id: record.opportunity_id,
        expected_revision: record.revision,
        values: normalizeClientInformation(draft),
      });
      setRecord(saved);
      setDraft(saved.values);
      updateClient(saved);
      setFieldErrors({});
      setEditing(false);
      setNotice("Client information saved to the validated fixture adapter.");
    } catch (saveError) {
      if (saveError instanceof ClientInformationAdapterError) {
        setFieldErrors(saveError.fieldErrors);
      }
      setError(clientInformationErrorMessage(saveError));
      requestAnimationFrame(() => errorSummaryRef.current?.focus());
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    if (record.opportunity_id === "new") {
      window.localStorage.removeItem(CREATE_DRAFT_STORAGE_KEY);
      router.push("/clients");
      return;
    }
    setDraft(record.values);
    setFieldErrors({});
    setError(null);
    setNotice(null);
    setEditing(false);
  }

  function renderField(key: ClientInformationField, locked = false, labelOverride?: string) {
    const field = FIELDS.find((candidate) => candidate.key === key)!;
    const label = labelOverride ?? labels[key];
    const errorId = `${key}-error`;
    const controlProps = {
      id: key,
      name: key,
      value: draft[key],
      disabled: busy || locked,
      required: field.required,
      "aria-invalid": Boolean(fieldErrors[key]),
      "aria-describedby": fieldErrors[key] ? errorId : undefined,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        updateField(key, event.target.value),
    };
    return (
      <div key={key} className={field.multiline ? "is-wide" : undefined}>
        <label htmlFor={key}>{label}{field.required ? <span aria-hidden="true"> *</span> : null}</label>
        {field.multiline ? (
          <textarea {...controlProps} rows={key === "additional_information" ? 5 : 3} />
        ) : (
          <input {...controlProps} type={field.type ?? "text"} />
        )}
        {fieldErrors[key] ? <span id={errorId} className="client-field-error">{fieldErrors[key]}</span> : null}
      </div>
    );
  }

  if (createMode) {
    const stepClass = (step: 1 | 2 | 3) =>
      createStep === step ? "is-current" : createStep > step ? "is-complete" : undefined;
    return (
      <section className="premeeting-create-flow" aria-labelledby="premeeting-create-title">
        <header className="premeeting-intro">
          <p className="premeeting-breadcrumb">{copy.clientForm.breadcrumb}</p>
          <h1 id="premeeting-create-title">{copy.clientForm.createTitle}</h1>
          <p>{copy.clientForm.createLead}</p>
        </header>
        <ol className="premeeting-create-steps" aria-label={copy.clientForm.preMeetingTitle}>
          <li className={stepClass(1)}><span>1</span><strong>{copy.clientForm.stepClient}</strong></li>
          <li className={stepClass(2)}><span>2</span><strong>{copy.clientForm.stepPitch}</strong></li>
          <li className={stepClass(3)}><span>3</span><strong>{copy.clientForm.stepGenerate}</strong></li>
        </ol>
        {error ? (
          <div className="client-information-error" role="alert" tabIndex={-1} ref={errorSummaryRef}>
            <strong>Client information was not saved.</strong><span>{error}</span>
          </div>
        ) : null}
        {notice ? <p className="client-information-notice" role="status" aria-live="polite">{notice}</p> : null}
        <div className="premeeting-create-grid">
          <form id="client-information-form" className="discovery-client-information is-create client-information-form" onSubmit={(event) => void save(event)} noValidate>
            <header>
              <p>{String(createStep).padStart(2, "0")}</p>
              <h2>{createStep === 1 ? copy.clientForm.informationSection : createStep === 2 ? copy.clientForm.stepPitch : copy.clientForm.reviewTitle}</h2>
            </header>
            {createStep === 1 ? <>
              <fieldset className="client-form-section">
              <legend>{copy.clientForm.companySection}</legend>
              <div className="client-form-section-grid">
                {renderField("company_name", createStep > 1)}
                {renderField("website_url", createStep > 1)}
                <div>
                  <label htmlFor="company_logo">{copy.clientForm.logo} <small>{copy.clientForm.optional}</small></label>
                  <label className={`client-logo-upload${createStep > 1 ? " is-disabled" : ""}`} htmlFor="company_logo">
                    <span aria-hidden="true">+</span>
                    <strong>{extras.company_logo_name || copy.clientForm.uploadLogo}</strong>
                    <small>PNG, JPG or SVG · max 5 MB</small>
                  </label>
                  <input id="company_logo" className="sr-only" type="file" accept=".png,.jpg,.jpeg,.svg" disabled={busy || createStep > 1} onChange={selectLogo} />
                  {extraErrors.company_logo_name ? <span className="client-field-error">{extraErrors.company_logo_name}</span> : null}
                </div>
                <div>
                  <label htmlFor="business_industry">{copy.clientForm.industry}<span aria-hidden="true"> *</span></label>
                  <select id="business_industry" value={extras.business_industry} disabled={busy || createStep > 1} required aria-invalid={Boolean(extraErrors.business_industry)} onChange={(event) => updateExtra("business_industry", event.target.value)}>
                    <option value="">{copy.clientForm.selectIndustry}</option>
                    {INDUSTRIES.map((industry) => <option key={industry}>{industry}</option>)}
                  </select>
                  {extraErrors.business_industry ? <span className="client-field-error">{extraErrors.business_industry}</span> : null}
                </div>
              </div>
              </fieldset>
              <fieldset className="client-form-section is-muted">
              <legend>{copy.clientForm.contactSection}</legend>
              <p className="client-section-help">{copy.clientForm.contactHelp}</p>
              <div className="client-form-section-grid">
                {renderField("contact_person", createStep > 1)}
                <div>
                  <label htmlFor="contact_position">{copy.clientForm.position}<span aria-hidden="true"> *</span></label>
                  <input id="contact_position" value={extras.contact_position} placeholder={copy.clientForm.positionPlaceholder} disabled={busy || createStep > 1} required aria-invalid={Boolean(extraErrors.contact_position)} onChange={(event) => updateExtra("contact_position", event.target.value)} />
                  {extraErrors.contact_position ? <span className="client-field-error">{extraErrors.contact_position}</span> : null}
                </div>
                <div>
                  <label htmlFor="contact_phone">{copy.clientForm.phone}<span aria-hidden="true"> *</span></label>
                  <input id="contact_phone" type="tel" value={extras.contact_phone} placeholder="+49 30 1234 5678" disabled={busy || createStep > 1} required aria-invalid={Boolean(extraErrors.contact_phone)} onChange={(event) => updateExtra("contact_phone", event.target.value)} />
                  <small className="client-input-help">{copy.clientForm.countryCode}</small>
                  {extraErrors.contact_phone ? <span className="client-field-error">{extraErrors.contact_phone}</span> : null}
                </div>
                {renderField("additional_information", createStep > 1, copy.clientForm.relevantInformation)}
              </div>
              </fieldset>
            </> : null}
            {createStep === 2 ? (
              <fieldset className="client-form-section premeeting-pitch-section">
                <legend>{copy.clientForm.stepPitch}</legend>
                <div className="client-form-section-grid premeeting-pitch-fields">
                  {renderField("meeting_purpose", createStep > 2, copy.clientForm.salesOpportunity)}
                  <div>
                    <label htmlFor="pitch_notes">{copy.clientForm.notes} <small>{copy.clientForm.optional}</small></label>
                    <textarea id="pitch_notes" rows={4} value={extras.pitch_notes} placeholder={copy.clientForm.notesPlaceholder} disabled={busy || createStep > 2} onChange={(event) => updateExtra("pitch_notes", event.target.value)} />
                  </div>
                  <div>
                    <label htmlFor="pitch_files">{copy.clientForm.pitchFiles} <small>{copy.clientForm.optional}</small></label>
                    <label className={`client-pitch-upload${createStep > 2 ? " is-disabled" : ""}`} htmlFor="pitch_files">
                      <span aria-hidden="true">+</span>
                      <strong>{copy.clientForm.addPitchFiles}</strong>
                      <small>{extras.pitch_file_names.length > 0 ? extras.pitch_file_names.join(", ") : "PDF, DOC or DOCX files"}</small>
                    </label>
                    <input id="pitch_files" className="sr-only" type="file" accept=".pdf,.doc,.docx" multiple disabled={busy || createStep > 2} onChange={selectPitchFiles} />
                    {extraErrors.pitch_file_names ? <span className="client-field-error">{extraErrors.pitch_file_names}</span> : null}
                  </div>
                  <div className="is-wide">
                    <label htmlFor="additional_opportunity_information">{copy.clientForm.additionalOpportunity} <small>{copy.clientForm.optional}</small></label>
                    <textarea id="additional_opportunity_information" rows={4} value={extras.additional_opportunity_information} disabled={busy || createStep > 2} onChange={(event) => updateExtra("additional_opportunity_information", event.target.value)} />
                  </div>
                </div>
              </fieldset>
            ) : null}
            {createStep === 3 ? (
              <section className="premeeting-generate-review">
                <h3>{copy.clientForm.reviewTitle}</h3><p>{copy.clientForm.reviewLead}</p>
              </section>
            ) : null}
            <div className="client-information-form-actions">
              <span className="client-required-note">* {copy.clientForm.required}</span>
              <button className="btn btn-secondary" type="button" onClick={() => createStep === 1 ? cancel() : setCreateStep((createStep - 1) as 1 | 2)}>
                {createStep === 1 ? copy.clientForm.cancel : copy.clientForm.backStep}
              </button>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? copy.clientForm.saving : createStep === 1 ? copy.clientForm.save : createStep === 2 ? copy.clientForm.savePitch : copy.clientForm.generatePitch}
              </button>
            </div>
          </form>
          <aside className="premeeting-create-summary">
            <p>{copy.clientForm.oneFlow}</p><h2>{copy.clientForm.createSummary}</h2>
            <ol>
              <li><span>1</span><div><strong>{copy.clientForm.clientProfile}</strong><small>{createStep > 1 ? copy.clientForm.created : copy.workflow.current}</small></div></li>
              <li><span>2</span><div><strong>{copy.clientForm.firstPitch}</strong><small>{createStep > 2 ? copy.clientForm.created : createStep === 2 ? copy.workflow.current : copy.workflow.unavailable}</small></div></li>
              <li><span>3</span><div><strong>{copy.clientForm.pitchGeneration}</strong><small>{createStep === 3 ? copy.clientForm.startsAutomatically : copy.workflow.unavailable}</small></div></li>
            </ol>
            <button className="btn btn-primary" type="submit" form="client-information-form" disabled={createStep !== 3 || busy}>{copy.clientForm.generatePitch}</button>
            <small>{copy.clientForm.generationTime}</small>
          </aside>
        </div>
      </section>
    );
  }

  return (
    <section className={`discovery-client-information${createMode ? " is-create" : ""}`} aria-labelledby="client-information-title">
      <header>
        <p>{createMode ? "01" : copy.clientForm.editKicker}</p>
        <h1 id="client-information-title">{createMode ? copy.clientForm.informationSection : copy.clientForm.editTitle}</h1>
        {!createMode ? <span>{copy.clientForm.editLead}</span> : null}
      </header>

      {error ? (
        <div className="client-information-error" role="alert" tabIndex={-1} ref={errorSummaryRef}>
          <strong>Client information was not saved.</strong>
          <span>{error}</span>
        </div>
      ) : null}
      {notice ? <p className="client-information-notice" role="status">{notice}</p> : null}

      {editing ? (
        <form id="client-information-form" className="client-information-form" onSubmit={(event) => void save(event)} noValidate>
          <fieldset className="client-form-section">
            <legend>{copy.clientForm.companySection}</legend>
            <div className="client-form-section-grid">{renderField("company_name")}{renderField("website_url")}</div>
          </fieldset>
          <fieldset className="client-form-section is-muted">
            <legend>{copy.clientForm.contactSection}</legend>
            <div className="client-form-section-grid">{renderField("contact_person")}</div>
          </fieldset>
          <fieldset className="client-form-section">
            <legend>{copy.clientForm.meetingSection}</legend>
            <div className="client-form-section-grid">{renderField("meeting_purpose")}{renderField("additional_information")}</div>
          </fieldset>
          <div className="client-information-form-actions">
            {createMode ? <span className="client-required-note">* {copy.clientForm.required}</span> : null}
            <button className="btn btn-secondary" type="button" disabled={busy} onClick={cancel}>{copy.clientForm.cancel}</button>
            {!createMode ? <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? copy.clientForm.saving : copy.clientForm.save}</button> : null}
          </div>
        </form>
      ) : (
        <dl>
          {FIELDS.map(({ key }) => (
            <div key={key}>
              <dt>{labels[key]}</dt>
              <dd>{record.values[key] || "Not provided"}</dd>
            </div>
          ))}
        </dl>
      )}

      {!editing ? (
        <WorkflowActionBar
          backHref="/clients"
          backLabel={copy.clientForm.back}
          contextLabel={copy.clientForm.revision}
          context={`Revision ${record.revision}`}
        >
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void reload()}>{copy.clientForm.reload}</button>
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => setEditing(true)}>{copy.clientForm.edit}</button>
          <button className="btn btn-primary" type="button" onClick={() => router.push(`/opportunities/${encodeURIComponent(record.opportunity_id)}/discovery`)}>{copy.clientForm.continue}</button>
        </WorkflowActionBar>
      ) : null}
    </section>
  );
}
