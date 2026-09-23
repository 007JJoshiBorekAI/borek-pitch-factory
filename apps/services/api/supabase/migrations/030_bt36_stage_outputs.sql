-- BT-36 / TSK-013: Stage 1/2 output envelopes, meeting feedback, email drafts.

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS meeting_feedback_text TEXT;

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS meeting_feedback_updated_at TIMESTAMPTZ;

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS stage1_outputs JSONB;

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS stage2_outputs JSONB;

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS email_drafts JSONB;
