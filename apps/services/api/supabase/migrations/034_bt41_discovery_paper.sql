-- BT-41: structured Discovery Paper on the opportunity. Approval and versions stay for BT-42.

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS discovery_paper JSONB;
