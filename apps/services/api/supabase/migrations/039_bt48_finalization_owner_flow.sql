-- BT-48: freeze final artifact identities once, without locking later source edits.
-- observed_sources are the live revisions seen at finalization.
-- They are not a claim about the inputs that generated PPT #2.
-- ppt2_generation_source_manifest stays null until JJ-35 persists that provenance.
-- opportunities.status and finalized_at keep their existing meanings.
-- Historical concretisation presentation rows stay valid.

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS finalization_snapshot JSONB;

CREATE OR REPLACE FUNCTION public.preserve_finalization_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF OLD.finalization_snapshot IS NOT NULL
       AND NEW.finalization_snapshot IS DISTINCT FROM OLD.finalization_snapshot THEN
        RAISE EXCEPTION 'Finalization snapshot is immutable';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS opportunities_finalization_snapshot_immutable ON public.opportunities;
CREATE TRIGGER opportunities_finalization_snapshot_immutable
BEFORE UPDATE ON public.opportunities
FOR EACH ROW EXECUTE FUNCTION public.preserve_finalization_snapshot();
