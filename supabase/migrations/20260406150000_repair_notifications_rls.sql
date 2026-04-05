-- Repair migration: restore RLS, policies, and realtime publication for the
-- notifications / notification_reads tables.
--
-- Background: the original 20260404120000_add_notifications.sql migration was
-- marked applied on remote, but verification against pg_catalog on 2026-04-06
-- showed that on the live DB:
--   - notifications.rowsecurity = false  (RLS disabled)
--   - notification_reads.rowsecurity = false
--   - neither table is in the supabase_realtime publication
--   - a stale "Users can view own department notifications" policy exists on
--     notifications but is inert because RLS is disabled
--
-- Root cause is almost certainly a past db:reset that recreated the tables
-- from the Drizzle schema without re-running the Supabase migration's RLS /
-- publication DDL. Symptom: postgres_changes never delivered notification
-- events — reloading the page pulled new rows via REST (which works because
-- RLS is off → the authenticated GRANT applies), but realtime refused to
-- broadcast because it requires RLS + a SELECT policy.
--
-- This migration repairs state and is idempotent so it is safe to re-run.

-- 1. Enable RLS (no-op if already enabled)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;

-- 2. Drop any prior policy definitions so we can recreate them cleanly with
-- the current scope-aware logic from 20260406120000_notifications_user_scope.
DROP POLICY IF EXISTS "Users can view own department notifications" ON notifications;

CREATE POLICY "Users can view own department notifications"
    ON notifications FOR SELECT
    TO authenticated
    USING (
        expires_at > now()
        AND (
            is_admin()
            OR (scope = 'department' AND department = get_my_department()::department)
            OR (scope = 'user' AND recipient_user_id = get_my_user_id())
        )
    );

DROP POLICY IF EXISTS "Users can view own reads" ON notification_reads;
CREATE POLICY "Users can view own reads"
    ON notification_reads FOR SELECT
    TO authenticated
    USING (user_id = get_my_user_id());

DROP POLICY IF EXISTS "Users can mark as read" ON notification_reads;
CREATE POLICY "Users can mark as read"
    ON notification_reads FOR INSERT
    TO authenticated
    WITH CHECK (user_id = get_my_user_id());

DROP POLICY IF EXISTS "Users can unmark reads" ON notification_reads;
CREATE POLICY "Users can unmark reads"
    ON notification_reads FOR DELETE
    TO authenticated
    USING (user_id = get_my_user_id());

-- 3. Add to realtime publication (idempotent)
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notification_reads;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
