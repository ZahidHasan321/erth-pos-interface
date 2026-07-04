-- ════════════════════════════════════════════════════════════════════════════
-- 0047 — Admin People & Performance read RPCs (apps/admin-dashboard)
-- ════════════════════════════════════════════════════════════════════════════
-- The People / Performance area of the admin oversight surface. Same idiom as
-- 0043–0045: read-time aggregation over indexed columns, every function
-- SECURITY DEFINER + is_admin()-gated, cross-brand (p_brands NULL/[] = all
-- brands). NO rollup tables, no triggers. Idempotent CREATE OR REPLACE.
--
-- Detail RPCs return a jsonb_build_object(...) or NULL when the row is missing
-- (clean 404). Later phases (Performance / QC analytics) append here.
--
-- Reuses: is_admin(), assigned_order_agg (VIEW), assigned_order_status_label().
-- Index note: orders(customer_id) already exists as orders_customer_idx, so no
-- supporting index is added here.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. admin_customer_detail — one customer: profile, Primary/Secondary linking,
--    spend/outstanding stats, and full order history (same per-order projection
--    as admin_orders_page, so the customer's list matches the /orders page).
--    Returns NULL when the id doesn't exist (clean 404).
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
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden: admin role required';
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
      ) AS status_label
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
  -- Confirmed-only slice drives spend/outstanding (mirrors admin_customers_page).
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
    'primary', (
      SELECT jsonb_build_object('id', p.id, 'name', p.name)
      FROM customers p WHERE p.id = c.primary_customer_id
    ),
    'secondaries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'relation', s.relation)
        ORDER BY s.name)
      FROM customers s WHERE s.primary_customer_id = c.id
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
        'status_label', co.status_label
      ) ORDER BY co.order_date DESC, co.id DESC)
      FROM cust_orders co
    ), '[]'::jsonb)
  ) INTO v_result
  FROM customers c
  WHERE c.id = p_customer_id;

  RETURN v_result; -- NULL when the customer does not exist
END;
$$;

-- ── Grants (the in-function is_admin() gate is the real check) ───────────────
GRANT EXECUTE ON FUNCTION admin_customer_detail(INT) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- Phase 2 — Team › Staff performance (shop-staff attribution)
-- ════════════════════════════════════════════════════════════════════════════
-- Who did the work, per shop user: orders taken, order/brand mix, measurements
-- taken, and cashier collections — all read-time aggregation over the three
-- attribution columns (indexed below). Every function SECURITY DEFINER +
-- is_admin()-gated, same idiom as 0043–0045.
--
-- Attribution columns (schema.ts):
--   orders.order_taker_id       — who took/confirmed the order
--   measurements.measurer_id    — who measured (+ measurements.measurement_date)
--   payment_transactions.cashier_id — who took the money (+ created_at)
--
-- Money convention (0045): payment_transactions.amount stores refunds NEGATIVE,
-- so SUM(amount) IS the net collection (payments − refunds) with no ABS() split.
--
-- "Confirmed" order counting matches admin_customers_page / admin_customer_detail
-- spend logic exactly: checkout_status = 'confirmed'. (The recent-orders LIST in
-- the detail RPC uses the broader <> 'draft' visibility of admin_orders_page, so
-- a cancelled order the user took is still visible — mirrors admin_customer_detail.)
--
-- Brand filter (p_brands): applied to the ATTRIBUTED WORK by its brand, i.e. the
-- order's brand (orders.brand) and the transaction's order brand — NOT the user's
-- brands[] membership. Measurements carry no brand of their own (customer-scoped,
-- shared across garments), so under an active brand filter a measurement counts
-- only when it is linked to a garment whose order brand is in p_brands; with no
-- brand filter every measurement the user took in range is counted.
--
-- Supporting indexes — none pre-exist on these FK columns (checked schema.ts +
-- migrations), so all three are added.
CREATE INDEX IF NOT EXISTS orders_order_taker_idx
  ON orders (order_taker_id);
CREATE INDEX IF NOT EXISTS measurements_measurer_idx
  ON measurements (measurer_id);
