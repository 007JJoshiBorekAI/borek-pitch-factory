-- JJ-34: generic generation source identity on a presentation version.
-- PPT #1 stores the approved Discovery version id. Bodies are not stored.
-- JJ-35 can reuse this column for its own manifest kind.

ALTER TABLE presentation_versions
  ADD COLUMN IF NOT EXISTS generation_source_manifest JSONB;
