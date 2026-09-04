-- Bhejo Phase 4: Supabase Storage Bucket & Cross-User Isolation Hardening
-- Run this in Supabase SQL editor to ensure strict privacy and object-level RLS.

-- 1. Create Private Storage Bucket 'documents' (Never Public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  10485760, -- 10MB limit per page
  ARRAY['image/jpeg']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg']::text[];

-- 2. Enable RLS on storage.objects (if not already enabled)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Remove any previous loose storage policies
DROP POLICY IF EXISTS "Owners can view their own session documents" ON storage.objects;
DROP POLICY IF EXISTS "Owners can delete their own session documents" ON storage.objects;

-- 4. Storage Policy: Read Access
-- Strictly restricts reading objects to authenticated session owners.
-- Storage object path format: sessions/{sessionId}/pages/{pageId}.jpg
CREATE POLICY "Owners can view their own session documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' AND
  EXISTS (
    SELECT 1 FROM public.scan_sessions
    WHERE public.scan_sessions.id = split_part(storage.objects.name, '/', 2)
      AND public.scan_sessions.owner_id = auth.uid()::text
  )
);

-- 5. Storage Policy: Delete Access
-- Strictly restricts deleting objects to authenticated session owners.
CREATE POLICY "Owners can delete their own session documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents' AND
  EXISTS (
    SELECT 1 FROM public.scan_sessions
    WHERE public.scan_sessions.id = split_part(storage.objects.name, '/', 2)
      AND public.scan_sessions.owner_id = auth.uid()::text
  )
);

-- 6. Direct Client Inserts are DENIED
-- Page uploads are handled exclusively by server-side route handlers 
-- (/api/sessions/[publicToken]/upload-page) using the secure SUPABASE_SECRET_KEY
-- after verifying the recipient's session token and active scan window.
