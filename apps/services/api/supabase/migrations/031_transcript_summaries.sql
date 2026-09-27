-- BT-36: persist TRANSCRIPT_SUMMARY per conversation (031 — do not reuse 030).
-- 030_bt36_stage_outputs.sql already landed on main (opportunity JSONB envelopes).
-- origin/bt/bt36-stage-outputs used the same number for this table; this file is that table as 031.

CREATE TABLE IF NOT EXISTS public.transcript_summaries (
    transcript_id UUID NOT NULL PRIMARY KEY REFERENCES public.transcripts(id) ON DELETE CASCADE,
    opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
    conversation_id TEXT NOT NULL,
    generation_job_id UUID REFERENCES public.generation_jobs(id) ON DELETE SET NULL,
    schema_version TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    processing_status TEXT NOT NULL DEFAULT 'completed',
    summary_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transcript_summaries_opportunity_id_idx
    ON public.transcript_summaries(opportunity_id);

CREATE INDEX IF NOT EXISTS transcript_summaries_generation_job_id_idx
    ON public.transcript_summaries(generation_job_id);

ALTER TABLE public.transcript_summaries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.transcript_summaries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.transcript_summaries TO service_role;
