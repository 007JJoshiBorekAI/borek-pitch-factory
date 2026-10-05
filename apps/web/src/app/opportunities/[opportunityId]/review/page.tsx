export default function ReviewPage() {
  return (
    <section className="workflow-standard-page" aria-labelledby="review-title">
      <header className="workflow-section-header">
        <p>Owner checkpoint</p>
        <h1 id="review-title">Owner Review</h1>
        <span>Review PPT #2, final documents, attachment choices, and the email draft.</span>
      </header>
      <div className="workflow-review-list">
        {[
          "PPT #2 presentation",
          "Final documents",
          "Approved attachments",
          "Follow-up email draft",
        ].map((label) => (
          <div key={label}>
            <span>{label}</span>
            <strong>Waiting</strong>
          </div>
        ))}
      </div>
      <button className="btn btn-primary" type="button" disabled>Finalize outputs</button>
    </section>
  );
}
