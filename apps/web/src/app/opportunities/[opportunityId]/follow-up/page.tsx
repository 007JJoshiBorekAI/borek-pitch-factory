export default function FollowUpPage() {
  return (
    <section className="workflow-standard-page" aria-labelledby="follow-up-title">
      <header className="workflow-section-header">
        <p>Export package</p>
        <h1 id="follow-up-title">Follow-up Email</h1>
        <span>Review and export the draft. The application never sends email.</span>
      </header>
      <div className="workflow-email-preview">
        <label>
          Subject
          <input type="text" value="Waiting for finalized context" readOnly />
        </label>
        <label>
          Body
          <textarea value="The editable email draft will appear after owner review." readOnly />
        </label>
        <div className="workflow-attachment-empty">No approved attachments are eligible yet.</div>
      </div>
      <button className="btn btn-primary" type="button" disabled>Export email draft</button>
    </section>
  );
}
