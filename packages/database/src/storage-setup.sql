-- ============================================================================
-- Storage bucket setup for the unified `media` bucket
--
-- Holds all uploaded files:
--   - feedback media (photos, voice notes, video, signatures) under `orders/...`
--   - inventory images (fabrics, shelf items, accessories) under `inventory/...`
--
-- Run this in your Supabase SQL Editor (or via psql against your DB).
-- Safe to run multiple times — all statements are idempotent.
-- ============================================================================

-- 1. Create the bucket (public so URLs work without signed tokens)
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow anyone with the anon key to upload files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'media_insert' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "media_insert"
      ON storage.objects FOR INSERT
      TO anon, authenticated
      WITH CHECK (bucket_id = 'media');
  END IF;
END $$;

-- 3. Allow anyone to read files (public bucket)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'media_select' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "media_select"
      ON storage.objects FOR SELECT
      TO anon, authenticated
      USING (bucket_id = 'media');
  END IF;
END $$;

-- 4. Allow overwriting / updating files (for upsert)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'media_update' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "media_update"
      ON storage.objects FOR UPDATE
      TO anon, authenticated
      USING (bucket_id = 'media');
  END IF;
END $$;

-- 5. Allow deleting files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'media_delete' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "media_delete"
      ON storage.objects FOR DELETE
      TO anon, authenticated
      USING (bucket_id = 'media');
  END IF;
END $$;
