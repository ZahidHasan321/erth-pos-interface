-- Add brand scoping to notifications.
-- NULL brand = shared across all brands (e.g. system-wide announcements).
-- Non-null brand = only shown to users of that brand.

-- 1. Add brand column (nullable — NULL means all brands see it)
ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS brand brand;

-- 2. Index for brand-filtered lookups
CREATE INDEX IF NOT EXISTS notifications_brand_created_idx
    ON notifications (brand, created_at DESC)
    WHERE brand IS NOT NULL;

-- 3. Update get_my_notifications to accept and filter by p_brand
DROP FUNCTION IF EXISTS get_my_notifications(INTEGER, TEXT, INTEGER);
CREATE OR REPLACE FUNCTION get_my_notifications(
    p_limit     INTEGER DEFAULT 50,
    p_department TEXT   DEFAULT NULL,
    p_offset    INTEGER DEFAULT 0,
    p_brand     TEXT    DEFAULT NULL
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
      -- NULL brand = shared (show to all); non-null must match p_brand
      AND (n.brand IS NULL OR p_brand IS NULL OR n.brand = p_brand::brand)
    ORDER BY n.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) t;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 4. Update get_unread_notification_count
CREATE OR REPLACE FUNCTION get_unread_notification_count(
    p_department TEXT DEFAULT NULL,
    p_brand      TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
  SELECT count(*)::integer
  FROM notifications n
  WHERE n.expires_at > now()
    AND (
      (n.scope = 'department' AND n.department = COALESCE(p_department, get_my_department())::department)
      OR (n.scope = 'user' AND n.recipient_user_id = get_my_user_id())
    )
    AND (n.brand IS NULL OR p_brand IS NULL OR n.brand = p_brand::brand)
    AND NOT EXISTS (
      SELECT 1 FROM notification_reads nr
      WHERE nr.notification_id = n.id
        AND nr.user_id = get_my_user_id()
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 5. Update mark_all_notifications_read
CREATE OR REPLACE FUNCTION mark_all_notifications_read(
    p_department TEXT DEFAULT NULL,
    p_brand      TEXT DEFAULT NULL
)
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
    AND (n.brand IS NULL OR p_brand IS NULL OR n.brand = p_brand::brand)
    AND NOT EXISTS (
      SELECT 1 FROM notification_reads nr
      WHERE nr.notification_id = n.id
        AND nr.user_id = get_my_user_id()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
