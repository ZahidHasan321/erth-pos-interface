-- ════════════════════════════════════════════════════════════════════════════
-- 0045 — Admin Finance read RPCs (apps/admin-dashboard → Finance section)
-- ════════════════════════════════════════════════════════════════════════════
-- Read-only, cross-brand oversight of MONEY: every payment and refund, the cash
-- drawer / EOD register reconciliation, and the money-out side (stock-purchase
-- payables). Same idiom as 0043_admin_dashboard_rpcs.sql — read-time aggregation
-- over existing tables, NO rollup tables, NO triggers.
--
-- Every RPC is SECURITY DEFINER (bypasses RLS) and re-asserts is_admin() at the
-- top, so a plain `admin` (not just super_admin) reads all brands. (The one
-- exception, admin_stock_item_name, is an unguarded name-lookup helper called
-- only from within these RPCs — it resolves item names that are already visible
-- in the shop inventory, so it carries no additional exposure.) Numbers
-- are computed with the EXACT cashier reconciliation identity from
-- close_register (triggers.sql), so the admin view ties out to the drawer:
--   expected = opening_float + cash_payments − cash_refunds + cash_in − cash_out
-- Cash payments/refunds are attributed by register_session_id (exact session
-- attribution, not a time window — matches close_register across midnight).
--
-- Money conventions (schema.ts):
--   payment_transactions.amount   — refunds stored NEGATIVE (ABS() for refunds)
--   transaction_type              — 'payment' | 'refund'
--   payment_type                  — 'cash' | 'knet' | 'link_payment'
--                                    | 'installments' | 'others' (nullable)
--   register_cash_movements.type  — 'cash_in' | 'cash_out' (amount always > 0)
--   stock_purchases               — total_cost frozen; amount_paid/status trigger-owned
--
-- Idempotent: CREATE OR REPLACE + CREATE INDEX IF NOT EXISTS. Re-runnable.
-- Reuses: is_admin().

-- ── Supporting indexes ──────────────────────────────────────────────────────
-- Ledger keyset walk: ORDER BY created_at DESC, id DESC.
CREATE INDEX IF NOT EXISTS payment_transactions_created_id_desc_idx
  ON payment_transactions (created_at DESC, id DESC);
-- Per-session reconciliation lookups.
CREATE INDEX IF NOT EXISTS payment_transactions_session_idx
  ON payment_transactions (register_session_id);
CREATE INDEX IF NOT EXISTS register_cash_movements_session_idx
  ON register_cash_movements (register_session_id);
