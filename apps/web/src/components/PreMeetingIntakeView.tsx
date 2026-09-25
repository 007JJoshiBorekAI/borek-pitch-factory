"use client";

import Image from "next/image";
import React, { useEffect, useId, useRef, useState } from "react";

import { PreMeetingPitchFiles, uploadStagedPitchFiles } from "@/components/PreMeetingPitchFiles";
import { WorkflowStateCard } from "@/components/WorkflowStateCard";
import { countProcessedClientDocuments } from "@/components/ClientDocumentUploadPanel";
import type { ClientDocument, OpportunityCreatePayload, OpportunityResponse, Stage1Intake } from "@/lib/api";
import { uploadStage1Voice } from "@/lib/api";
import {
  opportunityErrorMessage,
  stage1IntakeErrorMessage,
  stage1VoiceErrorMessage,
} from "@/lib/apiErrors";
import { generateAndFetchAdaptedStage1Outputs } from "@/lib/stage1OutputsLive";
import {
  EMPTY_PRE_MEETING_FORM,
  buildPreMeetingCreatePayload,
  isClientInformationReady,
  isGenerateReady,
  isPitchInformationReady,
  preMeetingToStage1Values,
  stage1ToPreMeetingValues,
  validatePreMeetingForm,
  type PreMeetingFormValues,
} from "@/lib/preMeetingIntake";
import { clearOpportunityDraft, loadOpportunityDraft, saveOpportunityDraft } from "@/lib/pipelineContext";
import { preMeetingMissingInformationState } from "@/lib/workflowState";
import { STAGE1_VOICE_ACCEPT, buildStage1IntakePayload, validateStage1VoiceFile } from "@/lib/stage1Intake";

interface PreMeetingIntakeViewProps {
  disabled?: boolean;
  accessToken: string | null;
  opportunity: OpportunityResponse | null;
  opportunityId: string | null;
  onCreateOpportunity: (payload: OpportunityCreatePayload) => Promise<string>;
  onSaveStage1Intake: (payload: Stage1Intake) => Promise<void>;
  onNavigateToReview: (opportunityId: string) => void;
}

