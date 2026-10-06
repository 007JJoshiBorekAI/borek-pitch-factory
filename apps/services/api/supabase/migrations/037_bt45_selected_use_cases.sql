-- BT-45: ordered fact ids of selected AT-59 reference use cases.
-- Canonical statements and payloads stay in the knowledge corpus.

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS selected_use_case_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
