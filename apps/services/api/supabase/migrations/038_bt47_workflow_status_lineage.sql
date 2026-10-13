-- BT-47: explicit workflow milestones and a PPT #2 presentation role.
-- opportunities.status stays the existing lifecycle flag.
-- post_meeting is not a journey-eligibility stage.

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS first_meeting_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS owner_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;

ALTER TABLE presentation_versions
  DROP CONSTRAINT IF EXISTS presentation_versions_journey_stage_check;
ALTER TABLE presentation_versions
  ADD CONSTRAINT presentation_versions_journey_stage_check
    CHECK (
      journey_stage IS NULL
      OR journey_stage IN ('first_contact', 'deepening', 'concretisation', 'post_meeting')
    );
