-- ════════════════════════════════════════════════════════════════════════════
-- 0050 — Admin Dashboard: per-item inventory drilldown (apps/admin-dashboard)
-- ════════════════════════════════════════════════════════════════════════════
-- 0044 gave the admin dashboard a stock LIST (admin_inventory) and a GLOBAL
-- ledger (admin_stock_movements), but no way to drill into a single fabric /
-- shelf item / accessory: no "meters consumed", no "units sold", no per-item
-- movement history, no deep-link target. This adds one RPC that returns
-- everything a per-item detail page needs, keyed on (item_type, item_id):
--
--   • item      — the full stock row (name, sku, stock, cost, price, flags…)
--   • rollup    — lifetime movement rollups: consumed (fabric meters cut /
--                 shelf units sold), restocked, wasted (incl. §4 net-zero redo
--                 scrap annotation), returned, adjusted, transferred in/out
--   • by_brand  — consumption broken down by consuming brand (SPEC §1/§4: the
--                 cross-brand fabric-usage view; empty for accessories)
--   • movements — this item's own ledger, most-recent N, supplier + user resolved
--
-- Same idiom as 0044: read-time aggregation, SECURITY DEFINER + is_admin()-gated,
-- NOT brand-scoped (single shared stock pool, SPEC §4). Idempotent CREATE OR
-- REPLACE. The stock_movements_item_idx index (item_type, item_id) already backs
-- the per-item walk.
--
-- Apply with:  pnpm --filter @repo/database db:apply-0050-inventory-item

