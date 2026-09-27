-- MS-35: optional pre-meeting client email on the Stage 1 brief.

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS client_preparation_email JSONB;
