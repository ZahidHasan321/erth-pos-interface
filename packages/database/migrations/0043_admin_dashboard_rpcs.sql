-- ════════════════════════════════════════════════════════════════════════════
-- 0043 — Admin Dashboard read RPCs (apps/admin-dashboard)
-- ════════════════════════════════════════════════════════════════════════════
-- A cross-brand, read-only oversight surface for owners. Everything here is
-- read-time aggregation over indexed columns (the same idiom as get_eod_report /
-- get_qc_analytics / get_showroom_orders_page) — NO rollup tables, no triggers.
--
-- Access: only super_admin gets the blanket FOR-ALL RLS policy (triggers.sql
-- end-of-file), so a plain `admin` cannot read cross-brand through PostgREST.
-- Every RPC below is SECURITY DEFINER (runs as the table owner, bypassing RLS)
-- and re-asserts is_admin() at the top — the same guard pattern as
-- enforce_order_brand_access. This is what lets `admin` (not just super_admin)
-- read all brands without adding per-table policies.
--
-- Idempotent: CREATE OR REPLACE + CREATE INDEX IF NOT EXISTS. Apply with
--   pnpm --filter @repo/database db:apply-admin-dashboard
-- (re-runnable; does not touch existing objects beyond replacing these).
--
-- Reuses: is_admin(), assigned_order_agg (VIEW), assigned_order_status_label(),
-- get_consumption_by_brand().

