-- BT-34: additive nullable Stage 1 intake columns on opportunities.
-- Flat columns in Postgres; API exposes nested stage1_intake (see stage1_intake_store.py).

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS client_web_page TEXT;

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS poc_name TEXT;

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS poc_position TEXT;

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS sales_topic_description TEXT;

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS about_company TEXT;

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS voice_recording_artifact_id UUID;
