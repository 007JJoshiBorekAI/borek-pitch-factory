-- D3: employee role model + activity-log document identity.

CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_role_allowed
    CHECK (role IN ('consultant', 'reviewer', 'releaser', 'admin'))
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_role" ON user_roles;
CREATE POLICY "users_read_own_role"
  ON user_roles
  FOR SELECT
  USING (user_id = auth.uid());

REVOKE ALL ON public.user_roles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS document_id TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_email TEXT;

UPDATE audit_log
  SET document_id = object_id::text
  WHERE document_id IS NULL;

CREATE INDEX IF NOT EXISTS audit_log_document_id_idx
  ON audit_log (document_id);

CREATE INDEX IF NOT EXISTS audit_log_actor_timestamp_idx
  ON audit_log (actor_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS user_roles_role_idx
  ON user_roles (role);