CREATE INDEX IF NOT EXISTS payment_transactions_cashier_idx
  ON payment_transactions (cashier_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. admin_staff_performance — one row per user (the SAME population as
--    admin_staff_roster: every user, zero-activity users kept with zeros via
--    LEFT JOIN LATERAL), each with their in-range attribution aggregates.
--    Sorted orders_taken DESC, then name. Cross-brand unless p_brands narrows it.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_staff_performance(
  p_from   TIMESTAMPTZ,
  p_to     TIMESTAMPTZ,
  p_brands TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_all_brands BOOLEAN := (p_brands IS NULL OR cardinality(p_brands) = 0);
  v_result JSONB;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  WITH perf AS (
    SELECT
      u.id, u.name, u.username, u.role::text AS role, u.department::text AS department,
      to_jsonb(u.brands) AS brands, u.is_active,
      COALESCE(oa.orders_taken, 0)   AS orders_taken,
      COALESCE(oa.orders_value, 0)   AS orders_value,
      jsonb_build_object(
        'WORK',       COALESCE(oa.work_ct, 0),
        'SALES',      COALESCE(oa.sales_ct, 0),
        'ALTERATION', COALESCE(oa.alt_ct, 0)
      ) AS order_mix,
      COALESCE(bm.brand_mix, '[]'::jsonb) AS brand_mix,
      COALESCE(ms.measurements_taken, 0)  AS measurements_taken,
      COALESCE(ca.collections_amount, 0)  AS collections_amount,
      COALESCE(ca.collections_count, 0)   AS collections_count
    FROM users u
    -- Order-taking aggregate (confirmed orders in range, brand-filtered).
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)                                                   AS orders_taken,
        COALESCE(SUM(o.order_total::numeric), 0)                   AS orders_value,
        COUNT(*) FILTER (WHERE o.order_type::text = 'WORK')        AS work_ct,
        COUNT(*) FILTER (WHERE o.order_type::text = 'SALES')       AS sales_ct,
        COUNT(*) FILTER (WHERE o.order_type::text = 'ALTERATION')  AS alt_ct
      FROM orders o
      WHERE o.order_taker_id = u.id
        AND o.checkout_status = 'confirmed'
        AND o.order_date >= p_from AND o.order_date < p_to
        AND (v_all_brands OR o.brand::text = ANY(p_brands))
    ) oa ON true
    -- Brand mix ([{brand, count}]) over the same confirmed-orders slice.
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('brand', brand, 'count', ct) ORDER BY ct DESC) AS brand_mix
      FROM (
        SELECT o.brand::text AS brand, COUNT(*) AS ct
        FROM orders o
        WHERE o.order_taker_id = u.id
          AND o.checkout_status = 'confirmed'
          AND o.order_date >= p_from AND o.order_date < p_to
          AND (v_all_brands OR o.brand::text = ANY(p_brands))
        GROUP BY o.brand
      ) g
    ) bm ON true
    -- Measurements taken in range (brand-scoped via garment→order only when filtered).
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS measurements_taken
      FROM measurements m
      WHERE m.measurer_id = u.id
        AND m.measurement_date >= p_from AND m.measurement_date < p_to
        AND (v_all_brands OR EXISTS (
          SELECT 1 FROM garments gg JOIN orders og ON og.id = gg.order_id
          WHERE gg.measurement_id = m.id AND og.brand::text = ANY(p_brands)
        ))
    ) ms ON true
    -- Cashier collections (net; refunds already negative), brand-filtered by order.
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(pt.amount), 0) AS collections_amount,
        COUNT(*)                    AS collections_count
      FROM payment_transactions pt
      JOIN orders o2 ON o2.id = pt.order_id
      WHERE pt.cashier_id = u.id
        AND pt.created_at >= p_from AND pt.created_at < p_to
        AND o2.checkout_status <> 'draft'
        AND (v_all_brands OR o2.brand::text = ANY(p_brands))
    ) ca ON true
  )
  SELECT jsonb_build_object(
    'data', COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'username', username, 'role', role,
      'department', department, 'brands', brands, 'is_active', is_active,
      'orders_taken', orders_taken, 'orders_value', orders_value,
      'order_mix', order_mix, 'brand_mix', brand_mix,
      'measurements_taken', measurements_taken,
      'collections_amount', collections_amount, 'collections_count', collections_count
    ) ORDER BY orders_taken DESC, name), '[]'::jsonb),
    'stats', jsonb_build_object(
      'staff_count',        COUNT(*),
      'total_orders',       COALESCE(SUM(orders_taken), 0),
      'total_value',        COALESCE(SUM(orders_value), 0),
      'total_measurements', COALESCE(SUM(measurements_taken), 0),
      'total_collections',  COALESCE(SUM(collections_amount), 0)
    )
  ) INTO v_result
  FROM perf;

  RETURN v_result;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. admin_staff_detail — one user's drilldown: profile, in-range totals (same
