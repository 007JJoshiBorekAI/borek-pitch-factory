-- Updated pitch intake, employee selection, and reviewed first-meeting details.

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS service_solution TEXT;

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS business_need TEXT;

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS pitch_description TEXT;

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS poc_email TEXT;

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS email_sender_profile JSONB;

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS pitch_owner JSONB;

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS team_members JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS first_meeting_details JSONB;

UPDATE opportunities
  SET pitch_owner = jsonb_build_object(
    'source', 'employee',
    'employee_id', created_by::text
  )
  WHERE pitch_owner IS NULL;

ALTER TABLE opportunities
  ALTER COLUMN pitch_owner SET NOT NULL;

ALTER TABLE opportunities
  DROP CONSTRAINT IF EXISTS opportunities_pitch_owner_object;
ALTER TABLE opportunities
  ADD CONSTRAINT opportunities_pitch_owner_object
  CHECK (pitch_owner IS NULL OR jsonb_typeof(pitch_owner) = 'object');

ALTER TABLE opportunities
  DROP CONSTRAINT IF EXISTS opportunities_email_sender_profile_object;
ALTER TABLE opportunities
  ADD CONSTRAINT opportunities_email_sender_profile_object
  CHECK (
    email_sender_profile IS NULL
    OR jsonb_typeof(email_sender_profile) = 'object'
  );

ALTER TABLE opportunities
  DROP CONSTRAINT IF EXISTS opportunities_team_members_array;
ALTER TABLE opportunities
  ADD CONSTRAINT opportunities_team_members_array
  CHECK (jsonb_typeof(team_members) = 'array');

ALTER TABLE opportunities
  DROP CONSTRAINT IF EXISTS opportunities_first_meeting_details_object;
ALTER TABLE opportunities
  ADD CONSTRAINT opportunities_first_meeting_details_object
  CHECK (first_meeting_details IS NULL OR jsonb_typeof(first_meeting_details) = 'object');

DROP POLICY IF EXISTS "users_read_own_role" ON user_roles;
DROP POLICY IF EXISTS "authenticated_read_employee_directory" ON user_roles;
CREATE POLICY "authenticated_read_employee_directory"
  ON user_roles
  FOR SELECT
  TO authenticated
  USING (true);
