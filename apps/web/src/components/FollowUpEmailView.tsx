import Link from "next/link";
import React from "react";

import {
  FOLLOWUP_CHECKLIST,
  followupContentWordCount,
  primaryFollowupRecipient,
  validateFollowupProjectStatics,
  type FollowupChecklistId,
  type FollowupChecklistState,
  type FollowupDraft,
  type FollowupProjectStatics,
  type FollowupRecipient,
} from "@/lib/followupReview";
import { WorkflowStateCard } from "@/components/WorkflowStateCard";
import {
  buildFollowUpEmailReadiness,
  followUpEditorHeaderLabel,
  FOLLOWUP_EMAIL_LENGTHS,
  followUpLengthLabel,
  followUpMeetingInputHref,
  formatFollowUpRecipientDisplay,
  isFollowUpBodyEditable,
  isFollowUpRecipientEditable,
  isFollowUpSubjectEditable,
  type FollowUpEmailReadinessModel,
} from "@/lib/followUpEmail";
import { followUpReadinessWorkflowState } from "@/lib/workflowState";
import type { EmailDraftLength } from "@/lib/journeyOutputsContracts";
import type { StageEmailReviewContext } from "@/lib/stageEmailReview";

export interface FollowUpEmailViewProps {
  opportunityId: string | null;
  clientName: string | null;
  stageContext: StageEmailReviewContext;
  demoMode: boolean;
  statics: FollowupProjectStatics;
  staticsSaved: boolean;
  draft: FollowupDraft | null;
  draftNotGenerated?: boolean;
  draftUnavailable?: boolean;
  selectedLength?: EmailDraftLength;
  liveDraftReadOnly?: boolean;
  serverConfirmed?: boolean;
  bodyEdited?: boolean;
  checklist: FollowupChecklistState;
  acknowledgedFlags: ReadonlySet<string>;
  busy: boolean;
  generatingDraft?: boolean;
  confirmingDraft?: boolean;
  loading?: boolean;
  error: string | null;
  info: string | null;
  onStaticsChange: (value: FollowupProjectStatics) => void;
  onSaveStatics: () => void;
  onDraftChange: (value: FollowupDraft) => void;
  onLengthChange?: (length: EmailDraftLength) => void;
  onGenerateDraft?: () => void;
  onChecklistChange: (id: FollowupChecklistId, checked: boolean) => void;
  onFlagChange: (flag: string, checked: boolean) => void;
  onConfirm: () => void;
}

function checklistStatusClass(status: string): string {
  switch (status) {
    case "ready":
    case "edited":
    case "attached":
      return "follow-up-email-check-ready";
    case "none":
      return "follow-up-email-check-neutral";
    default:
      return "follow-up-email-check-missing";
  }
}