-- Purchases ledger keyset + settlement window.
CREATE INDEX IF NOT EXISTS stock_purchases_created_id_desc_idx
  ON stock_purchases (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS stock_purchase_payments_paid_at_idx
  ON stock_purchase_payments (paid_at);

-- Resolve a stock line's display name from (item_type, item_id).
CREATE OR REPLACE FUNCTION admin_stock_item_name(p_item_type TEXT, p_item_id INT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
  SELECT CASE p_item_type
    WHEN 'fabric'    THEN (SELECT name FROM fabrics     WHERE id = p_item_id)
    WHEN 'shelf'     THEN (SELECT type FROM shelf       WHERE id = p_item_id)
    WHEN 'accessory' THEN (SELECT name FROM accessories WHERE id = p_item_id)
    ELSE NULL END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. admin_finance_summary — one JSONB blob for the Finance › Overview page.
--    Payment-method split, cash-drawer flow, purchases (money-out) rollup, and
--    register-session tally. p_from / p_to are UTC instants (Kuwait-day bounds).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_finance_summary(
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
  v_from_date  DATE := (p_from AT TIME ZONE 'Asia/Kuwait')::date;
  v_to_date    DATE := (p_to   AT TIME ZONE 'Asia/Kuwait')::date;
  v_result JSONB;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  WITH
  -- Money that moved in the window (cash basis; non-draft orders).
  tx AS (
    SELECT pt.amount, pt.transaction_type::text AS tt, pt.payment_type::text AS pm
    FROM payment_transactions pt
    JOIN orders o ON o.id = pt.order_id
    WHERE o.checkout_status <> 'draft'
      AND pt.created_at >= p_from AND pt.created_at < p_to
      AND (v_all_brands OR o.brand::text = ANY(p_brands))
  ),
  by_method AS (
    SELECT
      COALESCE(pm, 'unknown') AS payment_type,
      COALESCE(SUM(amount) FILTER (WHERE tt = 'payment'), 0)        AS collected,
      COALESCE(SUM(ABS(amount)) FILTER (WHERE tt = 'refund'), 0)    AS refunded,
      COUNT(*)                                                      AS count
    FROM tx GROUP BY COALESCE(pm, 'unknown')
  ),
  -- Cash-drawer movements (petty cash, drops, deposits…) in the window.
  cm AS (
    SELECT rcm.type::text AS mtype, rcm.reason_category::text AS reason_category, rcm.amount
    FROM register_cash_movements rcm
    JOIN register_sessions rs ON rs.id = rcm.register_session_id
    WHERE rcm.created_at >= p_from AND rcm.created_at < p_to
      AND (v_all_brands OR rs.brand::text = ANY(p_brands))
  ),
  cm_by_cat AS (
    SELECT mtype, reason_category, COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count
    FROM cm GROUP BY mtype, reason_category
  ),
  -- Money-out: purchase payables created in the window.
  pur_created AS (
    SELECT COUNT(*) AS cnt, COALESCE(SUM(total_cost), 0) AS amt
    FROM stock_purchases sp
    WHERE sp.created_at >= p_from AND sp.created_at < p_to
      AND (v_all_brands OR sp.brand::text = ANY(p_brands))
  ),
  -- Settlements paid in the window (by method).
  pur_paid AS (
    SELECT spp.payment_type::text AS pm, COALESCE(SUM(spp.amount), 0) AS amt, COUNT(*) AS cnt
    FROM stock_purchase_payments spp
    JOIN stock_purchases sp ON sp.id = spp.purchase_id
    WHERE spp.paid_at >= p_from AND spp.paid_at < p_to
      AND (v_all_brands OR sp.brand::text = ANY(p_brands))
    GROUP BY spp.payment_type::text
  ),
  -- Current outstanding payables (point-in-time snapshot, not window-scoped).
  pur_outstanding AS (
    SELECT COALESCE(SUM(sp.total_cost - sp.amount_paid), 0) AS amt, COUNT(*) AS cnt
    FROM stock_purchases sp
    WHERE sp.status <> 'paid'
      AND (v_all_brands OR sp.brand::text = ANY(p_brands))
  ),
  -- Register sessions whose business date falls in the window.
  reg AS (
    SELECT rs.status::text AS status, rs.variance
    FROM register_sessions rs
    WHERE rs.date >= v_from_date AND rs.date < v_to_date
      AND (v_all_brands OR rs.brand::text = ANY(p_brands))
  )
  SELECT jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to),
    'brands', CASE WHEN v_all_brands THEN NULL ELSE to_jsonb(p_brands) END,
    'totals', jsonb_build_object(
      'collected', (SELECT COALESCE(SUM(collected), 0) FROM by_method),
      'refunded',  (SELECT COALESCE(SUM(refunded), 0) FROM by_method),
      'net',       (SELECT COALESCE(SUM(collected - refunded), 0) FROM by_method),
      'tx_count',  (SELECT COUNT(*) FROM tx)
    ),
    'by_method', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'payment_type', payment_type, 'collected', collected,
        'refunded', refunded, 'net', collected - refunded, 'count', count
      ) ORDER BY (collected - refunded) DESC), '[]'::jsonb) FROM by_method
    ),
    'cash_flow', jsonb_build_object(
      'cash_in',  (SELECT COALESCE(SUM(amount), 0) FROM cm WHERE mtype = 'cash_in'),
      'cash_out', (SELECT COALESCE(SUM(amount), 0) FROM cm WHERE mtype = 'cash_out'),
      'by_category', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'type', mtype, 'reason_category', reason_category, 'amount', amount, 'count', count
        ) ORDER BY amount DESC), '[]'::jsonb) FROM cm_by_cat
      )
    ),
    'purchases', jsonb_build_object(
      'payables_created_count',  (SELECT cnt FROM pur_created),
      'payables_created_amount', (SELECT amt FROM pur_created),
      'settled_amount',          (SELECT COALESCE(SUM(amt), 0) FROM pur_paid),
      'settled_by_method', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'payment_type', pm, 'amount', amt, 'count', cnt
        ) ORDER BY amt DESC), '[]'::jsonb) FROM pur_paid
      ),
      'outstanding_now_amount', (SELECT amt FROM pur_outstanding),
      'outstanding_now_count',  (SELECT cnt FROM pur_outstanding)
    ),
    'registers', jsonb_build_object(
      'open_count',   (SELECT COUNT(*) FROM reg WHERE status = 'open'),
      'closed_count', (SELECT COUNT(*) FROM reg WHERE status = 'closed'),
      'total_variance', (SELECT COALESCE(SUM(variance), 0) FROM reg WHERE status = 'closed'),
      'over_count',   (SELECT COUNT(*) FROM reg WHERE status = 'closed' AND variance > 0),
      'short_count',  (SELECT COUNT(*) FROM reg WHERE status = 'closed' AND variance < 0)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. admin_transactions_page — keyset ledger of EVERY payment + refund, across
--    all orders. ORDER BY created_at DESC, id DESC. Stats over the whole filtered
--    set are computed once on the first page (p_cursor NULL).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_transactions_page(
  p_cursor       JSONB   DEFAULT NULL,
  p_page_size    INT     DEFAULT 40,
  p_brands       TEXT[]  DEFAULT NULL,
  p_txn_type     TEXT    DEFAULT NULL,   -- 'payment' | 'refund'
  p_payment_type TEXT    DEFAULT NULL,   -- 'cash' | 'knet' | 'link_payment' | 'installments' | 'others'
  p_search       TEXT    DEFAULT NULL,   -- order #, invoice #, ref no, cashier name
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
  v_size INT := LEAST(GREATEST(COALESCE(p_page_size, 40), 1), 100);
  v_search TEXT := LOWER(TRIM(COALESCE(p_search, '')));
  v_cur_ts TIMESTAMPTZ := CASE WHEN p_cursor ? 'created_at' THEN (p_cursor->>'created_at')::timestamptz END;
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
      pt.id, pt.order_id, pt.amount, pt.transaction_type::text AS transaction_type,
      pt.payment_type::text AS payment_type, pt.refund_reason, pt.payment_ref_no,
      pt.payment_note, pt.register_session_id, pt.created_at,
      o.brand::text AS brand,
      COALESCE(wo.invoice_number, ao.invoice_number) AS invoice_number,
      c.name AS customer_name,
      u.name AS cashier_name
    FROM payment_transactions pt
    JOIN orders o ON o.id = pt.order_id
    LEFT JOIN work_orders wo ON wo.order_id = o.id
    LEFT JOIN alteration_orders ao ON ao.order_id = o.id
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN users u ON u.id = pt.cashier_id
    WHERE o.checkout_status <> 'draft'
      AND (v_all_brands OR o.brand::text = ANY(p_brands))
      AND (p_txn_type IS NULL OR pt.transaction_type::text = p_txn_type)
      AND (p_payment_type IS NULL OR pt.payment_type::text = p_payment_type)
      AND (p_from IS NULL OR pt.created_at >= p_from)
      AND (p_to IS NULL OR pt.created_at < p_to)
      AND (
        v_search = '' OR
        pt.order_id::text = v_search OR
        COALESCE(wo.invoice_number, ao.invoice_number)::text = v_search OR
        LOWER(COALESCE(pt.payment_ref_no, '')) LIKE '%' || v_search || '%' OR
        LOWER(COALESCE(u.name, '')) LIKE '%' || v_search || '%' OR
        LOWER(COALESCE(c.name, '')) LIKE '%' || v_search || '%'
      )
  ),
  page AS (
    SELECT * FROM filtered
    WHERE p_cursor IS NULL
       OR (created_at, id) < (v_cur_ts, v_cur_id)
    ORDER BY created_at DESC, id DESC
    LIMIT v_size + 1
  ),
  numbered AS (
    SELECT p.*, row_number() OVER (ORDER BY created_at DESC, id DESC) AS rn FROM page p
  )
  SELECT
    COALESCE(jsonb_agg(row_to_json(numbered) ORDER BY rn) FILTER (WHERE rn <= v_size), '[]'::jsonb),
    (SELECT to_jsonb(x) FROM (
       SELECT created_at, id FROM page ORDER BY created_at DESC, id DESC OFFSET v_size LIMIT 1
     ) x),
    CASE WHEN p_cursor IS NULL THEN (
      SELECT jsonb_build_object(
        'count', COUNT(*),
        'total_in',  COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'payment'), 0),
        'total_out', COALESCE(SUM(ABS(amount)) FILTER (WHERE transaction_type = 'refund'), 0),
        'net', COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'payment'), 0)
             - COALESCE(SUM(ABS(amount)) FILTER (WHERE transaction_type = 'refund'), 0)
      ) FROM filtered
    ) ELSE NULL END
  INTO v_rows, v_next, v_stats
  FROM numbered;

  RETURN jsonb_build_object('data', v_rows, 'next_cursor', v_next, 'stats', v_stats);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. admin_registers_page — register sessions (EOD drawers) in a date window,
