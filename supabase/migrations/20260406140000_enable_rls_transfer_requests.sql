-- Enable RLS on transfer_requests and transfer_request_items.
--
-- These two tables were previously left without RLS, which meant that while
-- REST (PostgREST) could read/write them via the base `authenticated` GRANT,
-- Supabase Realtime's `postgres_changes` channel refused to deliver INSERT /
-- UPDATE / DELETE events for them. Realtime requires RLS to be enabled with an
-- appropriate SELECT policy for a table before it will broadcast its events
-- to non-service-role clients — that is the default security posture.
--
-- Symptom: creating / dispatching a transfer on one device would not show up
-- on the other side until a manual page reload, even though the channel
-- reported SUBSCRIBED. The other tables (garments, orders, notifications,
-- etc.) all worked because they already had RLS + SELECT policies.
--
-- Fix: enable RLS and install permissive policies that match the current
-- open access. Any authenticated user can read/write transfer requests. Once
-- we want stricter rules (e.g. only the originating department can edit a
-- request until approved), we can tighten these policies independently of
-- the realtime delivery concern.

ALTER TABLE transfer_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transfer_requests_select" ON transfer_requests;
CREATE POLICY "transfer_requests_select" ON transfer_requests
    FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "transfer_requests_insert" ON transfer_requests;
CREATE POLICY "transfer_requests_insert" ON transfer_requests
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "transfer_requests_update" ON transfer_requests;
CREATE POLICY "transfer_requests_update" ON transfer_requests
    FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "transfer_requests_delete" ON transfer_requests;
CREATE POLICY "transfer_requests_delete" ON transfer_requests
    FOR DELETE USING (auth.uid() IS NOT NULL);

ALTER TABLE transfer_request_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transfer_request_items_select" ON transfer_request_items;
CREATE POLICY "transfer_request_items_select" ON transfer_request_items
    FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "transfer_request_items_insert" ON transfer_request_items;
CREATE POLICY "transfer_request_items_insert" ON transfer_request_items
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "transfer_request_items_update" ON transfer_request_items;
CREATE POLICY "transfer_request_items_update" ON transfer_request_items
    FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "transfer_request_items_delete" ON transfer_request_items;
CREATE POLICY "transfer_request_items_delete" ON transfer_request_items
    FOR DELETE USING (auth.uid() IS NOT NULL);
