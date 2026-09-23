import React from "react";

export function Stage1NextStepsAside() {
  return (
    <aside className="stage1-next-steps" aria-labelledby="stage1-next-steps-title">
      <h2 id="stage1-next-steps-title">What happens next</h2>
      <ol className="stage1-next-steps-list">
        <li>
          <span className="stage1-next-step-index" aria-hidden="true">
            1
          </span>
          <div>
            <strong>Company brief</strong>
            <p>Facts with sources and gaps</p>
          </div>
        </li>
        <li>
          <span className="stage1-next-step-index" aria-hidden="true">
            2
          </span>
          <div>
            <strong>Borek hypothesis</strong>
            <p>Capabilities and opportunities</p>
          </div>
        </li>
        <li>
          <span className="stage1-next-step-index" aria-hidden="true">
            3
          </span>
          <div>
            <strong>Meeting preparation</strong>
            <p>Questions, agenda and pitch</p>
          </div>
        </li>
      </ol>
      <div className="stage1-next-steps-footer">
        <p>Nothing is sent automatically.</p>
        <p>Client-facing material still requires Managing Partner release.</p>
      </div>
    </aside>
  );
}
