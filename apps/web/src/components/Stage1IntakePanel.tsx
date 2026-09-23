"use client";

import React, { useEffect, useState } from "react";

import { Stage1NextStepsAside } from "@/components/Stage1NextStepsAside";
import { Stage1VoiceNote } from "@/components/Stage1VoiceNote";
import type { Stage1Intake } from "@/lib/api";
import { stage1IntakeErrorMessage } from "@/lib/apiErrors";
import {
  EMPTY_STAGE1_FORM,
  STAGE1_ABOUT_COMPANY_UI_GUIDANCE,
  STAGE1_POC_MAX,
  STAGE1_TEXT_MAX,
  buildStage1IntakePayload,
  stage1IntakeToFormValues,
  validateStage1IntakeForm,
  type Stage1IntakeFormValues,
} from "@/lib/stage1Intake";

interface Stage1IntakePanelProps {
  disabled?: boolean;
  existingIntake?: Stage1Intake | null;
  draftValues?: Stage1IntakeFormValues;
  onDraftChange?: (values: Stage1IntakeFormValues) => void;
  opportunityId?: string | null;
  accessToken?: string | null;
  onSave?: (payload: Stage1Intake) => Promise<void>;
  showSaveAction?: boolean;
}

export function Stage1IntakePanel({
  disabled = false,
  existingIntake = null,
  draftValues,
  onDraftChange,
  opportunityId = null,
  accessToken = null,
  onSave,
  showSaveAction = false,
}: Stage1IntakePanelProps) {
  const [values, setValues] = useState<Stage1IntakeFormValues>(
    draftValues ?? stage1IntakeToFormValues(existingIntake),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (draftValues) {
      setValues(draftValues);
      return;
    }
    setValues(stage1IntakeToFormValues(existingIntake));
  }, [draftValues, existingIntake]);

  function updateField<K extends keyof Stage1IntakeFormValues>(key: K, value: Stage1IntakeFormValues[K]) {
    setValues((current) => {
      const next = { ...current, [key]: value };
      onDraftChange?.(next);
      return next;
    });
    setNotice(null);
    setError(null);
  }

  async function handleSave() {
    const validationError = validateStage1IntakeForm(values);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!onSave) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await onSave(buildStage1IntakePayload(values));
      setNotice("Pre-meeting information saved.");
    } catch (saveError) {
      setError(stage1IntakeErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  }

  const panelDisabled = disabled || busy;
  const aboutCompanyLength = values.about_company.length;
  const canUseVoice = Boolean(accessToken && opportunityId);

  return (
    <div className="stage1-intake-layout">
      <section className="upload-panel stage1-intake-panel" aria-labelledby="stage1-intake-title">
        <header className="upload-panel-header stage1-intake-header">
          <div>
            <p className="stage1-section-kicker">Pre-meeting information</p>
            <h2 id="stage1-intake-title">Prepare for the first meeting</h2>
            <p>
              Capture what the sales team already knows. A meeting transcript is not required at this
              stage.
            </p>
          </div>
        </header>

        {error ? <div className="alert alert-error">{error}</div> : null}
        {notice ? (
          <p className="stage1-intake-notice" role="status">
            {notice}
          </p>
        ) : null}

        <div className="stage1-intake-grid">
          <div className="form-field">
            <label htmlFor="stage1_client_web_page">Client website</label>
            <input
              id="stage1_client_web_page"
              type="url"
              inputMode="url"
              placeholder="https://example.com"
              value={values.client_web_page}
              disabled={panelDisabled}
              maxLength={2_048}
              onChange={(event) => updateField("client_web_page", event.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="stage1_poc_name">POC name</label>
            <input
              id="stage1_poc_name"
              placeholder="Point of contact"
              value={values.poc_name}
              disabled={panelDisabled}
              maxLength={STAGE1_POC_MAX}
              onChange={(event) => updateField("poc_name", event.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="stage1_poc_position">POC position</label>
            <input
              id="stage1_poc_position"
              placeholder="Job title or role"
              value={values.poc_position}
              disabled={panelDisabled}
              maxLength={STAGE1_POC_MAX}
              onChange={(event) => updateField("poc_position", event.target.value)}
            />
          </div>

          <div className="form-field stage1-field-span">
            <label htmlFor="stage1_sales_topic">Sales topic description</label>
            <textarea
              id="stage1_sales_topic"
              rows={4}
              placeholder="What is the first conversation about?"
              value={values.sales_topic_description}
              disabled={panelDisabled}
              maxLength={STAGE1_TEXT_MAX}
              onChange={(event) => updateField("sales_topic_description", event.target.value)}
            />
          </div>

          <div className="form-field stage1-field-span">
            <div className="stage1-field-label-row">
              <label htmlFor="stage1_about_company">About company</label>
              <span className="optional-label">Optional</span>
            </div>
            <textarea
              id="stage1_about_company"
              rows={5}
              placeholder="Background the sales team already has about the client"
              value={values.about_company}
              disabled={panelDisabled}
              maxLength={STAGE1_TEXT_MAX}
              onChange={(event) => updateField("about_company", event.target.value)}
            />
            <p className="stage1-char-counter" aria-live="polite">
              {aboutCompanyLength.toLocaleString()} / {STAGE1_ABOUT_COMPANY_UI_GUIDANCE.toLocaleString()}{" "}
              recommended · {STAGE1_TEXT_MAX.toLocaleString()} max
            </p>
          </div>
        </div>

        <div className="stage1-additional-context">
          <p className="stage1-section-kicker">Additional information</p>
          <div className="stage1-context-cards stage1-context-cards-single">
            {canUseVoice ? (
              <Stage1VoiceNote
                accessToken={accessToken!}
                opportunityId={opportunityId!}
                disabled={panelDisabled}
                onTranscriptReady={(transcript) => {
                  const current = values.sales_topic_description.trim();
                  updateField(
                    "sales_topic_description",
                    current ? `${current}\n\n${transcript}` : transcript,
                  );
                }}
              />
            ) : (
              <div className="stage1-context-card stage1-voice-card stage1-context-card-disabled">
                <div className="stage1-context-card-header">
                  <strong>Add a voice note</strong>
                  <span className="optional-label">Optional</span>
                </div>
                <p className="stage1-context-card-lead">Describe what you already know</p>
                <p className="stage1-context-card-deferred">
                  Create the opportunity first to upload or transcribe a recording.
                </p>
              </div>
            )}

          </div>
        </div>

        {showSaveAction && onSave ? (
          <div className="opportunity-form-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={panelDisabled}
              onClick={() => void handleSave()}
            >
              {busy ? "Saving…" : "Save pre-meeting information"}
            </button>
          </div>
        ) : null}
      </section>

      <Stage1NextStepsAside />
    </div>
  );
}

export { EMPTY_STAGE1_FORM, buildStage1IntakePayload, validateStage1IntakeForm };
