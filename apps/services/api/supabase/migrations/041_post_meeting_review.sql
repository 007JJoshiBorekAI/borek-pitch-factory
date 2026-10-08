-- Post Meeting review: the owner's confirmation of the structured meeting findings.
-- One JSON record on the opportunity, next to meeting_extraction. It stores the confirmed and
-- excluded findings together with the source revisions they were confirmed against.
-- Existing opportunities RLS covers this column; no new table and no new policy.

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS meeting_review JSONB;
