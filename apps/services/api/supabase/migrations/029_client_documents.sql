-- BT-35: private First contact client documents and extracted text sections.

CREATE TABLE IF NOT EXISTS client_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL
    REFERENCES opportunities(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  document_key TEXT NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS client_documents_opportunity_document_key_key
  ON client_documents(opportunity_id, document_key);

CREATE TABLE IF NOT EXISTS client_document_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_document_id UUID NOT NULL
    REFERENCES client_documents(id) ON DELETE CASCADE,
  section_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS client_document_sections_document_idx
  ON client_document_sections(client_document_id, section_index);

ALTER TABLE client_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_document_sections ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES ('client_documents', 'client_documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "users_own_client_document_objects" ON storage.objects;
CREATE POLICY "users_own_client_document_objects"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'client_documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM opportunities WHERE created_by = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'client_documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM opportunities WHERE created_by = auth.uid()
    )
  );
