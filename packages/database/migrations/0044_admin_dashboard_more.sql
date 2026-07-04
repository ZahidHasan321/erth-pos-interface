-- ════════════════════════════════════════════════════════════════════════════
-- 0044 — Admin Dashboard read RPCs, part 2 (apps/admin-dashboard)
-- ════════════════════════════════════════════════════════════════════════════
-- Fills the gaps 0043 left open: a direct garment browser (no more drilling two
-- levels through an order), an inventory surface (fabric + shelf + accessories
-- stock-on-hand, movements, waste), and a people surface (staff roster, workshop
-- workers, customer directory). Same idiom as 0043: read-time aggregation, every
-- function SECURITY DEFINER + is_admin()-gated, cross-brand (p_brands NULL/[] =
-- all brands). Idempotent CREATE OR REPLACE.
--
-- Apply with:  pnpm --filter @repo/database db:apply-admin-dashboard
-- (the apply script runs 0043 then 0044, both re-runnable).
--
-- Inventory note (SPEC §4): fabric + shelf live only in shop stock; accessories
-- are the only cross-side stock. Stock is a single shared pool (ERTH holds it;
-- home brands draw from it), so the inventory RPCs are NOT brand-filtered — one
-- shared view, not three.

-- ── Supporting index ────────────────────────────────────────────────────────
-- Keyset walk for the Garments browser joins garments→orders and sorts by the
-- order date; garments already carry order_id + several stage indexes.
CREATE INDEX IF NOT EXISTS garments_order_id_idx ON garments (order_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 1. admin_garments_page — keyset-paginated Garments browser.
--    Sorted order_date DESC, garment.id DESC (deterministic). Cursor =
--    { order_date, id } of the last row. Same first-page-only stats trick as
--    admin_orders_page. Filters: brand, garment_type, piece_stage, location,
--    free-text (garment_id, order id, invoice #, customer name/phone), date.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_garments_page(
  p_cursor       JSONB   DEFAULT NULL,
  p_page_size    INT     DEFAULT 30,
  p_brands       TEXT[]  DEFAULT NULL,
  p_garment_type TEXT    DEFAULT NULL,
  p_piece_stage  TEXT    DEFAULT NULL,
  p_location     TEXT    DEFAULT NULL,
  p_search       TEXT    DEFAULT NULL,
  p_from         TIMESTAMPTZ DEFAULT NULL,
  p_to           TIMESTAMPTZ DEFAULT NULL
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
  v_cur_id UUID := CASE WHEN p_cursor ? 'id' THEN (p_cursor->>'id')::uuid END;
  v_rows JSONB;
  v_next JSONB;
  v_stats JSONB;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  WITH filtered AS (
    SELECT
      g.id, g.garment_id, g.garment_type::text AS garment_type, g.style,
      g.piece_stage::text AS piece_stage, g.location::text AS location,
      g.trip_number, g.in_production, g.acceptance_status, g.feedback_status,
      g.root_cause::text AS root_cause, g.express, g.soaking,
      g.assigned_unit, g.assigned_person, g.delivery_date, g.collected_at,
      o.id AS order_id, o.order_date, o.brand::text AS brand, o.order_type::text AS order_type,
      COALESCE(wo.invoice_number, ao.invoice_number) AS invoice_number,
      c.id AS c_id, c.name AS c_name, c.phone AS c_phone
    FROM garments g
    JOIN orders o ON o.id = g.order_id
    LEFT JOIN work_orders wo ON wo.order_id = o.id
    LEFT JOIN alteration_orders ao ON ao.order_id = o.id
    LEFT JOIN customers c ON c.id = o.customer_id
    WHERE o.checkout_status <> 'draft'
      AND (v_all_brands OR o.brand::text = ANY(p_brands))
      AND (p_garment_type IS NULL OR g.garment_type::text = p_garment_type)
      AND (p_piece_stage IS NULL OR g.piece_stage::text = p_piece_stage)
      AND (p_location IS NULL OR g.location::text = p_location)
      AND (p_from IS NULL OR o.order_date >= p_from)
      AND (p_to IS NULL OR o.order_date < p_to)
      AND (
        v_search = '' OR
        LOWER(COALESCE(g.garment_id, '')) LIKE '%' || v_search || '%' OR
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
    CASE WHEN p_cursor IS NULL THEN (
      SELECT jsonb_build_object(
        'total_garments', COUNT(*),
        'in_production',  COUNT(*) FILTER (WHERE in_production),
        'brova',          COUNT(*) FILTER (WHERE garment_type = 'brova'),
        'final',          COUNT(*) FILTER (WHERE garment_type = 'final'),
        'alteration',     COUNT(*) FILTER (WHERE garment_type = 'alteration')
      ) FROM filtered
    ) ELSE NULL END
  INTO v_rows, v_next, v_stats
  FROM numbered;

  RETURN jsonb_build_object('data', v_rows, 'next_cursor', v_next, 'stats', v_stats);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. admin_inventory — the whole shared stock pool in one blob.
--    fabric + shelf (shop-side) + accessories (cross-side). Not brand-scoped
--    (single shared pool, SPEC §4). Optional free-text (name/sku) + archived
--    toggle. Summary carries per-type counts, low-stock counts, and stock value
--    at cost (avg_cost when present, else selling price).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_inventory(
  p_search           TEXT    DEFAULT NULL,
  p_include_archived BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_search TEXT := LOWER(TRIM(COALESCE(p_search, '')));
  v_result JSONB;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  WITH
  fab AS (
    SELECT f.id, f.name, f.sku, f.color, f.color_hex, f.season::text AS season,
           f.shop_stock, f.workshop_stock, f.price_per_meter AS price, f.avg_cost,
           f.low_stock_threshold, f.supplier, f.is_archived,
           (f.low_stock_threshold IS NOT NULL
             AND COALESCE(f.shop_stock,0) + COALESCE(f.workshop_stock,0) <= f.low_stock_threshold) AS low
    FROM fabrics f
    WHERE (p_include_archived OR NOT f.is_archived)
      AND (v_search = '' OR LOWER(f.name) LIKE '%'||v_search||'%' OR LOWER(COALESCE(f.sku,'')) LIKE '%'||v_search||'%')
  ),
  shf AS (
    SELECT s.id, s.type AS name, s.sku, s.brand, s.shop_stock, s.workshop_stock,
           s.price, s.avg_cost, s.low_stock_threshold, s.is_archived,
           (s.low_stock_threshold IS NOT NULL
             AND COALESCE(s.shop_stock,0) + COALESCE(s.workshop_stock,0) <= s.low_stock_threshold) AS low
    FROM shelf s
    WHERE (p_include_archived OR NOT s.is_archived)
      AND (v_search = '' OR LOWER(COALESCE(s.type,'')) LIKE '%'||v_search||'%' OR LOWER(COALESCE(s.sku,'')) LIKE '%'||v_search||'%')
  ),
  acc AS (
    SELECT a.id, a.name, a.sku, a.category, a.unit_of_measure::text AS unit_of_measure,
           a.shop_stock, a.workshop_stock, a.price, a.low_stock_threshold, a.is_archived,
           (a.low_stock_threshold IS NOT NULL
             AND COALESCE(a.shop_stock,0) + COALESCE(a.workshop_stock,0) <= a.low_stock_threshold) AS low
    FROM accessories a
    WHERE (p_include_archived OR NOT a.is_archived)
      AND (v_search = '' OR LOWER(a.name) LIKE '%'||v_search||'%' OR LOWER(COALESCE(a.sku,'')) LIKE '%'||v_search||'%')
  )
  SELECT jsonb_build_object(
    'fabrics', COALESCE((SELECT jsonb_agg(to_jsonb(fab) ORDER BY name) FROM fab), '[]'::jsonb),
    'shelf',   COALESCE((SELECT jsonb_agg(to_jsonb(shf) ORDER BY name) FROM shf), '[]'::jsonb),
    'accessories', COALESCE((SELECT jsonb_agg(to_jsonb(acc) ORDER BY name) FROM acc), '[]'::jsonb),
    'summary', jsonb_build_object(
      'fabric_count',     (SELECT COUNT(*) FROM fab),
      'shelf_count',      (SELECT COUNT(*) FROM shf),
      'accessory_count',  (SELECT COUNT(*) FROM acc),
      'low_stock_count',
        (SELECT COUNT(*) FROM fab WHERE low)
        + (SELECT COUNT(*) FROM shf WHERE low)
        + (SELECT COUNT(*) FROM acc WHERE low),
      'stock_value_at_cost', ROUND(
          COALESCE((SELECT SUM((COALESCE(shop_stock,0)+COALESCE(workshop_stock,0)) * COALESCE(avg_cost, price, 0)) FROM fab), 0)
        + COALESCE((SELECT SUM((COALESCE(shop_stock,0)+COALESCE(workshop_stock,0)) * COALESCE(avg_cost, price, 0)) FROM shf), 0)
        + COALESCE((SELECT SUM((COALESCE(shop_stock,0)+COALESCE(workshop_stock,0)) * COALESCE(price, 0)) FROM acc), 0)
      , 3)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. admin_stock_movements — recent ledger + aggregates + waste-by-cause.
--    Windowed (p_from/p_to), optional item_type/location/movement_type filters.
--    movements: most-recent N with item name, supplier, user resolved. Waste
--    counts real qty AND the net-zero annotated redo scrap (SPEC §4).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_stock_movements(
  p_from          TIMESTAMPTZ DEFAULT NULL,
  p_to            TIMESTAMPTZ DEFAULT NULL,
  p_item_type     TEXT DEFAULT NULL,
  p_location      TEXT DEFAULT NULL,
  p_movement_type TEXT DEFAULT NULL,
  p_limit         INT  DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
  v_result JSONB;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  WITH m AS (
    SELECT sm.*
    FROM stock_movements sm
    WHERE (p_from IS NULL OR sm.created_at >= p_from)
      AND (p_to IS NULL OR sm.created_at < p_to)
      AND (p_item_type IS NULL OR sm.item_type::text = p_item_type)
      AND (p_location IS NULL OR sm.location::text = p_location)
      AND (p_movement_type IS NULL OR sm.movement_type::text = p_movement_type)
  ),
  recent AS (
    SELECT
      m.id, m.item_type::text AS item_type, m.item_id, m.location::text AS location,
      m.movement_type::text AS movement_type, m.qty_delta, m.qty_after,
      m.reason, m.root_cause::text AS root_cause, m.annotated_qty, m.brand::text AS brand,
      m.created_at,
      CASE m.item_type
        WHEN 'fabric'    THEN (SELECT f.name FROM fabrics f WHERE f.id = m.item_id)
        WHEN 'shelf'     THEN (SELECT s.type FROM shelf s WHERE s.id = m.item_id)
        WHEN 'accessory' THEN (SELECT a.name FROM accessories a WHERE a.id = m.item_id)
      END AS item_name,
      sup.name AS supplier_name,
      u.name AS user_name
    FROM m
    LEFT JOIN suppliers sup ON sup.id = m.supplier_id
    LEFT JOIN users u ON u.id = m.user_id
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT v_limit
  )
  SELECT jsonb_build_object(
    'movements', COALESCE((SELECT jsonb_agg(to_jsonb(recent)) FROM recent), '[]'::jsonb),
    'aggregates', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('movement_type', mt, 'count', cnt, 'net_qty', net) ORDER BY cnt DESC)
      FROM (
        SELECT movement_type::text AS mt, COUNT(*) AS cnt, ROUND(SUM(qty_delta), 2) AS net
        FROM m GROUP BY movement_type
      ) t
    ), '[]'::jsonb),
    'waste_by_cause', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('root_cause', rc, 'count', cnt, 'qty', qty) ORDER BY qty DESC)
      FROM (
        SELECT COALESCE(root_cause::text, 'unspecified') AS rc, COUNT(*) AS cnt,
               ROUND(SUM(ABS(qty_delta) + COALESCE(annotated_qty, 0)), 2) AS qty
        FROM m WHERE movement_type = 'waste'
        GROUP BY COALESCE(root_cause::text, 'unspecified')
      ) t
    ), '[]'::jsonb),
    'total_in_window', (SELECT COUNT(*) FROM m)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. admin_staff_roster — every user (staff), cross-brand, with live presence.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_staff_roster()
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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', u.id, 'name', u.name, 'username', u.username,
    'role', u.role, 'department', u.department,
    'job_functions', to_jsonb(u.job_functions), 'brands', to_jsonb(u.brands),
    'is_active', u.is_active, 'employee_id', u.employee_id,
    'phone', u.phone, 'email', u.email, 'nationality', u.nationality,
    'hire_date', u.hire_date, 'last_active_at', us.last_active_at
  ) ORDER BY u.is_active DESC, u.name), '[]'::jsonb)
  INTO v_result
  FROM users u
  LEFT JOIN user_sessions us ON us.user_id = u.id;

  RETURN v_result;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. admin_workshop_roster — workshop workers (resources) + their unit/stage.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_workshop_roster()
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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id, 'resource_name', r.resource_name, 'brand', r.brand,
    'resource_type', r.resource_type, 'responsibility', r.responsibility,
    'rating', r.rating, 'daily_target', r.daily_target, 'overtime_target', r.overtime_target,
    'unit_id', r.unit_id, 'unit_name', un.name, 'stage', un.stage,
    'user_id', r.user_id, 'user_name', u.name, 'user_active', u.is_active
  ) ORDER BY un.stage NULLS LAST, r.resource_name), '[]'::jsonb)
  INTO v_result
  FROM resources r
  LEFT JOIN units un ON un.id = r.unit_id
  LEFT JOIN users u ON u.id = r.user_id;

  RETURN v_result;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. admin_customers_page — keyset customer directory with spend rollups.
