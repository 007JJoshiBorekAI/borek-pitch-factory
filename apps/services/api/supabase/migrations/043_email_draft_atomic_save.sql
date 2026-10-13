-- Follow-up email drafts: save ONE journey stage's draft atomically.
--
-- opportunities.email_drafts is one JSONB object with a draft per journey stage
-- (first_contact, deepening, concretisation). Writing it from the API meant sending the whole
-- object back, so two requests saving drafts of DIFFERENT stages at the same moment could each
-- write the object they had read and silently drop the other stage's change.
--
-- This function changes only the named stage inside the row that is locked by the UPDATE
-- (jsonb_set on the current value), and it checks the draft revision in the same statement:
--   p_expected_revision NULL  -> the stage must not have a draft yet
--   p_expected_revision N     -> the stage's draft must still be at revision N
--                                (a draft written before revisions existed counts as 1)
-- It returns the stored draft, or NULL when the revision did not match (the API answers 409).
-- A concurrent save of another stage waits for the row lock and is then merged into the new
-- value, so both changes survive.
--
-- SECURITY INVOKER: the caller's row-level security on opportunities applies unchanged.
-- No new table, no new policy, no data change.

CREATE OR REPLACE FUNCTION public.save_email_draft(
    p_opportunity_id UUID,
    p_journey_stage TEXT,
    p_expected_revision INTEGER,
    p_draft JSONB
)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
    UPDATE opportunities
       SET email_drafts = jsonb_set(
               CASE WHEN jsonb_typeof(email_drafts) = 'object' THEN email_drafts ELSE '{}'::jsonb END,
               ARRAY[p_journey_stage],
               p_draft,
               true
           ),
           updated_at = now()
     WHERE id = p_opportunity_id
       AND p_journey_stage IN ('first_contact', 'deepening', 'concretisation')
       AND jsonb_typeof(p_draft) = 'object'
       AND (
            (
                p_expected_revision IS NULL
                AND COALESCE(jsonb_typeof(email_drafts -> p_journey_stage), 'null') = 'null'
            )
            OR (
                p_expected_revision IS NOT NULL
                AND jsonb_typeof(email_drafts -> p_journey_stage) = 'object'
                AND COALESCE((email_drafts -> p_journey_stage ->> 'revision')::integer, 1) = p_expected_revision
            )
       )
    RETURNING email_drafts -> p_journey_stage;
$$;

REVOKE ALL ON FUNCTION public.save_email_draft(UUID, TEXT, INTEGER, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_email_draft(UUID, TEXT, INTEGER, JSONB) TO authenticated, service_role;
