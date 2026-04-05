-- Add per-user scoping to notifications.
-- Most notifications remain department-wide broadcasts (dispatch, transfers, etc.),
-- but some events need to target a single user (terminal assignment, KPI alerts, etc.).
-- This migration adds the infrastructure without changing any existing behavior.

-- 1. Scope enum
CREATE TYPE notification_scope AS ENUM ('department', 'user');

-- 2. Add columns to notifications
ALTER TABLE notifications
    ADD COLUMN scope notification_scope NOT NULL DEFAULT 'department',
    ADD COLUMN recipient_user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- 3. Integrity: user-scoped rows MUST name a recipient; department rows MUST NOT.
ALTER TABLE notifications
    ADD CONSTRAINT notifications_scope_recipient_check
    CHECK (
        (scope = 'department' AND recipient_user_id IS NULL)
        OR (scope = 'user' AND recipient_user_id IS NOT NULL)
    );

-- 4. Index for per-user lookup
CREATE INDEX notifications_recipient_created_idx
    ON notifications (recipient_user_id, created_at DESC)
    WHERE recipient_user_id IS NOT NULL;

-- 5. RLS: extend SELECT policy to also allow rows addressed to the current user
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

-- 6. Update RPCs to union user-scoped rows with department rows.

DROP FUNCTION IF EXISTS get_my_notifications(INTEGER, TEXT, INTEGER);
CREATE OR REPLACE FUNCTION get_my_notifications(
    p_limit INTEGER DEFAULT 50,
    p_department TEXT DEFAULT NULL,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSONB AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  FROM (
    SELECT
      n.id,
      n.type,
      n.title,
      n.body,
      n.metadata,
      n.scope,
      n.recipient_user_id,
      n.created_at,
      n.expires_at,
      (nr.read_at IS NOT NULL) AS is_read,
      nr.read_at
    FROM notifications n
    LEFT JOIN notification_reads nr
      ON nr.notification_id = n.id
      AND nr.user_id = get_my_user_id()
    WHERE n.expires_at > now()
      AND (
        (n.scope = 'department' AND n.department = COALESCE(p_department, get_my_department())::department)
        OR (n.scope = 'user' AND n.recipient_user_id = get_my_user_id())
      )
    ORDER BY n.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) t;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_unread_notification_count(p_department TEXT DEFAULT NULL)
RETURNS INTEGER AS $$
  SELECT count(*)::integer
  FROM notifications n
  WHERE n.expires_at > now()
    AND (
      (n.scope = 'department' AND n.department = COALESCE(p_department, get_my_department())::department)
      OR (n.scope = 'user' AND n.recipient_user_id = get_my_user_id())
    )
    AND NOT EXISTS (
      SELECT 1 FROM notification_reads nr
      WHERE nr.notification_id = n.id
        AND nr.user_id = get_my_user_id()
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION mark_all_notifications_read(p_department TEXT DEFAULT NULL)
RETURNS void AS $$
BEGIN
  INSERT INTO notification_reads (notification_id, user_id)
  SELECT n.id, get_my_user_id()
  FROM notifications n
  WHERE n.expires_at > now()
    AND (
      (n.scope = 'department' AND n.department = COALESCE(p_department, get_my_department())::department)
      OR (n.scope = 'user' AND n.recipient_user_id = get_my_user_id())
    )
    AND NOT EXISTS (
      SELECT 1 FROM notification_reads nr
      WHERE nr.notification_id = n.id
        AND nr.user_id = get_my_user_id()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
