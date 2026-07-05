-- 0048: customer photo. A single optional avatar/photo per customer, captured
-- from the camera (or uploaded) in the demographics form and compressed
-- client-side before upload. Stored as a public URL into the `media` bucket
-- (path customers/{id}/photo.webp, upsert), so the column just holds the URL.
-- Idempotent.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS photo_url TEXT;
