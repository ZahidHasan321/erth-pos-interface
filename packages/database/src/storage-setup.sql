-- ============================================================================
-- Storage bucket setup for feedback media (photos, voice notes, signatures)
--
-- Run this in your Supabase SQL Editor (or via psql against your DB).
-- Safe to run multiple times — all statements are idempotent.
--
-- If migrating away from Supabase, this file is no longer needed — the
-- storage facade in apps/pos-interface/src/lib/storage.ts handles the swap.
-- ============================================================================

-- 1. Create the bucket (public so URLs work without signed tokens)
INSERT INTO storage.buckets (id, name, public)
VALUES ('feedback-media', 'feedback-media', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow anyone with the anon key to upload files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'feedback_media_insert' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "feedback_media_insert"
      ON storage.objects FOR INSERT
      TO anon, authenticated
      WITH CHECK (bucket_id = 'feedback-media');
  END IF;
END $$;

-- 3. Allow anyone to read files (public bucket)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'feedback_media_select' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "feedback_media_select"
      ON storage.objects FOR SELECT
      TO anon, authenticated
      USING (bucket_id = 'feedback-media');
  END IF;
END $$;

-- 4. Allow overwriting / updating files (for upsert)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'feedback_media_update' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "feedback_media_update"
      ON storage.objects FOR UPDATE
      TO anon, authenticated
      USING (bucket_id = 'feedback-media');
  END IF;
END $$;

-- 5. Allow deleting files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'feedback_media_delete' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "feedback_media_delete"
      ON storage.objects FOR DELETE
      TO anon, authenticated
      USING (bucket_id = 'feedback-media');
  END IF;
END $$;
