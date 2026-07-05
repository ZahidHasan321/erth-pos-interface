-- ════════════════════════════════════════════════════════════════════════════
-- 0049 — Admin dashboard: family grouping + order-link visibility
-- ════════════════════════════════════════════════════════════════════════════
-- Three read-only admin RPCs get "see related rows together" treatment:
--
--   1. admin_customers_page   — cluster family members adjacently (root Primary
--      first, then its Secondaries), expose family_key + true family_size.
--   2. admin_customer_detail  — return the WHOLE family roster (root Primary +
--      every Secondary) for ANY member opened, not just one hop; cluster the
--      order history by link group + expose per-order link_size.
--   3. admin_orders_page      — cluster §2.13 order-link siblings adjacently
--      (primary first) while preserving date-desc ordering, expose link_size.
--
-- Group keys (mirror the app):
--   family group  = COALESCE(customers.primary_customer_id, customers.id)
--   order-link    = COALESCE(work_orders.linked_order_id, orders.id)   (§2.13)
--
-- All CREATE OR REPLACE / idempotent. is_admin() gate + grants unchanged.
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- 1. admin_orders_page — cluster order-link siblings + expose link_size.
--    Sort: group_date DESC, group_key DESC, id ASC — keeps the list newest-first
--    by (group primary's) order_date while pulling a link group's members
--    adjacent and primary-first. Cursor = { group_date, group_key, id }.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_orders_page(
  p_cursor     JSONB   DEFAULT NULL,
  p_page_size  INT     DEFAULT 30,
  p_brands     TEXT[]  DEFAULT NULL,
  p_order_type TEXT    DEFAULT NULL,
  p_phase      TEXT    DEFAULT NULL,
  p_search     TEXT    DEFAULT NULL,
  p_from       TIMESTAMPTZ DEFAULT NULL,
  p_to         TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_all_brands BOOLEAN := (p_brands IS NULL OR cardinality(p_brands) = 0);
  v_size INT := LEAST(GREATEST(COALESCE(p_page_size, 30), 1), 100);
  v_search TEXT := LOWER(TRIM(COALESCE(p_search, '')));
  v_cur_gdate TIMESTAMPTZ := CASE WHEN p_cursor ? 'group_date' THEN (p_cursor->>'group_date')::timestamptz END;
  v_cur_gkey  INT := CASE WHEN p_cursor ? 'group_key'  THEN (p_cursor->>'group_key')::int END;
  v_cur_id    INT := CASE WHEN p_cursor ? 'id'         THEN (p_cursor->>'id')::int END;
  v_rows JSONB;
  v_next JSONB;
  v_stats JSONB;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  WITH filtered AS (
    SELECT
      o.id, o.order_date, o.brand::text AS brand, o.order_type::text AS order_type,
      o.checkout_status::text AS checkout_status, o.order_total, o.paid,
      COALESCE(wo.invoice_number, ao.invoice_number) AS invoice_number,
      COALESCE(wo.order_phase::text, ao.order_phase::text) AS order_phase,
      COALESCE(wo.delivery_date, alt.delivery_date) AS delivery_date,
      COALESCE(wo.home_delivery, alt.home_delivery, FALSE) AS home_delivery,
      c.id AS c_id, c.name AS c_name, c.phone AS c_phone, c.country_code AS c_country_code,
      agg.garments_count, agg.brova_count, agg.final_count, agg.alteration_count,
      assigned_order_status_label(
        agg.all_at_shop, agg.has_workshop_garment, agg.all_workshop_ready,
        agg.has_transit_to_shop, agg.only_parked_at_workshop, agg.brovas_in_transit_to_shop,
        agg.finals_active_workshop, agg.brovas_all_at_shop_or_absent, agg.has_any_brova,
        agg.any_brova_accepted, agg.finals_parked, agg.brovas_at_workshop, agg.has_alteration
      ) AS status_label,
      -- §2.13 order-link grouping (WORK-only; work_orders rows carry the link).
      COALESCE(wo.linked_order_id, o.id) AS group_key,
      (wo.linked_order_id IS NOT NULL)   AS is_link_child,
      COALESCE(
        (SELECT po.order_date FROM orders po WHERE po.id = wo.linked_order_id),
        o.order_date
      ) AS group_date,
      (SELECT COUNT(*) FROM work_orders w2
         WHERE COALESCE(w2.linked_order_id, w2.order_id) = COALESCE(wo.linked_order_id, o.id)
      ) AS link_size
    FROM orders o
    LEFT JOIN work_orders wo ON wo.order_id = o.id
    LEFT JOIN alteration_orders ao ON ao.order_id = o.id
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN assigned_order_agg agg ON agg.order_id = o.id
    LEFT JOIN LATERAL (
      SELECT MIN(g.delivery_date) AS delivery_date,
             bool_or(COALESCE(g.home_delivery, FALSE)) AS home_delivery
      FROM garments g WHERE g.order_id = o.id
    ) alt ON o.order_type = 'ALTERATION'
    WHERE o.checkout_status <> 'draft'
      AND (v_all_brands OR o.brand::text = ANY(p_brands))
      AND (p_order_type IS NULL OR o.order_type::text = p_order_type)
      AND (p_phase IS NULL OR COALESCE(wo.order_phase::text, ao.order_phase::text) = p_phase)
      AND (p_from IS NULL OR o.order_date >= p_from)
      AND (p_to IS NULL OR o.order_date < p_to)
      AND (
        v_search = '' OR
        o.id::text = v_search OR
        COALESCE(wo.invoice_number, ao.invoice_number)::text = v_search OR
        LOWER(COALESCE(c.name, '')) LIKE '%' || v_search || '%' OR
        COALESCE(c.phone, '') LIKE '%' || v_search || '%'
      )
  ),
  page AS (
    SELECT * FROM filtered
    WHERE p_cursor IS NULL
       OR group_date < v_cur_gdate
       OR (group_date = v_cur_gdate AND group_key < v_cur_gkey)
       OR (group_date = v_cur_gdate AND group_key = v_cur_gkey AND id > v_cur_id)
    ORDER BY group_date DESC, group_key DESC, id ASC
    LIMIT v_size + 1
  ),
  numbered AS (
    SELECT p.*, row_number() OVER (ORDER BY group_date DESC, group_key DESC, id ASC) AS rn FROM page p
  )
  SELECT
    COALESCE(jsonb_agg(row_to_json(numbered) ORDER BY rn) FILTER (WHERE rn <= v_size), '[]'::jsonb),
    (SELECT to_jsonb(x) FROM (
       SELECT group_date, group_key, id FROM page
       ORDER BY group_date DESC, group_key DESC, id ASC OFFSET v_size LIMIT 1
     ) x),
    -- stats only on the first page (full-scan cost paid once, not per page).
    CASE WHEN p_cursor IS NULL THEN (
      SELECT jsonb_build_object(
        'total_orders', COUNT(*),
        'total_value',  COALESCE(SUM(order_total::numeric), 0),
        'total_outstanding', COALESCE(SUM(GREATEST(order_total::numeric - COALESCE(paid::numeric, 0), 0)), 0)
      ) FROM filtered
    ) ELSE NULL END
  INTO v_rows, v_next, v_stats
  FROM numbered;

  RETURN jsonb_build_object(
    'data', v_rows,
    'next_cursor', v_next,
    'stats', v_stats
  );
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. admin_customers_page — cluster family members adjacently.
--    Sort: family_key DESC, id ASC — root Primary (id = family_key) first, then
--    its Secondaries (higher ids) directly beneath. For a lone account
--    (family_key = id) this reduces to the previous id-DESC ordering.
--    Cursor = { family_key, id }.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_customers_page(
  p_cursor       JSONB DEFAULT NULL,
  p_page_size    INT   DEFAULT 30,
  p_account_type TEXT  DEFAULT NULL,
  p_search       TEXT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_size INT := LEAST(GREATEST(COALESCE(p_page_size, 30), 1), 100);
  v_search TEXT := LOWER(TRIM(COALESCE(p_search, '')));
  v_cur_fkey INT := CASE WHEN p_cursor ? 'family_key' THEN (p_cursor->>'family_key')::int END;
  v_cur_id   INT := CASE WHEN p_cursor ? 'id'         THEN (p_cursor->>'id')::int END;
  v_rows JSONB;
  v_next JSONB;
  v_stats JSONB;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  WITH filtered AS (
    SELECT
      c.id, c.name, c.arabic_name, c.phone, c.country_code, c.nick_name,
      c.account_type::text AS account_type, c.relation, c.primary_customer_id,
      c.customer_segment, c.city, c.area, c.created_at,
      p.name AS primary_name,
      COALESCE(c.primary_customer_id, c.id) AS family_key,
      -- True family size, independent of the current filter/search window.
      (SELECT COUNT(*) FROM customers f
         WHERE COALESCE(f.primary_customer_id, f.id) = COALESCE(c.primary_customer_id, c.id)
      ) AS family_size,
      (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.checkout_status = 'confirmed') AS orders_count,
      (SELECT COALESCE(SUM(o.order_total::numeric), 0) FROM orders o
         WHERE o.customer_id = c.id AND o.checkout_status = 'confirmed') AS total_spend
    FROM customers c
    LEFT JOIN customers p ON p.id = c.primary_customer_id
    WHERE (p_account_type IS NULL OR c.account_type::text = p_account_type)
      AND (
        v_search = '' OR
        LOWER(COALESCE(c.name, '')) LIKE '%' || v_search || '%' OR
        LOWER(COALESCE(c.arabic_name, '')) LIKE '%' || v_search || '%' OR
        COALESCE(c.phone, '') LIKE '%' || v_search || '%'
      )
  ),
  page AS (
    SELECT * FROM filtered
    WHERE p_cursor IS NULL
       OR family_key < v_cur_fkey
       OR (family_key = v_cur_fkey AND id > v_cur_id)
    ORDER BY family_key DESC, id ASC
    LIMIT v_size + 1
  ),
  numbered AS (
    SELECT p.*, row_number() OVER (ORDER BY family_key DESC, id ASC) AS rn FROM page p
  )
  SELECT
    COALESCE(jsonb_agg(row_to_json(numbered) ORDER BY rn) FILTER (WHERE rn <= v_size), '[]'::jsonb),
    (SELECT to_jsonb(x) FROM (
       SELECT family_key, id FROM page ORDER BY family_key DESC, id ASC OFFSET v_size LIMIT 1
     ) x),
    CASE WHEN p_cursor IS NULL THEN (
      SELECT jsonb_build_object(
        'total_customers', COUNT(*),
        'primary_count',   COUNT(*) FILTER (WHERE account_type = 'Primary'),
        'secondary_count', COUNT(*) FILTER (WHERE account_type = 'Secondary')
      ) FROM filtered
    ) ELSE NULL END
  INTO v_rows, v_next, v_stats
  FROM numbered;

  RETURN jsonb_build_object('data', v_rows, 'next_cursor', v_next, 'stats', v_stats);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. admin_customer_detail — full family roster + link-clustered order history.
--    `family` = the whole family group (root Primary + every Secondary), ordered
--    Primary-first then by name, each flagged is_self. Works from ANY member.
--    Order history clusters §2.13 link siblings and exposes per-order link_size.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_customer_detail(p_customer_id INT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_result JSONB;
  v_family_key INT;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  -- Family root: the Primary's own id, whether we opened the Primary or a child.
  SELECT COALESCE(c.primary_customer_id, c.id) INTO v_family_key
  FROM customers c WHERE c.id = p_customer_id;

  IF v_family_key IS NULL THEN
    RETURN NULL; -- customer does not exist
  END IF;

  -- Non-draft orders for this customer (same visibility rule as admin_orders_page).
  WITH cust_orders AS (
    SELECT
      o.id, o.order_date, o.brand::text AS brand, o.order_type::text AS order_type,
      o.checkout_status::text AS checkout_status, o.order_total, o.paid,
      COALESCE(wo.invoice_number, ao.invoice_number) AS invoice_number,
      COALESCE(wo.order_phase::text, ao.order_phase::text) AS order_phase,
      COALESCE(wo.delivery_date, alt.delivery_date) AS delivery_date,
      COALESCE(wo.home_delivery, alt.home_delivery, FALSE) AS home_delivery,
      agg.garments_count, agg.brova_count, agg.final_count, agg.alteration_count,
      assigned_order_status_label(
        agg.all_at_shop, agg.has_workshop_garment, agg.all_workshop_ready,
        agg.has_transit_to_shop, agg.only_parked_at_workshop, agg.brovas_in_transit_to_shop,
        agg.finals_active_workshop, agg.brovas_all_at_shop_or_absent, agg.has_any_brova,
        agg.any_brova_accepted, agg.finals_parked, agg.brovas_at_workshop, agg.has_alteration
      ) AS status_label,
      COALESCE(wo.linked_order_id, o.id) AS group_key,
      (wo.linked_order_id IS NOT NULL)   AS is_link_child,
      COALESCE(
        (SELECT po.order_date FROM orders po WHERE po.id = wo.linked_order_id),
        o.order_date
      ) AS group_date,
      (SELECT COUNT(*) FROM work_orders w2
         WHERE COALESCE(w2.linked_order_id, w2.order_id) = COALESCE(wo.linked_order_id, o.id)
      ) AS link_size
    FROM orders o
    LEFT JOIN work_orders wo ON wo.order_id = o.id
    LEFT JOIN alteration_orders ao ON ao.order_id = o.id
    LEFT JOIN assigned_order_agg agg ON agg.order_id = o.id
    LEFT JOIN LATERAL (
      SELECT MIN(g.delivery_date) AS delivery_date,
             bool_or(COALESCE(g.home_delivery, FALSE)) AS home_delivery
      FROM garments g WHERE g.order_id = o.id
    ) alt ON o.order_type = 'ALTERATION'
    WHERE o.customer_id = p_customer_id
      AND o.checkout_status <> 'draft'
  ),
  confirmed AS (
    SELECT * FROM cust_orders WHERE checkout_status = 'confirmed'
  )
  SELECT jsonb_build_object(
    'customer', jsonb_build_object(
      'id', c.id, 'name', c.name, 'arabic_name', c.arabic_name,
      'phone', c.phone, 'country_code', c.country_code, 'nick_name', c.nick_name,
      'account_type', c.account_type::text, 'relation', c.relation,
      'primary_customer_id', c.primary_customer_id,
      'customer_segment', c.customer_segment, 'nationality', c.nationality,
      'city', c.city, 'area', c.area, 'email', c.email, 'notes', c.notes,
      'created_at', c.created_at
    ),
    -- The whole family group: root Primary + every Secondary, from any member.
    'family', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'relation', f.relation,
        'account_type', f.account_type::text,
        'is_self', (f.id = p_customer_id)
      ) ORDER BY (f.account_type::text = 'Primary') DESC, f.name)
      FROM customers f
      WHERE COALESCE(f.primary_customer_id, f.id) = v_family_key
    ), '[]'::jsonb),
    'stats', jsonb_build_object(
      'orders_count', (SELECT COUNT(*) FROM confirmed),
      'total_spend', (SELECT COALESCE(SUM(order_total::numeric), 0) FROM confirmed),
      'outstanding_total', (SELECT COALESCE(SUM(GREATEST(order_total::numeric - COALESCE(paid::numeric, 0), 0)), 0) FROM confirmed),
      'last_order_at', (SELECT MAX(order_date) FROM cust_orders)
    ),
    'orders', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', co.id, 'order_date', co.order_date, 'brand', co.brand,
        'order_type', co.order_type, 'checkout_status', co.checkout_status,
        'order_total', co.order_total, 'paid', co.paid,
        'invoice_number', co.invoice_number, 'order_phase', co.order_phase,
        'delivery_date', co.delivery_date, 'home_delivery', co.home_delivery,
        'garments_count', co.garments_count, 'brova_count', co.brova_count,
        'final_count', co.final_count, 'alteration_count', co.alteration_count,
        'status_label', co.status_label,
        'group_key', co.group_key, 'is_link_child', co.is_link_child,
        'link_size', co.link_size
      ) ORDER BY co.group_date DESC, co.group_key DESC, co.id ASC)
      FROM cust_orders co
    ), '[]'::jsonb)
  ) INTO v_result
  FROM customers c
  WHERE c.id = p_customer_id;

  RETURN v_result;
END;
$$;

-- ── Grants (the in-function is_admin() gate is the real check) ───────────────
GRANT EXECUTE ON FUNCTION admin_orders_page(JSONB, INT, TEXT[], TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_customers_page(JSONB, INT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_customer_detail(INT) TO authenticated;
