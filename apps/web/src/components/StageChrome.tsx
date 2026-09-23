"use client";

import Link from "next/link";

const STEPS = ["Stage 1", "First meeting", "Stage 2", "Create pitch", "Prepare", "Present"] as const;

export function StageStepper({ activeIndex }: { activeIndex: number }) {
  return (
    <div className="pitch-stepper">
      {STEPS.map((label, index) => {
        const state = index < activeIndex ? "done" : index === activeIndex ? "current" : "later";
        return (
          <div className="pitch-step-item" key={label}>
            <div className="pitch-step-line" />
            <div className={`pitch-step-marker ${state}`} />
            <div className={`pitch-step-name${state === "later" ? " muted" : ""}`}>{label}</div>
            <div className={`pitch-step-state${state === "current" ? " current" : ""}`}>
              {state === "done" ? "Complete" : state === "current" ? "Current" : index === activeIndex + 1 ? "Next" : "Later"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function StageInputs({
  opportunityId,
  active,
  draftReady,
}: {
  opportunityId: string;
  active: "meeting" | "opportunity" | "stakeholders" | "next";
  draftReady: { meeting: boolean; opportunity: boolean; stakeholders: boolean; nextSteps: boolean };
}) {
  const query = `?opportunityId=${encodeURIComponent(opportunityId)}`;
  const items = [
    { id: "meeting", href: `/first-meeting${query}`, name: "01 First meeting", meta: draftReady.meeting ? "Reviewed" : "Current" },
    { id: "opportunity", href: `/opportunity${query}`, name: "02 Opportunity", meta: draftReady.opportunity ? "Reviewed" : "Ready to review" },
    { id: "stakeholders", href: `/opportunity${query}#stakeholders`, name: "03 Stakeholders", meta: draftReady.stakeholders ? "Reviewed" : "Ready to review" },
    { id: "next", href: `/opportunity${query}#next-steps`, name: "04 Next steps", meta: draftReady.nextSteps ? "Reviewed" : "Missing details" },
  ] as const;

  return (
    <div className="pitch-left-col">
      <div className="pitch-panel-label">Stage 2 inputs</div>
      <p className="pitch-panel-desc">Review what was captured from the meeting.</p>
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className={`pitch-input-item${item.id === active ? " active" : ""}`}
        >
          <div className="name">{item.name}</div>
          <div className={`meta${item.id === "next" && !draftReady.nextSteps ? " blue" : ""}`}>{item.meta}</div>
        </Link>
      ))}
    </div>
  );
}