export function FollowUpEmailView({
  opportunityId,
  clientName,
  stageContext,
  demoMode,
  statics,
  staticsSaved,
  draft,
  draftNotGenerated = false,
  draftUnavailable = false,
  selectedLength = "medium",
  liveDraftReadOnly = false,
  serverConfirmed = false,
  bodyEdited = false,
  checklist,
  acknowledgedFlags,
  busy,
  generatingDraft = false,
  confirmingDraft = false,
  loading = false,
  error,
  info,
  onStaticsChange,
  onSaveStatics,
  onDraftChange,
  onLengthChange,
  onGenerateDraft,
  onChecklistChange,
  onFlagChange,
  onConfirm,
}: FollowUpEmailViewProps) {
  const primaryIndex = statics.standard_recipients.findIndex(
    (recipient) => recipient.kind === "to" && recipient.primary,
  );
  const primary = statics.standard_recipients[primaryIndex] ?? statics.standard_recipients[0];
  const locked = Boolean(
    serverConfirmed || (draft && draft.status !== "draft"),
  );
  const subjectEditable = isFollowUpSubjectEditable(demoMode, locked, busy);
  const bodyEditable = isFollowUpBodyEditable(demoMode, locked, busy);
  const recipientEditable = isFollowUpRecipientEditable(locked, busy);
  const recipientDisplayReady =
    staticsSaved && validateFollowupProjectStatics(statics).length === 0;

  const readiness: FollowUpEmailReadinessModel = buildFollowUpEmailReadiness({
    statics,
    staticsSaved,
    draft,
    checklist,
    acknowledgedFlags,
    demoMode,
    serverConfirmed,
    bodyEdited,
    busy,
    confirming: confirmingDraft,
    loading,
    error,
    clientName,
  });
  const readinessWorkflowState = followUpReadinessWorkflowState(
    readiness.phase,
    readiness.recipientSummary,
  );

  const updatePrimary = (updates: Partial<FollowupRecipient>) => {
    onStaticsChange({
      ...statics,
      standard_recipients: statics.standard_recipients.map((recipient, index) =>
        index === primaryIndex
          ? { ...recipient, ...updates, kind: "to", primary: true }
          : recipient,
      ),
    });
  };

  const backHref = followUpMeetingInputHref(opportunityId);

  return (
    <div
      className="follow-up-email-workspace app-shell app-workspace-body"
      data-testid="follow-up-email-workspace"
    >
      <header className="follow-up-email-header">
        <p className="follow-up-email-eyebrow">POST-MEETING</p>
        <h1 className="follow-up-email-title">Review follow-up email</h1>
        <p className="follow-up-email-context">{clientName ?? "Select a client"}</p>
      </header>

      <div className="post-meeting-flow follow-up-email-flow" aria-label="Post-meeting workflow">
        <div className="post-meeting-flow-step post-meeting-flow-step-complete">
          <span className="post-meeting-flow-marker">1</span>
          <span>Meeting input</span>
        </div>
        <span className="post-meeting-flow-connector" aria-hidden="true" />
        <div className="post-meeting-flow-step post-meeting-flow-step-active">
          <span className="post-meeting-flow-marker">2</span>
          <span>Generate + review</span>
        </div>
      </div>

      {stageContext.sourceBadgeLabel ? (
        <p className="follow-up-email-source-badge">{stageContext.sourceBadgeLabel}</p>
      ) : null}

      {error ? (
        <p className="upload-banner upload-banner-error" role="alert">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="upload-banner upload-banner-success" role="status">
          {info}
        </p>
      ) : null}

      {loading ? (
        <section className="follow-up-email-loading" data-testid="follow-up-email-loading">
          <p>Loading email review…</p>
        </section>
      ) : null}

      {!loading && !draft && (draftNotGenerated || draftUnavailable) ? (
        <section className="follow-up-email-empty" data-testid="follow-up-email-empty">
          <strong>{stageContext.draftUnavailableTitle}</strong>
          <p>{stageContext.draftUnavailableMessage}</p>
          {draftNotGenerated && onGenerateDraft ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || generatingDraft || !staticsSaved}
              onClick={onGenerateDraft}
            >
              {generatingDraft ? "Generating email draft…" : "Generate email draft"}
            </button>
          ) : null}
          {!staticsSaved ? (
            <p className="upload-hint">Save valid project email settings before generating a draft.</p>
          ) : null}
        </section>
      ) : null}

      {!loading && !draft && !draftNotGenerated && !draftUnavailable ? (
        <section className="follow-up-email-empty">
          <p>Save valid project email settings to prepare email review for this stage.</p>
        </section>
      ) : null}

      {draft ? (
        <div className="follow-up-email-body">
          <section className="follow-up-email-editor" aria-labelledby="follow-up-email-editor-title">
            <div className="follow-up-email-editor-header">
              <p id="follow-up-email-editor-title" className="follow-up-email-editor-kicker">
                {followUpEditorHeaderLabel(demoMode, liveDraftReadOnly)}
              </p>
              {readiness.editorSavedLabel ? (
                <span className="follow-up-email-editor-saved">{readiness.editorSavedLabel}</span>
              ) : null}
            </div>

            {liveDraftReadOnly ? (
              <div
                className="follow-up-email-length-row"
                role="tablist"
                aria-label="Email draft length"
              >
                {FOLLOWUP_EMAIL_LENGTHS.map((length) => (
                  <button
                    key={length}
                    type="button"
                    role="tab"
                    aria-selected={selectedLength === length}
                    className={`btn btn-secondary btn-sm${selectedLength === length ? " is-active" : ""}`}
                    disabled={busy || locked}
                    onClick={() => onLengthChange?.(length)}
                  >
                    {followUpLengthLabel(length)}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="follow-up-email-field-row">
              <span className="follow-up-email-field-label">TO</span>
              <div className="follow-up-email-field-value">
                {recipientDisplayReady || !recipientEditable ? (
                  <span data-testid="follow-up-recipient-display">
                    {formatFollowUpRecipientDisplay(statics, clientName)}
                  </span>
                ) : (
                  <input
                    type="email"
                    className="follow-up-email-inline-input"
                    value={primary?.email ?? ""}
                    placeholder="Recipient email"
                    disabled={busy}
                    onChange={(event) => updatePrimary({ email: event.target.value })}
                    data-testid="follow-up-recipient-email"
                  />
                )}
              </div>
            </div>

            <div className="follow-up-email-field-row">
              <span className="follow-up-email-field-label">SUBJECT</span>
              <div className="follow-up-email-field-value">
                <input
                  className="follow-up-email-inline-input follow-up-email-subject-input"
                  value={draft.subject}
                  readOnly={!subjectEditable}
                  disabled={!subjectEditable}
                  onChange={(event) => onDraftChange({ ...draft, subject: event.target.value })}
                  data-testid="follow-up-subject"
                />
              </div>
            </div>

            <div className="follow-up-email-body-frame">
              <textarea
                className="follow-up-email-body-input"
                value={draft.body}
                readOnly={!bodyEditable}
                disabled={!bodyEditable}
                onChange={(event) => onDraftChange({ ...draft, body: event.target.value })}
                data-testid="follow-up-body"
              />
            </div>

            <details className="follow-up-email-settings">
              <summary>Project email settings</summary>
              <div className="follow-up-email-settings-body">
                <p className="upload-hint">{stageContext.unsentNote}</p>
                <div className="followup-form-grid">
                  <div className="form-field">
                    <label htmlFor="followup-project-name">Project name</label>
                    <input
                      id="followup-project-name"
                      value={statics.project_name}
                      onChange={(event) =>
                        onStaticsChange({ ...statics, project_name: event.target.value })
                      }
                      disabled={busy || locked}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="followup-client-short">Client short name</label>
                    <input
                      id="followup-client-short"
                      value={statics.client_short}
                      onChange={(event) =>
                        onStaticsChange({ ...statics, client_short: event.target.value })
                      }
                      disabled={busy || locked}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="followup-recipient-first">Recipient first name</label>
                    <input
                      id="followup-recipient-first"
                      value={primary?.first_name ?? ""}
                      onChange={(event) =>
                        updatePrimary({ first_name: event.target.value || null })
                      }
                      disabled={busy || locked}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="followup-sender-name">Sender name</label>
                    <input
                      id="followup-sender-name"
                      value={statics.sender_profile.name}
                      onChange={(event) =>
                        onStaticsChange({
                          ...statics,
                          sender_profile: { ...statics.sender_profile, name: event.target.value },
                        })
                      }
                      disabled={busy || locked}
                    />
                  </div>
                </div>
                {!locked ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={onSaveStatics}
                    disabled={busy}
                    data-testid="follow-up-save-settings"
                  >
                    {busy ? "Saving…" : "Save project settings"}
                  </button>
                ) : null}
              </div>
            </details>
          </section>

          <aside className="follow-up-email-actions" aria-labelledby="follow-up-email-ready-title">
            {readinessWorkflowState ? (
              <WorkflowStateCard
                presentation={readinessWorkflowState}
                variant="embedded"
                dataTestId="follow-up-readiness-state"
                className="follow-up-email-readiness-state"
              />
            ) : null}
            <p className="follow-up-email-actions-kicker">EMAIL READY</p>
            <h2 id="follow-up-email-ready-title" className="follow-up-email-actions-title">
              {readiness.heading}
            </h2>
            {readiness.recipientSummary ? (
              <p className="follow-up-email-actions-recipient">{readiness.recipientSummary}</p>
            ) : null}

            <ul className="follow-up-email-checklist" data-testid="follow-up-readiness-checklist">
              {readiness.checklist.map((item) => (
                <li key={item.id} className="follow-up-email-check-row">
                  <span>{item.label}</span>
                  <span className={checklistStatusClass(item.status)}>{item.statusLabel}</span>
                </li>
              ))}
            </ul>

            <details className="follow-up-email-review-details">
              <summary>Required review checklist</summary>
              <div className="followup-checklist">
                {FOLLOWUP_CHECKLIST.map((item) => (
                  <label key={item.id}>
                    <input
                      type="checkbox"
                      checked={checklist[item.id]}
                      onChange={(event) => onChecklistChange(item.id, event.target.checked)}
                      disabled={busy || locked}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
              {draft.review_flags.length ? (
                <div className="followup-flags">
                  {draft.review_flags.map((flag) => (
                    <label key={flag}>
                      <input
                        type="checkbox"
                        checked={acknowledgedFlags.has(flag)}
                        onChange={(event) => onFlagChange(flag, event.target.checked)}
                        disabled={busy || locked}
                      />
                      <span>Checked against transcript: {flag}</span>
                    </label>
                  ))}
                </div>
              ) : null}
              <p className="upload-hint">{stageContext.confirmHint}</p>
            </details>

            <button
              type="button"
              className="btn btn-primary follow-up-email-confirm-btn"
              data-testid="followup-confirm-review"
              disabled={readiness.primaryCtaDisabled}
              onClick={onConfirm}
            >
              {readiness.primaryCtaLabel}
            </button>

            <Link
              href={backHref}
              className="btn btn-secondary follow-up-email-back-btn"
              data-testid="follow-up-back-to-meeting"
            >
              Back to meeting input
            </Link>

            <p className="follow-up-email-support-copy">{readiness.supportCopy}</p>

            {readiness.validationErrors.length ? (
              <ul className="follow-up-email-validation" role="alert">
                {readiness.validationErrors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : null}

            <p className="upload-hint follow-up-email-word-count">
              {followupContentWordCount(draft.body)}/150 body words
            </p>
          </aside>
        </div>
      ) : (
        <details className="follow-up-email-settings follow-up-email-settings-standalone">
          <summary>Project email settings</summary>
          <div className="follow-up-email-settings-body">
            <p className="upload-hint">{stageContext.unsentNote}</p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onSaveStatics}
              disabled={busy}
              data-testid="follow-up-save-settings"
            >
              {busy ? "Saving…" : "Save project settings"}
            </button>
          </div>
        </details>
      )}
    </div>
  );
}
