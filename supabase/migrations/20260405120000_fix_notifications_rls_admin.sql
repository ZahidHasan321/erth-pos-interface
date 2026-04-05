-- Fix: notifications RLS silently dropped all realtime events for admin users
-- whose `department` is NULL (super_admin / admin accounts).
--
-- The previous policy was `department = get_my_department()::department`.
-- When get_my_department() returns NULL, the comparison evaluates to UNKNOWN,
-- no rows match, and Supabase Realtime drops every postgres_changes event
-- for that connection — even though `channel status: SUBSCRIBED`.
--
-- New policy: admins see all non-expired notifications; everyone else
-- sees only their department's notifications (unchanged behavior for non-admins).

DROP POLICY IF EXISTS "Users can view own department notifications" ON notifications;

CREATE POLICY "Users can view own department notifications"
    ON notifications FOR SELECT
    TO authenticated
    USING (
        expires_at > now()
        AND (
            is_admin()
            OR department = get_my_department()::department
        )
    );
