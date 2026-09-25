-- Pitch ownership (employee reference) and team list for opportunity rows.

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS pitch_owner JSONB;

ALTER TABLE opportunities
  DROP CONSTRAINT IF EXISTS opportunities_pitch_owner_object;
ALTER TABLE opportunities
  ADD CONSTRAINT opportunities_pitch_owner_object
  CHECK (
    pitch_owner IS NULL
    OR jsonb_typeof(pitch_owner) = 'object'
  );

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS team_members JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE opportunities
  DROP CONSTRAINT IF EXISTS opportunities_team_members_array;
ALTER TABLE opportunities
  ADD CONSTRAINT opportunities_team_members_array
  CHECK (jsonb_typeof(team_members) = 'array');

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS pitch_description TEXT;
