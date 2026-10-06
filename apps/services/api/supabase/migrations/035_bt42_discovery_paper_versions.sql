-- BT-42: opportunity-scoped Discovery Paper versions.
-- Draft rows may be updated. Approved rows are immutable.

CREATE TABLE IF NOT EXISTS public.discovery_paper_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    document_id UUID NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'approved')),
    paper_json JSONB NOT NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS discovery_paper_versions_opportunity_version_key
    ON public.discovery_paper_versions (opportunity_id, version_number);

ALTER TABLE public.discovery_paper_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_discovery_paper_versions" ON public.discovery_paper_versions;
CREATE POLICY "users_own_discovery_paper_versions"
    ON public.discovery_paper_versions
    FOR ALL
    USING (
        opportunity_id IN (
            SELECT id FROM public.opportunities
            WHERE created_by = auth.uid()
        )
    );

CREATE OR REPLACE FUNCTION public.prevent_approved_discovery_paper_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'approved' THEN
            RAISE EXCEPTION 'Approved Discovery Paper versions are immutable';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD.status = 'approved' THEN
        RAISE EXCEPTION 'Approved Discovery Paper versions are immutable';
    END IF;

    IF NEW.status = 'draft' AND OLD.status <> 'draft' THEN
        RAISE EXCEPTION 'Approved Discovery Paper versions cannot return to draft';
    END IF;

    IF NEW.status NOT IN ('draft', 'approved') THEN
        RAISE EXCEPTION 'Invalid Discovery Paper version status';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS discovery_paper_versions_approved_immutable ON public.discovery_paper_versions;
CREATE TRIGGER discovery_paper_versions_approved_immutable
BEFORE UPDATE OR DELETE ON public.discovery_paper_versions
FOR EACH ROW EXECUTE FUNCTION public.prevent_approved_discovery_paper_mutation();