export function PreMeetingIntakeView({
  disabled = false,
  accessToken,
  opportunity,
  opportunityId,
  onCreateOpportunity,
  onSaveStage1Intake,
  onNavigateToReview,
}: PreMeetingIntakeViewProps) {
  const additionalId = useId();
  const voiceInputRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<PreMeetingFormValues>(EMPTY_PRE_MEETING_FORM);
  const [additionalOpen, setAdditionalOpen] = useState(false);
  const [clientDocuments, setClientDocuments] = useState<ClientDocument[]>([]);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const identityLocked = Boolean(opportunityId);
  const processedDocumentCount = countProcessedClientDocuments(clientDocuments);
  const panelDisabled = disabled || busy || voiceBusy;
  const generateReady = isGenerateReady(values, processedDocumentCount);
  const missingInformationState = submitAttempted
    ? preMeetingMissingInformationState({
        validationMessage: validatePreMeetingForm(values),
        processedDocumentCount,
      })
    : null;

  useEffect(() => {
    if (opportunity) {
      setValues(
        stage1ToPreMeetingValues(
          {
            client_web_page: opportunity.stage1_intake?.client_web_page ?? "",
            poc_name: opportunity.stage1_intake?.poc_name ?? "",
            poc_position: opportunity.stage1_intake?.poc_position ?? "",
            sales_topic_description: opportunity.stage1_intake?.sales_topic_description ?? "",
            about_company: opportunity.stage1_intake?.about_company ?? "",
          },
          {
            ...EMPTY_PRE_MEETING_FORM,
            client_name: opportunity.client_name,
            sales_opportunity: opportunity.opportunity_name,
            department: opportunity.department,
            language: opportunity.language,
            pii_redaction_enabled: opportunity.pii_redaction_enabled !== false,
          },
        ),
      );
      return;
    }
    const draft = loadOpportunityDraft();
    if (draft) {
      setValues((current) => ({
        ...current,
        client_name: draft.client_name ?? "",
        sales_opportunity: draft.opportunity_name ?? "",
        department: draft.department ?? "",
        language: draft.language ?? "en",
        pii_redaction_enabled: draft.pii_redaction_enabled !== false,
      }));
    }
  }, [opportunity]);

  function updateField<K extends keyof PreMeetingFormValues>(key: K, value: PreMeetingFormValues[K]) {
    setValues((current) => {
      const next = { ...current, [key]: value };
      if (!identityLocked) {
        saveOpportunityDraft({
          client_name: next.client_name,
          opportunity_name: next.sales_opportunity,
          department: next.department,
          language: next.language,
          pii_redaction_enabled: next.pii_redaction_enabled,
          additional_client_information: null,
        });
      }
      return next;
    });
    setError(null);
    setNotice(null);
  }

  async function handleVoiceFile(file: File) {
    if (!accessToken || !opportunityId) {
      setNotice("Create the client first to use voice notes.");
      return;
    }
    const validation = validateStage1VoiceFile(file);
    if (!validation.ok) {
      setError(validation.reason ?? "This recording could not be used.");
      return;
    }
    setVoiceBusy(true);
    setError(null);
    try {
      const response = await uploadStage1Voice(accessToken, opportunityId, file);
      if (response.transcript) {
        updateField(
          "notes",
          values.notes.trim() ? `${values.notes.trim()}\n\n${response.transcript}` : response.transcript,
        );
        setNotice("Voice note added to Notes.");
      }
    } catch (voiceError) {
      setError(stage1VoiceErrorMessage(voiceError));
    } finally {
      setVoiceBusy(false);
      if (voiceInputRef.current) {
        voiceInputRef.current.value = "";
      }
    }
  }

  async function handleCreateClientAndPitch() {
    if (busy) {
      return;
    }
    setSubmitAttempted(true);
    setError(null);
    setNotice(null);

    const validationError = validatePreMeetingForm(values);
    if (validationError) {
      setError(validationError);
      if (!values.department.trim()) {
        setAdditionalOpen(true);
      }
      return;
    }

    if (!accessToken) {
      setError("Sign in is required before creating a client and pitch.");
      return;
    }

    setBusy(true);
    try {
      let activeOpportunityId = opportunityId;

      if (!activeOpportunityId) {
        activeOpportunityId = await onCreateOpportunity(buildPreMeetingCreatePayload(values));
        clearOpportunityDraft();
      }

      const stage1Payload = buildStage1IntakePayload(preMeetingToStage1Values(values));
      await onSaveStage1Intake(stage1Payload);

      let docs = clientDocuments;
      if (stagedFiles.length > 0) {
        const uploaded = await uploadStagedPitchFiles(accessToken, activeOpportunityId, stagedFiles);
        docs = [...docs, ...uploaded];
        setStagedFiles([]);
        setClientDocuments(docs);
      }

      const processedCount = countProcessedClientDocuments(docs);
      if (processedCount === 0) {
        setError("Upload at least one pitch file before generating.");
        setBusy(false);
        return;
      }

      await generateAndFetchAdaptedStage1Outputs(accessToken, activeOpportunityId);
      onNavigateToReview(activeOpportunityId);
    } catch (submitError) {
      setError(opportunityErrorMessage(submitError) || stage1IntakeErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  const clientStepComplete = identityLocked || isClientInformationReady(values);
  const pitchStepComplete = identityLocked || isPitchInformationReady(values);

  return (
    <div className="pre-meeting-page">
      <header className="pre-meeting-header">
        <h1 className="pre-meeting-title">PRE-MEETING</h1>
        <p className="pre-meeting-context">One submission creates both.</p>
      </header>

      <div className="pre-meeting-flow" aria-label="Pre-meeting workflow">
        <div className={`pre-meeting-flow-step${clientStepComplete ? " pre-meeting-flow-step-active" : ""}`}>
          <span className="pre-meeting-flow-marker">1</span>
          <span>Client information</span>
        </div>
        <span className="pre-meeting-flow-connector" aria-hidden="true" />
        <div className={`pre-meeting-flow-step${pitchStepComplete ? " pre-meeting-flow-step-active" : ""}`}>
          <span className="pre-meeting-flow-marker">2</span>
          <span>Pitch information</span>
        </div>
        <span className="pre-meeting-flow-connector" aria-hidden="true" />
        <div className={`pre-meeting-flow-step pre-meeting-flow-step-future${generateReady ? " pre-meeting-flow-step-ready" : ""}`}>
          <span className="pre-meeting-flow-marker">3</span>
          <span>Generate</span>
        </div>
      </div>

      <div className="pre-meeting-columns">
        <form
          className="pre-meeting-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreateClientAndPitch();
          }}
        >
          <section className="pre-meeting-section" aria-labelledby="pre-meeting-client-title">
            <div className="pre-meeting-section-heading">
              <span className="pre-meeting-section-number">01</span>
              <h2 id="pre-meeting-client-title">Client information</h2>
            </div>
            <div className="pre-meeting-field-grid">
              <div className="pre-meeting-field">
                <label htmlFor="pre_meeting_client_name">Client name</label>
                <input
                  id="pre_meeting_client_name"
                  value={values.client_name}
                  placeholder="Enter client name"
                  disabled={panelDisabled || identityLocked}
                  required
                  onChange={(event) => updateField("client_name", event.target.value)}
                />
              </div>
              <div className="pre-meeting-field">
                <label htmlFor="pre_meeting_website">Website</label>
                <input
                  id="pre_meeting_website"
                  type="url"
                  inputMode="url"
                  value={values.client_web_page}
                  placeholder="https://"
                  disabled={panelDisabled}
                  onChange={(event) => updateField("client_web_page", event.target.value)}
                />
              </div>
              <div className="pre-meeting-field">
                <label htmlFor="pre_meeting_poc">Point of contact</label>
                <input
                  id="pre_meeting_poc"
                  value={values.poc_name}
                  placeholder="Full name"
                  disabled={panelDisabled}
                  onChange={(event) => updateField("poc_name", event.target.value)}
                />
              </div>
              <div className="pre-meeting-field">
                <label htmlFor="pre_meeting_position">POC position</label>
                <input
                  id="pre_meeting_position"
                  value={values.poc_position}
                  placeholder="Role / position"
                  disabled={panelDisabled}
                  onChange={(event) => updateField("poc_position", event.target.value)}
                />
              </div>
              <div className="pre-meeting-field pre-meeting-field-span">
                <label htmlFor="pre_meeting_about">Relevant client information</label>
                <textarea
                  id="pre_meeting_about"
                  rows={3}
                  value={values.about_company}
                  placeholder="Industry, location or useful background…"
                  disabled={panelDisabled}
                  onChange={(event) => updateField("about_company", event.target.value)}
                />
              </div>
            </div>
          </section>

          <hr className="pre-meeting-divider" />

          <section className="pre-meeting-section" aria-labelledby="pre-meeting-pitch-title">
            <div className="pre-meeting-section-heading">
              <span className="pre-meeting-section-number">02</span>
              <h2 id="pre-meeting-pitch-title">Pitch information</h2>
            </div>
            <div className="pre-meeting-field pre-meeting-field-span">
              <label htmlFor="pre_meeting_opportunity">Sales opportunity</label>
              <textarea
                id="pre_meeting_opportunity"
                rows={3}
                value={values.sales_opportunity}
                placeholder="What is this first pitch about?"
                disabled={panelDisabled || identityLocked}
                required
                onChange={(event) => updateField("sales_opportunity", event.target.value)}
              />
            </div>

            <div className="pre-meeting-notes-row">
              <div className="pre-meeting-notes-card">
                <div className="pre-meeting-notes-header">
                  <strong>Notes</strong>
                  <button
                    type="button"
                    className="pre-meeting-voice-button"
                    disabled={panelDisabled}
                    aria-label="Add voice note"
                    title={opportunityId ? "Upload a voice note" : "Create the client first to use voice notes"}
                    onClick={() => voiceInputRef.current?.click()}
                  >
                    <Image src="/pre-meeting-mic.png" alt="" width={24} height={24} aria-hidden />
                  </button>
                  <input
                    ref={voiceInputRef}
                    type="file"
                    accept={STAGE1_VOICE_ACCEPT}
                    className="sr-only"
                    disabled={panelDisabled}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void handleVoiceFile(file);
                      }
                    }}
                  />
                </div>
                <textarea
                  className="pre-meeting-notes-input"
                  value={values.notes}
                  placeholder="Type sales context…"
                  disabled={panelDisabled}
                  rows={2}
                  onChange={(event) => updateField("notes", event.target.value)}
                />
              </div>
              <PreMeetingPitchFiles
                accessToken={accessToken}
                opportunityId={opportunityId}
                disabled={panelDisabled}
                stagedFiles={stagedFiles}
                onStagedFilesChange={setStagedFiles}
                onDocumentsChange={setClientDocuments}
              />
            </div>

            <details
              className="pre-meeting-additional"
              open={additionalOpen}
              onToggle={(event) => setAdditionalOpen((event.currentTarget as HTMLDetailsElement).open)}
            >
              <summary id={additionalId}>Additional opportunity information</summary>
              <div className="pre-meeting-additional-body">
                <div className="pre-meeting-field">
                  <label htmlFor="pre_meeting_department">Department</label>
                  <input
                    id="pre_meeting_department"
                    value={values.department}
                    placeholder="e.g. Sales Engineering"
                    disabled={panelDisabled || identityLocked}
                    required={submitAttempted}
                    onChange={(event) => updateField("department", event.target.value)}
                  />
                </div>
                <div className="pre-meeting-field">
                  <label htmlFor="pre_meeting_language">Language</label>
                  <select
                    id="pre_meeting_language"
                    value={values.language}
                    disabled={panelDisabled || identityLocked}
                    onChange={(event) => updateField("language", event.target.value)}
                  >
                    <option value="en">English</option>
                    <option value="de">German</option>
                    <option value="fr">French</option>
                  </select>
                </div>
                <label className="pre-meeting-checkbox">
                  <input
                    type="checkbox"
                    checked={values.pii_redaction_enabled}
                    disabled={panelDisabled || identityLocked}
                    onChange={(event) => updateField("pii_redaction_enabled", event.target.checked)}
                  />
                  Redact personal data before AI processing
                </label>
              </div>
            </details>
          </section>

          {missingInformationState ? (
            <WorkflowStateCard
              presentation={missingInformationState}
              variant="embedded"
              dataTestId="pre-meeting-missing-information"
              className="pre-meeting-workflow-state"
            />
          ) : null}
          {error ? (
            <p className="pre-meeting-form-error" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="pre-meeting-form-notice" role="status">
              {notice}
            </p>
          ) : null}
        </form>

        <aside className="pre-meeting-aside" aria-labelledby="pre-meeting-aside-title">
          <p className="pre-meeting-aside-kicker">One flow</p>
          <h2 id="pre-meeting-aside-title">Create client</h2>
          <hr className="pre-meeting-aside-divider" />
          <ol className="pre-meeting-summary-list">
            <li className={clientStepComplete ? "is-complete" : ""}>
              <span className="pre-meeting-summary-marker">1</span>
              <div>
                <strong>Client profile</strong>
                <span>{identityLocked ? "Created" : clientStepComplete ? "Ready" : "Pending"}</span>
              </div>
            </li>
            <li className={pitchStepComplete ? "is-complete" : ""}>
              <span className="pre-meeting-summary-marker">2</span>
              <div>
                <strong>First pitch</strong>
                <span>{identityLocked ? "Created" : pitchStepComplete ? "Ready" : "Pending"}</span>
              </div>
            </li>
            <li className={generateReady ? "is-complete" : ""}>
              <span className="pre-meeting-summary-marker">3</span>
              <div>
                <strong>Pitch generation</strong>
                <span>{generateReady ? "Ready to start" : "Starts automatically"}</span>
              </div>
            </li>
          </ol>
          <button
            type="button"
            className="pre-meeting-create-button"
            disabled={panelDisabled}
            onClick={() => void handleCreateClientAndPitch()}
          >
            {busy
              ? identityLocked
                ? "Creating pitch…"
                : "Creating client…"
              : identityLocked
                ? processedDocumentCount > 0
                  ? "Create client & pitch"
                  : "Save and continue"
                : "Create client & pitch"}
          </button>
          <p className="pre-meeting-time-hint">Pitch generation usually takes about 6 minutes.</p>
        </aside>
      </div>
    </div>
  );
}