--    aggregate shape as one performance row), a Kuwait-day daily breakdown, and
--    the recent orders they took (admin_orders_page per-order projection).
--    Cross-brand (no p_brands arg). Returns NULL when the user is missing.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_staff_detail(
  p_user_id UUID,
  p_from    TIMESTAMPTZ,
  p_to      TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
    RETURN NULL; -- clean 404
  END IF;

  SELECT jsonb_build_object(
    'user', (
      SELECT jsonb_build_object(
        'id', u.id, 'name', u.name, 'username', u.username,
        'role', u.role::text, 'department', u.department::text,
        'brands', to_jsonb(u.brands), 'is_active', u.is_active,
        'employee_id', u.employee_id, 'phone', u.phone, 'email', u.email,
        'hire_date', u.hire_date
      )
      FROM users u WHERE u.id = p_user_id
    ),
    'totals', jsonb_build_object(
      'orders_taken', (
        SELECT COUNT(*) FROM orders o
        WHERE o.order_taker_id = p_user_id AND o.checkout_status = 'confirmed'
          AND o.order_date >= p_from AND o.order_date < p_to
      ),
      'orders_value', (
        SELECT COALESCE(SUM(o.order_total::numeric), 0) FROM orders o
        WHERE o.order_taker_id = p_user_id AND o.checkout_status = 'confirmed'
          AND o.order_date >= p_from AND o.order_date < p_to
      ),
      'order_mix', (
        SELECT jsonb_build_object(
          'WORK',       COUNT(*) FILTER (WHERE o.order_type::text = 'WORK'),
          'SALES',      COUNT(*) FILTER (WHERE o.order_type::text = 'SALES'),
          'ALTERATION', COUNT(*) FILTER (WHERE o.order_type::text = 'ALTERATION')
        )
        FROM orders o
        WHERE o.order_taker_id = p_user_id AND o.checkout_status = 'confirmed'
          AND o.order_date >= p_from AND o.order_date < p_to
      ),
      'measurements_taken', (
        SELECT COUNT(*) FROM measurements m
        WHERE m.measurer_id = p_user_id
          AND m.measurement_date >= p_from AND m.measurement_date < p_to
      ),
      'collections_amount', (
        SELECT COALESCE(SUM(pt.amount), 0)
        FROM payment_transactions pt JOIN orders o2 ON o2.id = pt.order_id
        WHERE pt.cashier_id = p_user_id AND o2.checkout_status <> 'draft'
          AND pt.created_at >= p_from AND pt.created_at < p_to
      ),
      'collections_count', (
        SELECT COUNT(*)
        FROM payment_transactions pt JOIN orders o2 ON o2.id = pt.order_id
        WHERE pt.cashier_id = p_user_id AND o2.checkout_status <> 'draft'
          AND pt.created_at >= p_from AND pt.created_at < p_to
      )
    ),
    -- Daily breakdown, one row per Kuwait calendar day with any activity.
    'daily', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'day', day, 'orders_taken', orders_taken, 'orders_value', orders_value,
        'measurements_taken', measurements_taken, 'collections_amount', collections_amount
      ) ORDER BY day)
      FROM (
        SELECT day,
          SUM(orders_taken) AS orders_taken, SUM(orders_value) AS orders_value,
          SUM(measurements_taken) AS measurements_taken, SUM(collections_amount) AS collections_amount
        FROM (
          SELECT (o.order_date AT TIME ZONE 'Asia/Kuwait')::date AS day,
                 COUNT(*) AS orders_taken, SUM(o.order_total::numeric) AS orders_value,
                 0 AS measurements_taken, 0::numeric AS collections_amount
          FROM orders o
          WHERE o.order_taker_id = p_user_id AND o.checkout_status = 'confirmed'
            AND o.order_date >= p_from AND o.order_date < p_to
          GROUP BY 1
          UNION ALL
          SELECT (m.measurement_date AT TIME ZONE 'Asia/Kuwait')::date,
                 0, 0::numeric, COUNT(*), 0::numeric
          FROM measurements m
          WHERE m.measurer_id = p_user_id
            AND m.measurement_date >= p_from AND m.measurement_date < p_to
          GROUP BY 1
          UNION ALL
          SELECT (pt.created_at AT TIME ZONE 'Asia/Kuwait')::date,
                 0, 0::numeric, 0, SUM(pt.amount)
          FROM payment_transactions pt JOIN orders o2 ON o2.id = pt.order_id
          WHERE pt.cashier_id = p_user_id AND o2.checkout_status <> 'draft'
            AND pt.created_at >= p_from AND pt.created_at < p_to
          GROUP BY 1
        ) parts
        GROUP BY day
      ) d
    ), '[]'::jsonb),
    -- Recent orders taken (admin_orders_page projection; non-draft, newest first).
    'recent_orders', COALESCE((
      SELECT jsonb_agg(row_to_json(r) ORDER BY r.order_date DESC, r.id DESC)
      FROM (
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
          ) AS status_label
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
        WHERE o.order_taker_id = p_user_id
          AND o.checkout_status <> 'draft'
          AND o.order_date >= p_from AND o.order_date < p_to
        ORDER BY o.order_date DESC, o.id DESC
        LIMIT 50
      ) r
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION admin_staff_performance(TIMESTAMPTZ, TIMESTAMPTZ, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_staff_detail(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