CREATE OR REPLACE FUNCTION admin_inventory_item(
  p_item_type TEXT,
  p_item_id   INT,
  p_limit     INT DEFAULT 200
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
  v_item JSONB;
  v_rollup JSONB;
  v_by_brand JSONB;
  v_movements JSONB;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  IF p_item_type NOT IN ('fabric', 'shelf', 'accessory') THEN
    RAISE EXCEPTION 'invalid item_type: %', p_item_type;
  END IF;

  -- ── The stock row itself (unified shape; type-specific extras kept as fields) ─
  IF p_item_type = 'fabric' THEN
    SELECT jsonb_build_object(
      'id', f.id, 'item_type', 'fabric', 'name', f.name, 'sku', f.sku,
      'unit', 'm', 'shop_stock', f.shop_stock, 'workshop_stock', f.workshop_stock,
      'price', f.price_per_meter, 'avg_cost', f.avg_cost,
      'low_stock_threshold', f.low_stock_threshold, 'is_archived', f.is_archived,
      'low', (f.low_stock_threshold IS NOT NULL
              AND COALESCE(f.shop_stock,0) + COALESCE(f.workshop_stock,0) <= f.low_stock_threshold),
      'color', f.color, 'color_hex', f.color_hex, 'season', f.season::text,
      'supplier', f.supplier
    )
    INTO v_item
    FROM fabrics f WHERE f.id = p_item_id;
  ELSIF p_item_type = 'shelf' THEN
    SELECT jsonb_build_object(
      'id', s.id, 'item_type', 'shelf', 'name', s.type, 'sku', s.sku,
      'unit', 'pcs', 'shop_stock', s.shop_stock, 'workshop_stock', s.workshop_stock,
      'price', s.price, 'avg_cost', s.avg_cost,
      'low_stock_threshold', s.low_stock_threshold, 'is_archived', s.is_archived,
      'low', (s.low_stock_threshold IS NOT NULL
              AND COALESCE(s.shop_stock,0) + COALESCE(s.workshop_stock,0) <= s.low_stock_threshold),
      'brand', s.brand
    )
    INTO v_item
    FROM shelf s WHERE s.id = p_item_id;
  ELSE
    SELECT jsonb_build_object(
      'id', a.id, 'item_type', 'accessory', 'name', a.name, 'sku', a.sku,
      'unit', a.unit_of_measure::text, 'shop_stock', a.shop_stock, 'workshop_stock', a.workshop_stock,
      'price', a.price, 'avg_cost', NULL,
      'low_stock_threshold', a.low_stock_threshold, 'is_archived', a.is_archived,
      'low', (a.low_stock_threshold IS NOT NULL
              AND COALESCE(a.shop_stock,0) + COALESCE(a.workshop_stock,0) <= a.low_stock_threshold),
      'category', a.category, 'unit_of_measure', a.unit_of_measure::text
    )
    INTO v_item
    FROM accessories a WHERE a.id = p_item_id;
  END IF;

  IF v_item IS NULL THEN
    RETURN NULL;  -- not found; the caller renders an empty state
  END IF;

  -- ── Lifetime movement rollups (signed qty_delta; ABS for outflows) ──────────
  -- consumed = fabric cut / shelf sold (movement_type='consumption', outflow).
  -- wasted counts real waste AND the §4 net-zero redo-scrap annotation.
  SELECT jsonb_build_object(
    'consumed',        COALESCE(SUM(ABS(qty_delta)) FILTER (WHERE movement_type = 'consumption'), 0),
    'restocked',       COALESCE(SUM(qty_delta)      FILTER (WHERE movement_type = 'restock'), 0),
    'wasted',          COALESCE(SUM(ABS(qty_delta) + COALESCE(annotated_qty, 0)) FILTER (WHERE movement_type = 'waste'), 0),
    'returned',        COALESCE(SUM(qty_delta)      FILTER (WHERE movement_type = 'return'), 0),
    'adjusted',        COALESCE(SUM(qty_delta)      FILTER (WHERE movement_type = 'adjustment'), 0),
    'transferred_in',  COALESCE(SUM(qty_delta)      FILTER (WHERE movement_type = 'transfer_in'), 0),
    'transferred_out', COALESCE(SUM(ABS(qty_delta)) FILTER (WHERE movement_type = 'transfer_out'), 0),
    'movement_count',  COUNT(*),
    'first_movement',  MIN(created_at),
    'last_movement',   MAX(created_at)
  )
  INTO v_rollup
  FROM stock_movements
  WHERE item_type::text = p_item_type AND item_id = p_item_id;

  -- ── Consumption broken down by consuming brand (SPEC §1/§4 cross-brand view) ─
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('brand', brand, 'qty', qty, 'count', cnt) ORDER BY qty DESC
  ), '[]'::jsonb)
  INTO v_by_brand
  FROM (
    SELECT COALESCE(brand::text, 'unattributed') AS brand,
           ROUND(SUM(ABS(qty_delta)), 2) AS qty, COUNT(*) AS cnt
    FROM stock_movements
    WHERE item_type::text = p_item_type AND item_id = p_item_id
      AND movement_type = 'consumption'
    GROUP BY COALESCE(brand::text, 'unattributed')
  ) t;

  -- ── This item's own ledger, most-recent N (same shape as admin_stock_movements) ─
  SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
  INTO v_movements
  FROM (
    SELECT
      sm.id, sm.item_type::text AS item_type, sm.item_id, sm.location::text AS location,
      sm.movement_type::text AS movement_type, sm.qty_delta, sm.qty_after,
      sm.reason, sm.root_cause::text AS root_cause, sm.annotated_qty, sm.brand::text AS brand,
      sm.unit_cost, sm.image_url, sm.created_at,
      (v_item->>'name') AS item_name,
      sup.name AS supplier_name,
      u.name AS user_name
    FROM stock_movements sm
    LEFT JOIN suppliers sup ON sup.id = sm.supplier_id
    LEFT JOIN users u ON u.id = sm.user_id
    WHERE sm.item_type::text = p_item_type AND sm.item_id = p_item_id
    ORDER BY sm.created_at DESC, sm.id DESC
    LIMIT v_limit
  ) r;

  RETURN jsonb_build_object(
    'item', v_item,
    'rollup', v_rollup,
    'by_brand', v_by_brand,
    'movements', v_movements
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_inventory_item(TEXT, INT, INT) TO authenticated;
