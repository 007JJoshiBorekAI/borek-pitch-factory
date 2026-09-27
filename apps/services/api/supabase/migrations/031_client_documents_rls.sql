-- BT-35 follow-up: RLS policies for client_documents tables (029 enabled RLS but only added storage policies).

DROP POLICY IF EXISTS "users_own_client_documents" ON client_documents;
CREATE POLICY "users_own_client_documents"
  ON client_documents
  FOR ALL
  USING (
    opportunity_id IN (
      SELECT id FROM opportunities
      WHERE created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "users_own_client_document_sections" ON client_document_sections;
CREATE POLICY "users_own_client_document_sections"
  ON client_document_sections
  FOR ALL
  USING (
    client_document_id IN (
      SELECT cd.id
      FROM client_documents cd
      INNER JOIN opportunities o ON o.id = cd.opportunity_id
      WHERE o.created_by = auth.uid()
    )
  );
