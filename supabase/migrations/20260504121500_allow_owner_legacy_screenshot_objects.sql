-- Keep the screenshots bucket private while allowing the single journal owner
-- to view/delete legacy objects that were uploaded before paths were namespaced
-- by auth.uid(). New uploads still use auth.uid() as the first path segment.

DROP POLICY IF EXISTS "owner screenshot object read" ON storage.objects;
DROP POLICY IF EXISTS "owner screenshot object update" ON storage.objects;
DROP POLICY IF EXISTS "owner screenshot object delete" ON storage.objects;

CREATE POLICY "owner screenshot object read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'screenshots' AND public.is_app_owner());

CREATE POLICY "owner screenshot object update" ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'screenshots' AND public.is_app_owner())
  WITH CHECK (
    bucket_id = 'screenshots'
    AND public.is_app_owner()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "owner screenshot object delete" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'screenshots' AND public.is_app_owner());