--    Sorted id DESC (newest first). Cursor = { id }. Filters: account_type,
--    free-text (name, arabic name, phone). Per-row order count + confirmed spend
--    + primary-account name for Secondary accounts (SPEC §5). First-page stats.
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
      c.id, c.name, c.arabic_name, c.phone, c.country_code, c.nick_name,
      c.account_type::text AS account_type, c.relation, c.primary_customer_id,
      c.customer_segment, c.city, c.area, c.created_at,
      p.name AS primary_name,
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
    WHERE p_cursor IS NULL OR id < v_cur_id
    ORDER BY id DESC
    LIMIT v_size + 1
  ),
  numbered AS (
    SELECT p.*, row_number() OVER (ORDER BY id DESC) AS rn FROM page p
  )
  SELECT
    COALESCE(jsonb_agg(row_to_json(numbered) ORDER BY rn) FILTER (WHERE rn <= v_size), '[]'::jsonb),
    (SELECT to_jsonb(x) FROM (SELECT id FROM page ORDER BY id DESC OFFSET v_size LIMIT 1) x),
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

-- ── Grants (the in-function is_admin() gate is the real check) ───────────────
GRANT EXECUTE ON FUNCTION admin_garments_page(JSONB, INT, TEXT[], TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_inventory(TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_stock_movements(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_staff_roster() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_workshop_roster() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_customers_page(JSONB, INT, TEXT, TEXT) TO authenticated;