--    with LIVE reconciliation (recomputed even for still-open drawers). Sessions
--    are few (one per brand per day) so this returns the whole window, no keyset.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_registers_page(
  p_from   TIMESTAMPTZ,
  p_to     TIMESTAMPTZ,
  p_brands TEXT[] DEFAULT NULL,
  p_status TEXT   DEFAULT NULL   -- 'open' | 'closed'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_all_brands BOOLEAN := (p_brands IS NULL OR cardinality(p_brands) = 0);
  v_from_date DATE := (p_from AT TIME ZONE 'Asia/Kuwait')::date;
  v_to_date   DATE := (p_to   AT TIME ZONE 'Asia/Kuwait')::date;
  v_rows JSONB;
  v_stats JSONB;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  WITH sessions AS (
    SELECT
      rs.id, rs.brand::text AS brand, rs.date, rs.status::text AS status,
      rs.opening_float, rs.closing_counted_cash, rs.expected_cash AS stored_expected,
      rs.variance AS stored_variance, rs.opened_at, rs.closed_at, rs.reopened_at,
      ob.name AS opened_by_name, cb.name AS closed_by_name,
      -- live reconciliation inputs (exact session attribution)
      COALESCE((SELECT SUM(pt.amount) FROM payment_transactions pt
        WHERE pt.register_session_id = rs.id AND pt.payment_type = 'cash'
          AND pt.transaction_type = 'payment'), 0) AS cash_payments,
      COALESCE((SELECT SUM(ABS(pt.amount)) FROM payment_transactions pt
        WHERE pt.register_session_id = rs.id AND pt.payment_type = 'cash'
          AND pt.transaction_type = 'refund'), 0) AS cash_refunds,
      COALESCE((SELECT SUM(rcm.amount) FROM register_cash_movements rcm
        WHERE rcm.register_session_id = rs.id AND rcm.type = 'cash_in'), 0) AS cash_in,
      COALESCE((SELECT SUM(rcm.amount) FROM register_cash_movements rcm
        WHERE rcm.register_session_id = rs.id AND rcm.type = 'cash_out'), 0) AS cash_out,
      (SELECT COUNT(*) FROM payment_transactions pt WHERE pt.register_session_id = rs.id) AS tx_count
    FROM register_sessions rs
    LEFT JOIN users ob ON ob.id = rs.opened_by
    LEFT JOIN users cb ON cb.id = rs.closed_by
    WHERE rs.date >= v_from_date AND rs.date < v_to_date
      AND (v_all_brands OR rs.brand::text = ANY(p_brands))
      AND (p_status IS NULL OR rs.status::text = p_status)
  ),
  computed AS (
    SELECT s.*,
      (s.opening_float + s.cash_payments - s.cash_refunds + s.cash_in - s.cash_out) AS live_expected
    FROM sessions s
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'brand', brand, 'date', date, 'status', status,
      'opening_float', opening_float, 'closing_counted_cash', closing_counted_cash,
      'expected_cash', COALESCE(stored_expected, live_expected),
      'live_expected', live_expected,
      'variance', CASE WHEN status = 'closed' THEN stored_variance
                       WHEN closing_counted_cash IS NOT NULL THEN closing_counted_cash - live_expected
                       ELSE NULL END,
      'cash_payments', cash_payments, 'cash_refunds', cash_refunds,
      'cash_in', cash_in, 'cash_out', cash_out, 'tx_count', tx_count,
      'opened_by_name', opened_by_name, 'opened_at', opened_at,
      'closed_by_name', closed_by_name, 'closed_at', closed_at, 'reopened_at', reopened_at
    ) ORDER BY date DESC, brand), '[]'::jsonb),
    jsonb_build_object(
      'session_count', COUNT(*),
      'open_count', COUNT(*) FILTER (WHERE status = 'open'),
      'closed_count', COUNT(*) FILTER (WHERE status = 'closed'),
      'total_expected', COALESCE(SUM(COALESCE(stored_expected, live_expected)), 0),
      'total_counted', COALESCE(SUM(closing_counted_cash), 0),
      'total_variance', COALESCE(SUM(stored_variance) FILTER (WHERE status = 'closed'), 0)
    )
  INTO v_rows, v_stats
  FROM computed;

  RETURN jsonb_build_object('data', v_rows, 'stats', v_stats);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. admin_register_detail — one drawer, every penny: reconciliation breakdown,
