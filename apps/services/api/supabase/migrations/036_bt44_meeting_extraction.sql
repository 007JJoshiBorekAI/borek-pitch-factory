-- BT-44: owner personal notes and structured meeting extraction on the opportunity.
-- Transcripts stay in transcripts / transcript_sections. Existing opportunities RLS covers these columns.

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS personal_notes TEXT;

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS personal_notes_updated_at TIMESTAMPTZ;

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS meeting_extraction JSONB;
