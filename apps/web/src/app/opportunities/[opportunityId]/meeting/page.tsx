interface MeetingPageProps {
  params: Promise<{ opportunityId: string }>;
}

export default async function MeetingPage({ params }: MeetingPageProps) {
  const { opportunityId } = await params;
  return (
    <section className="workflow-standard-page" aria-labelledby="meeting-title">
      <header className="workflow-section-header">
        <p>Post-meeting · {opportunityId}</p>
        <h1 id="meeting-title">Meeting Evidence</h1>
        <span>Transcript and personal notes are stored as separate sources.</span>
      </header>
      <div className="workflow-source-grid">
        <article>
          <p className="workflow-panel-label">Transcript</p>
          <h2>Add meeting transcript</h2>
          <div className="workflow-upload-placeholder">Transcript upload unlocks after the first meeting checkpoint.</div>
          <span className="workflow-state-badge">Blocked</span>
        </article>
        <article>
          <p className="workflow-panel-label">Personal notes</p>
          <h2>Owner notes</h2>
          <textarea aria-label="Personal notes" placeholder="Add personal meeting notes" disabled />
          <span className="workflow-state-badge">Blocked</span>
        </article>
      </div>
    </section>
  );
}