--    payment-method split, cash movements, close-event history, and each
--    transaction rung on the session.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_register_detail(p_session_id INT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_rs RECORD;
  v_cash_payments NUMERIC;
  v_cash_refunds NUMERIC;
  v_cash_in NUMERIC;
  v_cash_out NUMERIC;
  v_expected NUMERIC;
  v_result JSONB;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  SELECT rs.*, ob.name AS opened_by_name, cb.name AS closed_by_name, rb.name AS reopened_by_name
  INTO v_rs
  FROM register_sessions rs
  LEFT JOIN users ob ON ob.id = rs.opened_by
  LEFT JOIN users cb ON cb.id = rs.closed_by
  LEFT JOIN users rb ON rb.id = rs.reopened_by
  WHERE rs.id = p_session_id;

  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE payment_type = 'cash' AND transaction_type = 'payment'), 0),
    COALESCE(SUM(ABS(amount)) FILTER (WHERE payment_type = 'cash' AND transaction_type = 'refund'), 0)
  INTO v_cash_payments, v_cash_refunds
  FROM payment_transactions WHERE register_session_id = p_session_id;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE type = 'cash_in'), 0),
    COALESCE(SUM(amount) FILTER (WHERE type = 'cash_out'), 0)
  INTO v_cash_in, v_cash_out
  FROM register_cash_movements WHERE register_session_id = p_session_id;

  v_expected := v_rs.opening_float + v_cash_payments - v_cash_refunds + v_cash_in - v_cash_out;

  SELECT jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_rs.id, 'brand', v_rs.brand::text, 'date', v_rs.date, 'status', v_rs.status::text,
      'opening_float', v_rs.opening_float, 'closing_counted_cash', v_rs.closing_counted_cash,
      'expected_cash', v_rs.expected_cash, 'variance', v_rs.variance, 'closing_notes', v_rs.closing_notes,
      'opened_by_name', v_rs.opened_by_name, 'opened_at', v_rs.opened_at,
      'closed_by_name', v_rs.closed_by_name, 'closed_at', v_rs.closed_at,
      'reopened_by_name', v_rs.reopened_by_name, 'reopened_at', v_rs.reopened_at
    ),
    'reconciliation', jsonb_build_object(
      'opening_float', v_rs.opening_float,
      'cash_payments', v_cash_payments, 'cash_refunds', v_cash_refunds,
      'cash_in', v_cash_in, 'cash_out', v_cash_out,
      'expected', v_expected,
      'counted', v_rs.closing_counted_cash,
      'variance', CASE WHEN v_rs.closing_counted_cash IS NULL THEN NULL
                       ELSE v_rs.closing_counted_cash - v_expected END
    ),
    'by_method', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'payment_type', COALESCE(payment_type::text, 'unknown'),
        'collected', collected, 'refunded', refunded, 'net', collected - refunded, 'count', cnt
      ) ORDER BY (collected - refunded) DESC), '[]'::jsonb)
      FROM (
        SELECT payment_type,
          COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'payment'), 0) AS collected,
          COALESCE(SUM(ABS(amount)) FILTER (WHERE transaction_type = 'refund'), 0) AS refunded,
          COUNT(*) AS cnt
        FROM payment_transactions WHERE register_session_id = p_session_id
        GROUP BY payment_type
      ) m
    ),
    'cash_movements', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', rcm.id, 'type', rcm.type::text, 'reason_category', rcm.reason_category::text,
        'amount', rcm.amount, 'reason', rcm.reason, 'performed_by_name', u.name, 'created_at', rcm.created_at
      ) ORDER BY rcm.created_at), '[]'::jsonb)
      FROM register_cash_movements rcm
      LEFT JOIN users u ON u.id = rcm.performed_by
      WHERE rcm.register_session_id = p_session_id
    ),
    'close_events', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', rce.id, 'closed_by_name', u.name, 'closed_at', rce.closed_at,
        'opening_float', rce.opening_float, 'counted_cash', rce.counted_cash,
        'expected_cash', rce.expected_cash, 'variance', rce.variance, 'notes', rce.notes
      ) ORDER BY rce.closed_at DESC), '[]'::jsonb)
      FROM register_close_events rce
      LEFT JOIN users u ON u.id = rce.closed_by
      WHERE rce.register_session_id = p_session_id
    ),
    'transactions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', pt.id, 'order_id', pt.order_id,
        'invoice_number', COALESCE(wo.invoice_number, ao.invoice_number),
        'amount', pt.amount, 'transaction_type', pt.transaction_type::text,
        'payment_type', pt.payment_type::text, 'refund_reason', pt.refund_reason,
        'payment_ref_no', pt.payment_ref_no, 'cashier_name', u.name, 'created_at', pt.created_at
      ) ORDER BY pt.created_at DESC), '[]'::jsonb)
      FROM payment_transactions pt
      LEFT JOIN work_orders wo ON wo.order_id = pt.order_id
      LEFT JOIN alteration_orders ao ON ao.order_id = pt.order_id
      LEFT JOIN users u ON u.id = pt.cashier_id
      WHERE pt.register_session_id = p_session_id
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. admin_purchases_page — money-out ledger: stock-purchase payables with
--    total / paid / outstanding / status. ORDER BY created_at DESC, id DESC.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_purchases_page(
  p_cursor    JSONB   DEFAULT NULL,
  p_page_size INT     DEFAULT 30,
  p_brands    TEXT[]  DEFAULT NULL,
  p_status    TEXT    DEFAULT NULL,   -- 'unpaid' | 'partially_paid' | 'paid'
  p_search    TEXT    DEFAULT NULL,   -- item name, supplier name, purchase #
  p_from      TIMESTAMPTZ DEFAULT NULL,
  p_to        TIMESTAMPTZ DEFAULT NULL
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
  v_cur_ts TIMESTAMPTZ := CASE WHEN p_cursor ? 'created_at' THEN (p_cursor->>'created_at')::timestamptz END;
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
      sp.id, sp.created_at, sp.brand::text AS brand, sp.item_type::text AS item_type,
      sp.item_id, admin_stock_item_name(sp.item_type::text, sp.item_id) AS item_name,
      sp.qty, sp.unit_cost, sp.total_cost, sp.amount_paid,
      (sp.total_cost - sp.amount_paid) AS outstanding, sp.status::text AS status,
      sp.supplier_id, s.name AS supplier_name, sp.invoice_image_url,
      u.name AS created_by_name
    FROM stock_purchases sp
    LEFT JOIN suppliers s ON s.id = sp.supplier_id
    LEFT JOIN users u ON u.id = sp.created_by
    WHERE (v_all_brands OR sp.brand::text = ANY(p_brands))
      AND (p_status IS NULL OR sp.status::text = p_status)
      AND (p_from IS NULL OR sp.created_at >= p_from)
      AND (p_to IS NULL OR sp.created_at < p_to)
      AND (
        v_search = '' OR
        sp.id::text = v_search OR
        LOWER(COALESCE(admin_stock_item_name(sp.item_type::text, sp.item_id), '')) LIKE '%' || v_search || '%' OR
        LOWER(COALESCE(s.name, '')) LIKE '%' || v_search || '%'
      )
  ),
  page AS (
    SELECT * FROM filtered
    WHERE p_cursor IS NULL
       OR (created_at, id) < (v_cur_ts, v_cur_id)
    ORDER BY created_at DESC, id DESC
    LIMIT v_size + 1
  ),
  numbered AS (
    SELECT p.*, row_number() OVER (ORDER BY created_at DESC, id DESC) AS rn FROM page p
  )
  SELECT
    COALESCE(jsonb_agg(row_to_json(numbered) ORDER BY rn) FILTER (WHERE rn <= v_size), '[]'::jsonb),
    (SELECT to_jsonb(x) FROM (
       SELECT created_at, id FROM page ORDER BY created_at DESC, id DESC OFFSET v_size LIMIT 1
     ) x),
    CASE WHEN p_cursor IS NULL THEN (
      SELECT jsonb_build_object(
        'count', COUNT(*),
        'total_payable', COALESCE(SUM(total_cost), 0),
        'total_paid', COALESCE(SUM(amount_paid), 0),
        'total_outstanding', COALESCE(SUM(total_cost - amount_paid), 0)
      ) FROM filtered
    ) ELSE NULL END
  INTO v_rows, v_next, v_stats
  FROM numbered;

  RETURN jsonb_build_object('data', v_rows, 'next_cursor', v_next, 'stats', v_stats);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. admin_purchase_detail — one payable + its full settlement ledger.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_purchase_detail(p_purchase_id INT)
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
    'purchase', (
      SELECT jsonb_build_object(
        'id', sp.id, 'created_at', sp.created_at, 'brand', sp.brand::text,
        'item_type', sp.item_type::text, 'item_id', sp.item_id,
        'item_name', admin_stock_item_name(sp.item_type::text, sp.item_id),
        'qty', sp.qty, 'unit_cost', sp.unit_cost, 'total_cost', sp.total_cost,
        'amount_paid', sp.amount_paid, 'outstanding', sp.total_cost - sp.amount_paid,
        'status', sp.status::text, 'supplier_id', sp.supplier_id, 'supplier_name', s.name,
        'invoice_image_url', sp.invoice_image_url, 'notes', sp.notes, 'created_by_name', u.name
      )
      FROM stock_purchases sp
      LEFT JOIN suppliers s ON s.id = sp.supplier_id
      LEFT JOIN users u ON u.id = sp.created_by
      WHERE sp.id = p_purchase_id
    ),
    'payments', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', spp.id, 'amount', spp.amount, 'payment_type', spp.payment_type::text,
        'register_session_id', spp.register_session_id,
        'register_cash_movement_id', spp.register_cash_movement_id,
        'payment_ref_no', spp.payment_ref_no, 'note', spp.note,
        'paid_by_name', u.name, 'paid_at', spp.paid_at
      ) ORDER BY spp.paid_at DESC), '[]'::jsonb)
      FROM stock_purchase_payments spp
      LEFT JOIN users u ON u.id = spp.paid_by
      WHERE spp.purchase_id = p_purchase_id
    )
  ) INTO v_result;

  -- purchase is NULL when the id doesn't exist → return NULL for a clean 404.
  IF v_result->'purchase' IS NULL OR v_result->'purchase' = 'null'::jsonb THEN
    RETURN NULL;
  END IF;
  RETURN v_result;
END;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION admin_stock_item_name(TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_finance_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_transactions_page(JSONB, INT, TEXT[], TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_registers_page(TIMESTAMPTZ, TIMESTAMPTZ, TEXT[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_register_detail(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_purchases_page(JSONB, INT, TEXT[], TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_purchase_detail(INT) TO authenticated;
