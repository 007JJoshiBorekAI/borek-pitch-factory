"use client";

import {
  EMAIL_LENGTH_LABEL, EMAIL_REVIEW_CHECKS, emailFlagText,
  type EmailAttachment, type EmailLength, type PostMeetingEmail,
} from "@/lib/postMeetingEmail";
import styles from "./post-meeting.module.css";

const dateTime = (value: string | null) => (value ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "");

/**
 * The original detailed owner review: one tick per review flag and one per checklist item, on the
 * page itself. It is kept unchanged and is shown instead of the Review & confirm dialog when the
 * web build sets NEXT_PUBLIC_FOLLOWUP_ADVANCED_REVIEW_UI=true (see docs/followup-email-review-ui.md).
 * Both interfaces confirm through the same API call; there is no second backend workflow.
 */
export function FollowUpAdvancedReview({
  draft, length, exportable, working, confirming, dirty, checks, setChecks, acknowledged, setAcknowledged, openFlags, needsReview, selectedFiles, blockedFile, canConfirm, onConfirm,
}: {
  draft: PostMeetingEmail; length: EmailLength; exportable: boolean; working: boolean; confirming: boolean; dirty: EmailLength[];
  checks: string[]; setChecks: (next: string[]) => void; acknowledged: string[]; setAcknowledged: (next: string[]) => void;
  openFlags: string[]; needsReview: boolean; selectedFiles: EmailAttachment[]; blockedFile: EmailAttachment | undefined; canConfirm: boolean; onConfirm: () => void;
}) {
  return <article className={styles.card} aria-labelledby="email-review-title" data-testid="email-review">
    <span className={styles.eyebrow}>Owner review</span>
    <h2 id="email-review-title">{exportable ? "Reviewed and confirmed" : "Review before confirming"}</h2>
    <dl className={styles.emailFields}>
      <div><dt>Length</dt><dd>{EMAIL_LENGTH_LABEL[exportable && draft.selectedLength ? draft.selectedLength : length]} · {draft.lengths[exportable && draft.selectedLength ? draft.selectedLength : length].wordCount} content words</dd></div>
      <div><dt>Subject</dt><dd>{draft.lengths[exportable && draft.selectedLength ? draft.selectedLength : length].subject}</dd></div>
      <div><dt>Source</dt><dd data-testid="email-source">{draft.source
        ? `Master Presentation V2 · version ${draft.source.versionNumber} · finalized ${dateTime(draft.source.finalizedAt)} · ${draft.source.confirmedFindings ?? 0} confirmed findings, ${draft.source.excludedFindings ?? 0} excluded`
        : "Meeting transcript (earlier document flow)"}{draft.sourceStatus === "changed" ? " — the finalized package changed; regenerate the email" : ""}</dd></div>
      <div><dt>Attachments</dt><dd>{selectedFiles.length ? selectedFiles.map((item) => item.fileName).join(", ") : "None selected"}</dd></div>
    </dl>
    {draft.reviewFlags.length && exportable ? <><h3>Review flags you acknowledged</h3><ul className={styles.emailFlags} data-testid="email-flags">{draft.reviewFlags.map((flag) => <li key={flag}>{emailFlagText(flag)}</li>)}</ul></> : null}
    {draft.reviewFlags.length && !exportable ? <fieldset className={styles.emailChecklist} disabled={working || dirty.length > 0} data-testid="email-flags">
      <legend>Review flags — acknowledge each one</legend>
      {draft.reviewFlags.map((flag) => <label key={flag} className={styles.check}>
        <input type="checkbox" data-testid={`email-flag-${flag}`} checked={acknowledged.includes(flag)}
          onChange={(event) => setAcknowledged(event.target.checked ? [...acknowledged, flag] : acknowledged.filter((item) => item !== flag))} />
        <span>{emailFlagText(flag)}</span></label>)}
      <small data-testid="email-flags-open">{openFlags.length ? `${openFlags.length} of ${draft.reviewFlags.length} still to acknowledge` : "All review flags acknowledged"}</small>
    </fieldset> : null}
    {exportable
      ? <p className={styles.notice} role="status">Confirmed {dateTime(draft.confirmedAt)} for revision {draft.confirmedRevision}. Nothing has been sent. Editing the text or the attachments withdraws the confirmation.</p>
      : <>
        {needsReview ? <fieldset className={styles.emailChecklist} disabled={working || dirty.length > 0} data-testid="email-checklist">
          <legend>Checklist</legend>
          {EMAIL_REVIEW_CHECKS.map(([key, label]) => <label key={key} className={styles.check}>
            <input type="checkbox" checked={checks.includes(key)} onChange={(event) => setChecks(event.target.checked ? [...checks, key] : checks.filter((item) => item !== key))} />
            <span>{label}</span></label>)}
        </fieldset> : null}
        {dirty.length ? <p><small>Save your changes first: the review is of the saved text.</small></p> : null}
        {blockedFile ? <p className={styles.error} role="alert">{blockedFile.fileName} is selected but not available. Deselect it or restore the approved file.</p> : null}
        <div className={styles.actions}>
          <button className="btn btn-primary" data-testid="email-confirm" disabled={!canConfirm} onClick={onConfirm}>{confirming ? "Confirming..." : `Confirm the ${EMAIL_LENGTH_LABEL[length].toLowerCase()} draft`}</button>
          <small>Confirming records your review of this saved revision. It does not send the email.</small>
        </div>
      </>}
  </article>;
}
