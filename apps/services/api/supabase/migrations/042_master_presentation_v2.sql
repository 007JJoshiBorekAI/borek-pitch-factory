-- Master Presentation V2: the owner review names the presentation version that was reviewed.
-- owner_reviewed_at alone cannot tell which version it was given for, and a Master Presentation
-- can receive a new V2 revision after a review. Finalization pins the reviewed version.
-- NULL on existing rows: a review recorded before this column keeps counting as it did.
-- Existing opportunities RLS covers this column; no new table and no new policy.

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS owner_reviewed_presentation_version_id UUID;

-- One Master Presentation V2 generation at a time per opportunity, enforced by the database so
-- that several API processes cannot both start one. A V2 job carries generation_lock_key and the
-- fingerprint of its frozen inputs; the partial unique index admits a single QUEUED/RUNNING job
-- per opportunity and lock key. The lock ends with the job: no separate row, nothing to clean up.
-- Both columns stay NULL for every other job, which the index therefore ignores.

ALTER TABLE generation_jobs
  ADD COLUMN IF NOT EXISTS generation_lock_key TEXT;

ALTER TABLE generation_jobs
  ADD COLUMN IF NOT EXISTS generation_fingerprint TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS generation_jobs_one_active_locked_generation
  ON generation_jobs (opportunity_id, generation_lock_key)
  WHERE generation_lock_key IS NOT NULL AND status IN ('QUEUED', 'RUNNING');