-- ── Supporting indexes ──────────────────────────────────────────────────────
-- Keyset walk for the Orders explorer: ORDER BY order_date DESC, id DESC.
CREATE INDEX IF NOT EXISTS orders_date_id_desc_idx ON orders (order_date DESC, id DESC);
-- Brand + date filtering on the dashboard aggregates.
CREATE INDEX IF NOT EXISTS orders_brand_date_idx ON orders (brand, order_date);
-- payment_transactions (created_at) already exists as payment_transactions_created_at_idx.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. admin_dashboard_summary — one JSONB blob for the Dashboard page.
--    p_from / p_to are UTC instants (the app derives them from Kuwait-local day
--    ranges, same as the Performance screen's getDateRange helper). p_brands
--    NULL/empty = all brands. Day buckets are Kuwait-local (Asia/Kuwait, no DST).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_dashboard_summary(
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

  WITH
  -- Real orders (drafts excluded) inside the window, brand-filtered.
  win_orders AS (
    SELECT o.*, wo.invoice_number AS wo_invoice, ao.invoice_number AS ao_invoice
    FROM orders o
    LEFT JOIN work_orders wo ON wo.order_id = o.id
    LEFT JOIN alteration_orders ao ON ao.order_id = o.id
    WHERE o.checkout_status <> 'draft'
      AND o.order_date >= p_from AND o.order_date < p_to
      AND (v_all_brands OR o.brand::text = ANY(p_brands))
  ),
  confirmed AS (
    SELECT * FROM win_orders WHERE checkout_status = 'confirmed'
  ),
  -- Money that actually moved in the window (cash basis; non-draft orders).
  tx AS (
    SELECT pt.amount, pt.transaction_type, pt.created_at
    FROM payment_transactions pt
    JOIN orders o ON o.id = pt.order_id
    WHERE o.checkout_status <> 'draft'
      AND pt.created_at >= p_from AND pt.created_at < p_to
      AND (v_all_brands OR o.brand::text = ANY(p_brands))
  ),
  -- QC attempts in the window (flattened from trip_history at read time — same
  -- normalization guards as get_qc_analytics).
  qc AS (
    SELECT
      att->>'result' AS result,
      (att->>'date')::timestamptz AS adate
    FROM garments g
    JOIN orders o ON o.id = g.order_id
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(g.trip_history) = 'array' THEN g.trip_history ELSE '[]'::jsonb END
    ) AS trip
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(trip->'qc_attempts') = 'array' THEN trip->'qc_attempts' ELSE '[]'::jsonb END
    ) AS att
    WHERE att->>'date' IS NOT NULL
      AND (att->>'date')::timestamptz >= p_from
      AND (att->>'date')::timestamptz <  p_to
      AND (v_all_brands OR o.brand::text = ANY(p_brands))
  ),
  -- Per-terminal stage timing (completed sessions) in the window.
  timing AS (
    SELECT
      st.key AS stage,
      EXTRACT(EPOCH FROM ((sess->>'completed_at')::timestamptz - (sess->>'started_at')::timestamptz)) AS secs
    FROM garments g
    JOIN orders o ON o.id = g.order_id
    CROSS JOIN LATERAL jsonb_each(
      CASE WHEN jsonb_typeof(g.stage_timings) = 'object' THEN g.stage_timings ELSE '{}'::jsonb END
    ) AS st(key, sessions)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(st.sessions) = 'array' THEN st.sessions ELSE '[]'::jsonb END
    ) AS sess
    WHERE sess->>'completed_at' IS NOT NULL
      AND sess->>'started_at' IS NOT NULL
      AND (sess->>'completed_at')::timestamptz >= p_from
      AND (sess->>'completed_at')::timestamptz <  p_to
      AND (v_all_brands OR o.brand::text = ANY(p_brands))
  ),
  -- Current-state production funnel (NOT date-scoped — "where is everything now").
  funnel AS (
    SELECT g.piece_stage::text AS stage, COUNT(*) AS cnt
    FROM garments g
    JOIN orders o ON o.id = g.order_id
    WHERE g.piece_stage IS NOT NULL
      AND g.piece_stage::text NOT IN ('completed', 'discarded')
      AND (v_all_brands OR o.brand::text = ANY(p_brands))
    GROUP BY g.piece_stage::text
  ),
  -- Garments in active production right now (in_production flag), brand-scoped.
  in_prod AS (
    SELECT COUNT(*) AS cnt
    FROM garments g
    JOIN orders o ON o.id = g.order_id
    WHERE g.in_production
      AND (v_all_brands OR o.brand::text = ANY(p_brands))
  ),
  -- Turnaround: order_date → completion_time for garments completed in the window.
  turnaround AS (
    SELECT AVG(EXTRACT(EPOCH FROM (g.completion_time - o.order_date)) / 86400.0) AS days
    FROM garments g
    JOIN orders o ON o.id = g.order_id
    WHERE g.completion_time IS NOT NULL
      AND g.completion_time >= p_from AND g.completion_time < p_to
      AND (v_all_brands OR o.brand::text = ANY(p_brands))
  ),
  -- All-time AR outstanding (confirmed, brand-scoped) — a balance, not windowed.
  ar AS (
    SELECT COALESCE(SUM(GREATEST(o.order_total::numeric - COALESCE(o.paid::numeric, 0), 0)), 0) AS outstanding
    FROM orders o
    WHERE o.checkout_status = 'confirmed'
      AND (v_all_brands OR o.brand::text = ANY(p_brands))
  )
  SELECT jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to),
    'brands', COALESCE(to_jsonb(p_brands), 'null'::jsonb),
    'kpis', jsonb_build_object(
      'collected',    COALESCE((SELECT SUM(amount) FILTER (WHERE transaction_type = 'payment') FROM tx), 0),
      'refunded',     COALESCE((SELECT SUM(ABS(amount)) FILTER (WHERE transaction_type = 'refund') FROM tx), 0),
      'net_revenue',
        COALESCE((SELECT SUM(amount) FILTER (WHERE transaction_type = 'payment') FROM tx), 0) -
        COALESCE((SELECT SUM(ABS(amount)) FILTER (WHERE transaction_type = 'refund') FROM tx), 0),
      'orders_count',     (SELECT COUNT(*) FROM confirmed),
      'work_count',       (SELECT COUNT(*) FROM confirmed WHERE order_type = 'WORK'),
      'sales_count',      (SELECT COUNT(*) FROM confirmed WHERE order_type = 'SALES'),
      'alteration_count', (SELECT COUNT(*) FROM confirmed WHERE order_type = 'ALTERATION'),
      'gross_sales',      COALESCE((SELECT SUM(order_total::numeric) FROM confirmed), 0),
      'outstanding_ar',   (SELECT outstanding FROM ar),
      'garments_in_production', (SELECT cnt FROM in_prod),
      'qc_pass_rate', (
        SELECT CASE WHEN COUNT(*) FILTER (WHERE result IN ('pass','fail')) > 0
          THEN ROUND(100.0 * COUNT(*) FILTER (WHERE result = 'pass')
                     / COUNT(*) FILTER (WHERE result IN ('pass','fail')), 1)
          ELSE NULL END
        FROM qc
      ),
      'avg_turnaround_days', (SELECT ROUND(days::numeric, 1) FROM turnaround),
      'cancelled_count',  (SELECT COUNT(*) FROM win_orders WHERE checkout_status = 'cancelled')
    ),
    'revenue_trend', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('day', day, 'collected', collected, 'refunded', refunded) ORDER BY day)
      FROM (
        SELECT (created_at AT TIME ZONE 'Asia/Kuwait')::date AS day,
               SUM(amount) FILTER (WHERE transaction_type = 'payment') AS collected,
               SUM(ABS(amount)) FILTER (WHERE transaction_type = 'refund') AS refunded
        FROM tx GROUP BY 1
      ) t
    ), '[]'::jsonb),
    'orders_by_brand', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('brand', brand, 'count', cnt, 'gross_sales', gross) ORDER BY cnt DESC)
      FROM (
        SELECT brand::text AS brand, COUNT(*) AS cnt, COALESCE(SUM(order_total::numeric), 0) AS gross
        FROM confirmed GROUP BY brand
      ) t
    ), '[]'::jsonb),
    'order_type_split', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('type', order_type, 'count', cnt) ORDER BY cnt DESC)
      FROM (SELECT order_type::text, COUNT(*) AS cnt FROM confirmed GROUP BY order_type) t
    ), '[]'::jsonb),
    'production_funnel', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('stage', stage, 'count', cnt) ORDER BY cnt DESC) FROM funnel
    ), '[]'::jsonb),
    'qc_trend', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('day', day, 'pass', pass, 'fail', fail) ORDER BY day)
      FROM (
        SELECT (adate AT TIME ZONE 'Asia/Kuwait')::date AS day,
               COUNT(*) FILTER (WHERE result = 'pass') AS pass,
               COUNT(*) FILTER (WHERE result = 'fail') AS fail
        FROM qc GROUP BY 1
      ) t
    ), '[]'::jsonb),
    'terminal_timing', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'stage', stage,
               'avg_seconds', avg_seconds,
               'piece_count', piece_count) ORDER BY stage)
      FROM (
        SELECT stage, ROUND(AVG(secs)::numeric, 0) AS avg_seconds, COUNT(*) AS piece_count
        FROM timing GROUP BY stage
      ) t
    ), '[]'::jsonb),
    'fabric_by_brand', get_consumption_by_brand(p_from, p_to, 'fabric', 'shop'),
    'top_customers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'customer_id', customer_id, 'name', name, 'orders', orders, 'spend', spend)
             ORDER BY spend DESC)
      FROM (
        SELECT c.id AS customer_id, c.name,
               COUNT(*) AS orders, COALESCE(SUM(co.order_total::numeric), 0) AS spend
        FROM confirmed co JOIN customers c ON c.id = co.customer_id
        GROUP BY c.id, c.name
        ORDER BY spend DESC
        LIMIT 10
      ) t
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. admin_orders_page — keyset-paginated Orders explorer list.
--    Cursor = { order_date, id } of the last row of the previous page. Sorted
--    order_date DESC, id DESC (deterministic tiebreak). stats computed only on
--    the first page (p_cursor NULL) to keep deep pages O(page_size).
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
  v_cur_date TIMESTAMPTZ := CASE WHEN p_cursor ? 'order_date' THEN (p_cursor->>'order_date')::timestamptz END;
  v_cur_id INT := CASE WHEN p_cursor ? 'id' THEN (p_cursor->>'id')::int END;
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
       OR (order_date, id) < (v_cur_date, v_cur_id)
    ORDER BY order_date DESC, id DESC
    LIMIT v_size + 1
  ),
  numbered AS (
    SELECT p.*, row_number() OVER (ORDER BY order_date DESC, id DESC) AS rn FROM page p
  )
  SELECT
    COALESCE(jsonb_agg(row_to_json(numbered) ORDER BY rn) FILTER (WHERE rn <= v_size), '[]'::jsonb),
    (SELECT to_jsonb(x) FROM (
       SELECT order_date, id FROM page ORDER BY order_date DESC, id DESC OFFSET v_size LIMIT 1
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
-- 3. admin_order_detail — full order by PK.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_order_detail(p_order_id INT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_result JSONB;
  v_group_key INT;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  -- Order-link group key (§2.13): child.linked_order_id → primary, else self.
  SELECT COALESCE(wo.linked_order_id, p_order_id) INTO v_group_key
  FROM orders o LEFT JOIN work_orders wo ON wo.order_id = o.id
  WHERE o.id = p_order_id;

  SELECT jsonb_build_object(
    'order', to_jsonb(o.*),
    'work_order', to_jsonb(wo.*),
    'alteration_order', to_jsonb(ao.*),
    'customer', to_jsonb(c.*),
    'totals', jsonb_build_object(
      'order_total', o.order_total,
      'paid', o.paid,
      'outstanding', GREATEST(o.order_total::numeric - COALESCE(o.paid::numeric, 0), 0),
      'advance', wo.advance,
      'invoice_revision', COALESCE(wo.invoice_revision, 0)
    ),
    'payments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pt.id, 'amount', pt.amount, 'payment_type', pt.payment_type,
        'transaction_type', pt.transaction_type, 'refund_reason', pt.refund_reason,
        'payment_ref_no', pt.payment_ref_no, 'created_at', pt.created_at
      ) ORDER BY pt.created_at)
      FROM payment_transactions pt WHERE pt.order_id = o.id
    ), '[]'::jsonb),
    'linked_group', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'order_id', lo.id, 'invoice_number', lwo.invoice_number,
        'order_total', lo.order_total, 'order_phase', lwo.order_phase,
        'is_primary', (lo.id = v_group_key)
      ) ORDER BY lo.id)
      FROM orders lo
      LEFT JOIN work_orders lwo ON lwo.order_id = lo.id
      WHERE COALESCE(lwo.linked_order_id, lo.id) = v_group_key
        AND lo.id <> o.id
    ), '[]'::jsonb),
    'garments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'garment_id', g.garment_id, 'garment_type', g.garment_type,
        'style', g.style, 'piece_stage', g.piece_stage, 'location', g.location,
        'trip_number', g.trip_number, 'in_production', g.in_production,
        'acceptance_status', g.acceptance_status, 'feedback_status', g.feedback_status,
        'needs_investigation', g.needs_investigation, 'root_cause', g.root_cause,
        'delivery_date', g.delivery_date, 'collected_at', g.collected_at,
        'express', g.express, 'soaking', g.soaking
      ) ORDER BY g.garment_id)
      FROM garments g WHERE g.order_id = o.id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM orders o
  LEFT JOIN work_orders wo ON wo.order_id = o.id
  LEFT JOIN alteration_orders ao ON ao.order_id = o.id
  LEFT JOIN customers c ON c.id = o.customer_id
  WHERE o.id = p_order_id;

  RETURN v_result; -- NULL when the order does not exist
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. admin_garment_detail — the deep one, single-row read + JSONB passthrough.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_garment_detail(p_garment_id UUID)
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

  SELECT jsonb_build_object(
    'garment', to_jsonb(g.*),
    'order', jsonb_build_object(
      'id', o.id, 'brand', o.brand, 'order_type', o.order_type,
      'order_date', o.order_date, 'invoice_number', COALESCE(wo.invoice_number, ao.invoice_number)
    ),
    'customer', jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone),
    'fabric', CASE WHEN f.id IS NOT NULL
      THEN jsonb_build_object('id', f.id, 'name', f.name, 'sku', f.sku) ELSE NULL END,
    'measurement', to_jsonb(m.*),
    'feedback', COALESCE((
      SELECT jsonb_agg(to_jsonb(fb.*) ORDER BY fb.created_at)
      FROM garment_feedback fb WHERE fb.garment_id = g.id
    ), '[]'::jsonb),
    'replaced_by', CASE WHEN rb.id IS NOT NULL THEN jsonb_build_object(
      'id', rb.id, 'garment_id', rb.garment_id, 'piece_stage', rb.piece_stage,
      'location', rb.location, 'trip_number', rb.trip_number) ELSE NULL END,
    'original', CASE WHEN og.id IS NOT NULL THEN jsonb_build_object(
      'id', og.id, 'garment_id', og.garment_id, 'order_id', og.order_id) ELSE NULL END
  ) INTO v_result
  FROM garments g
  JOIN orders o ON o.id = g.order_id
  LEFT JOIN work_orders wo ON wo.order_id = o.id
  LEFT JOIN alteration_orders ao ON ao.order_id = o.id
  LEFT JOIN customers c ON c.id = o.customer_id
  LEFT JOIN fabrics f ON f.id = g.fabric_id
  LEFT JOIN measurements m ON m.id = g.measurement_id
  LEFT JOIN garments rb ON rb.id = g.replaced_by_garment_id
  LEFT JOIN garments og ON og.id = g.original_garment_id
  WHERE g.id = p_garment_id;

  RETURN v_result; -- NULL when the garment does not exist
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. admin_customer_brand_matrix — "which customer bought from which brand".
--    Top-N customers by spend + per-customer brand breakdown, over the window.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_customer_brand_matrix(
  p_from  TIMESTAMPTZ,
  p_to    TIMESTAMPTZ,
  p_limit INT DEFAULT 25
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_result JSONB;
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 200);
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  WITH cb AS (
    SELECT o.customer_id, o.brand::text AS brand,
           COUNT(*) AS orders, COALESCE(SUM(o.order_total::numeric), 0) AS spend
    FROM orders o
    WHERE o.checkout_status = 'confirmed'
      AND o.order_date >= p_from AND o.order_date < p_to
      AND o.brand IS NOT NULL
    GROUP BY o.customer_id, o.brand
  ),
  totals AS (
    SELECT customer_id, SUM(orders) AS total_orders, SUM(spend) AS total_spend,
           COUNT(DISTINCT brand) AS brand_count
    FROM cb GROUP BY customer_id
    ORDER BY total_spend DESC
    LIMIT v_limit
  )
  SELECT jsonb_agg(jsonb_build_object(
    'customer_id', t.customer_id,
    'name', c.name,
    'total_orders', t.total_orders,
    'total_spend', t.total_spend,
    'brand_count', t.brand_count,
    'brands', (
      SELECT jsonb_object_agg(cb.brand, jsonb_build_object('orders', cb.orders, 'spend', cb.spend))
      FROM cb WHERE cb.customer_id = t.customer_id
    )
  ) ORDER BY t.total_spend DESC)
  INTO v_result
  FROM totals t JOIN customers c ON c.id = t.customer_id;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- Callable by the authenticated PostgREST role (the in-function is_admin() gate
-- is the real check; SECURITY DEFINER runs the body as owner regardless).
GRANT EXECUTE ON FUNCTION admin_dashboard_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_orders_page(JSONB, INT, TEXT[], TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_order_detail(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_garment_detail(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_customer_brand_matrix(TIMESTAMPTZ, TIMESTAMPTZ, INT) TO authenticated;
