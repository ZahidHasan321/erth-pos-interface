-- Migration: treat piece_stage='discarded' as terminal across server-side rollups
--
-- Paired with 0001 which added the enum value. The redo-flow discards the
-- original garment (terminal, never reworked — workshop creates a replacement
-- row instead). Every trigger/RPC that filters on "piece_stage = 'completed'"
-- needs to also exclude 'discarded' so:
--   - orders with all garments terminal roll up to order_phase='completed'
--   - discarded garments don't inflate parking/in-progress/showroom counts
--   - assigned_order_agg ignores discarded rows so status labels stay correct

-- ── 1. Order-phase recompute: all-terminal check includes discarded ──────
CREATE OR REPLACE FUNCTION recompute_order_phase()
RETURNS TRIGGER AS $$
DECLARE
    v_new_phase order_phase;
    v_current_phase order_phase;
BEGIN
    SELECT wo.order_phase INTO v_current_phase
    FROM work_orders wo WHERE wo.order_id = NEW.order_id;

    IF v_current_phase IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT CASE
        WHEN bool_and(g.piece_stage IN ('completed', 'discarded'))
            THEN 'completed'::order_phase
        WHEN bool_and(g.piece_stage IN ('waiting_for_acceptance', 'waiting_cut', 'brova_trialed'))
            THEN v_current_phase
        ELSE 'in_progress'::order_phase
    END INTO v_new_phase
    FROM garments g
    WHERE g.order_id = NEW.order_id;

    UPDATE work_orders
    SET order_phase = v_new_phase
    WHERE order_id = NEW.order_id
      AND (order_phase IS NULL OR order_phase != v_new_phase);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 2. Partial index: exclude discarded from the "active garments" index ─
DROP INDEX IF EXISTS garments_order_location_idx;
CREATE INDEX garments_order_location_idx
    ON garments(order_id, location)
    WHERE piece_stage NOT IN ('completed', 'discarded');

-- ── 3. assigned_order_agg view: drop discarded rows at the source ────────
-- Every downstream flag (is_active, has_workshop_garment, all_workshop_ready,
-- brovas_at_workshop, etc.) derives from this view. Filtering here keeps the
-- workshop status labels clean without touching the CASE chain.
CREATE OR REPLACE VIEW assigned_order_agg AS
SELECT
    g.order_id,
    COUNT(*)                                                 AS garments_count,
    bool_or(g.garment_type::text = 'brova')                  AS has_brova,
    bool_or(g.garment_type::text = 'final')                  AS has_final,
    bool_or(g.express)                                       AS any_express,
    bool_or(g.soaking)                                       AS any_soaking,
    bool_or(COALESCE(g.trip_number, 1) > 1)                  AS any_returns,
    MAX(COALESCE(g.trip_number, 1))                          AS max_trip,
    bool_or(
        (g.piece_stage::text = 'soaking' AND g.start_time IS NOT NULL)
        OR g.piece_stage::text IN ('cutting','post_cutting','sewing','finishing','ironing','quality_check')
    ) AS is_active,
    bool_or(g.location::text = 'workshop')                   AS has_workshop_garment,
    bool_and(
        g.location::text <> 'workshop'
        OR g.piece_stage::text = 'ready_for_dispatch'
    ) AS all_workshop_ready,
    bool_and(g.location::text = 'shop')                      AS all_at_shop,
    bool_or(g.location::text = 'transit_to_shop')            AS has_transit_to_shop,
    bool_or(
        g.garment_type::text = 'final'
        AND g.location::text IN ('workshop','transit_to_workshop')
        AND g.piece_stage::text <> 'waiting_for_acceptance'
    ) AS finals_active_workshop,
    bool_or(
        g.garment_type::text = 'final'
        AND g.piece_stage::text = 'waiting_for_acceptance'
    ) AS finals_parked,
    bool_or(
        g.garment_type::text = 'brova'
        AND g.location::text IN ('workshop','transit_to_workshop')
    ) AS brovas_at_workshop,
    bool_and(
        g.garment_type::text <> 'brova'
        OR g.location::text = 'shop'
    ) AS brovas_all_at_shop_or_absent,
    bool_or(g.garment_type::text = 'brova')                  AS has_any_brova,
    bool_or(
        g.garment_type::text = 'brova'
        AND g.location::text = 'transit_to_shop'
    ) AS brovas_in_transit_to_shop,
    bool_or(
        g.garment_type::text = 'brova'
        AND g.acceptance_status = TRUE
    ) AS any_brova_accepted,
    bool_and(
        g.location::text <> 'workshop'
        OR g.piece_stage::text = 'waiting_for_acceptance'
    ) AS only_parked_at_workshop,
    COUNT(*) FILTER (WHERE g.location::text = 'shop')              AS shop_count,
    COUNT(*) FILTER (WHERE g.location::text IN ('transit_to_shop','transit_to_workshop')) AS transit_count,
    COUNT(*) FILTER (WHERE g.garment_type::text = 'brova')         AS brova_count,
    COUNT(*) FILTER (WHERE g.garment_type::text = 'final')         AS final_count,
    MIN(g.delivery_date)                                           AS earliest_garment_delivery
FROM garments g
WHERE g.piece_stage::text <> 'discarded'
GROUP BY g.order_id;

-- ── 4. Sidebar counts: exclude discarded from parking ────────────────────
-- Other terminal-stage filters already key off specific stages (soaking,
-- cutting, …) that can't match 'discarded', so only parking needs a fix.
CREATE OR REPLACE FUNCTION get_workshop_sidebar_counts()
RETURNS JSONB
LANGUAGE SQL
STABLE
AS $$
    WITH scoped AS (
        SELECT g.*
        FROM garments g
        INNER JOIN orders o ON o.id = g.order_id AND o.checkout_status::text = 'confirmed'
    )
    SELECT jsonb_build_object(
        'receiving',     COUNT(*) FILTER (WHERE location::text IN ('transit_to_workshop','lost_in_transit')),
        'parking',       COUNT(*) FILTER (WHERE location::text = 'workshop' AND NOT in_production AND piece_stage::text <> 'waiting_for_acceptance' AND piece_stage::text <> 'discarded'),
        'scheduler',     COUNT(*) FILTER (WHERE location::text = 'workshop' AND in_production AND production_plan IS NULL AND piece_stage::text = 'waiting_cut'),
        'soaking',       COUNT(*) FILTER (WHERE location::text = 'workshop' AND piece_stage::text = 'soaking'),
        'cutting',       COUNT(*) FILTER (WHERE location::text = 'workshop' AND piece_stage::text = 'cutting'),
        'post_cutting',  COUNT(*) FILTER (WHERE location::text = 'workshop' AND piece_stage::text = 'post_cutting'),
        'sewing',        COUNT(*) FILTER (WHERE location::text = 'workshop' AND piece_stage::text = 'sewing'),
        'finishing',     COUNT(*) FILTER (WHERE location::text = 'workshop' AND piece_stage::text = 'finishing'),
        'ironing',       COUNT(*) FILTER (WHERE location::text = 'workshop' AND piece_stage::text = 'ironing'),
        'quality_check', COUNT(*) FILTER (WHERE location::text = 'workshop' AND piece_stage::text = 'quality_check'),
        'dispatch',      COUNT(*) FILTER (WHERE location::text = 'workshop' AND piece_stage::text = 'ready_for_dispatch')
    )
    FROM scoped;
$$;

-- ── 5. Showroom orders: treat discarded like completed in the gx subquery
-- The existing body checks `piece_stage <> 'completed'` in several places.
-- Widening these to "not terminal" keeps discarded out of has_shop_items,
-- finals_still_out, and the shop_item_done heuristic.
CREATE OR REPLACE FUNCTION get_showroom_orders_page(
    p_brand TEXT,
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 20,
    p_search_id TEXT DEFAULT NULL,
    p_customer TEXT DEFAULT NULL,
    p_stage TEXT DEFAULT NULL,
    p_reminder_statuses TEXT[] DEFAULT NULL,
    p_delivery_date_start TEXT DEFAULT NULL,
    p_delivery_date_end TEXT DEFAULT NULL,
    p_sort_by TEXT DEFAULT 'created_desc'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_result JSONB;
    v_page_size INT := GREATEST(COALESCE(p_page_size, 20), 1);
    v_offset INT := GREATEST(COALESCE(p_page, 1) - 1, 0) * v_page_size;
    v_search TEXT := LOWER(TRIM(COALESCE(p_search_id, '')));
    v_customer TEXT := LOWER(TRIM(COALESCE(p_customer, '')));
    v_date_start TIMESTAMP := CASE WHEN NULLIF(p_delivery_date_start, '') IS NULL THEN NULL ELSE p_delivery_date_start::TIMESTAMP END;
    v_date_end TIMESTAMP := CASE WHEN NULLIF(p_delivery_date_end, '') IS NULL THEN NULL ELSE p_delivery_date_end::TIMESTAMP + INTERVAL '1 day' END;
    v_reminders TEXT[] := COALESCE(p_reminder_statuses, ARRAY[]::TEXT[]);
BEGIN
    WITH base AS (
        SELECT
            o.id,
            o.customer_id,
            o.order_date,
            o.brand::text AS brand,
            o.checkout_status::text AS checkout_status,
            o.order_type::text AS order_type,
            o.payment_type::text AS payment_type,
            o.order_total,
            o.paid,
            o.discount_value,
            o.delivery_charge,
            o.express_charge,
            o.soaking_charge,
            o.shelf_charge,
            wo.invoice_number,
            wo.delivery_date,
            wo.home_delivery,
            wo.advance,
            wo.fabric_charge,
            wo.stitching_charge,
            wo.style_charge,
            wo.order_phase::text AS order_phase,
            wo.linked_order_id,
            wo.r1_date, wo.r1_notes,
            wo.r2_date, wo.r2_notes,
            wo.r3_date, wo.r3_notes,
            wo.call_reminder_date, wo.call_status, wo.call_notes,
            wo.escalation_date, wo.escalation_notes,
            c.name AS c_name,
            c.nick_name AS c_nick_name,
            c.phone AS c_phone,
            c.country_code AS c_country_code,
            jsonb_build_object(
                'id', c.id,
                'name', c.name,
                'nick_name', c.nick_name,
                'phone', c.phone,
                'country_code', c.country_code
            ) AS customer_json,
            agg.showroom_label
        FROM orders o
        INNER JOIN work_orders wo ON wo.order_id = o.id
        LEFT JOIN customers c ON c.id = o.customer_id
        CROSS JOIN LATERAL (
            SELECT
                CASE
                    WHEN NOT g.has_shop_items AND g.finals_in_transit THEN 'awaiting_finals'
                    WHEN NOT g.has_shop_items THEN NULL
                    WHEN g.has_alteration_needing_work THEN 'alteration_in'
                    WHEN g.has_brova_awaiting_trial THEN 'brova_trial'
                    WHEN g.has_garment_needing_action THEN 'needs_action'
                    WHEN g.has_shop_brova AND g.finals_still_out THEN 'awaiting_finals'
                    WHEN g.all_shop_items_done AND NOT g.garments_still_out THEN 'ready_for_pickup'
                    WHEN g.garments_still_out THEN 'partial_ready'
                    ELSE NULL
                END AS showroom_label,
                g.has_shop_items,
                g.finals_in_transit
            FROM (
                SELECT
                    COALESCE(bool_or(shop_active), false) AS has_shop_items,
                    COALESCE(bool_or(
                        shop_active
                        AND acceptance_status IS DISTINCT FROM TRUE
                        AND is_alteration
                        AND (piece_stage = 'awaiting_trial' OR feedback_status IN ('needs_repair', 'needs_redo'))
                    ), false) AS has_alteration_needing_work,
                    COALESCE(bool_or(
                        shop_active
                        AND garment_type = 'brova'
                        AND piece_stage = 'awaiting_trial'
                    ), false) AS has_brova_awaiting_trial,
                    COALESCE(bool_or(
                        shop_active
                        AND feedback_status IN ('needs_repair', 'needs_redo')
                    ), false) AS has_garment_needing_action,
                    COALESCE(bool_or(
                        not_terminal AND garment_type = 'final' AND location <> 'shop'
                    ), false) AS finals_still_out,
                    COALESCE(bool_or(
                        not_terminal AND garment_type = 'final' AND location = 'transit_to_shop'
                    ), false) AS finals_in_transit,
                    COALESCE(bool_or(not_terminal AND location <> 'shop'), false) AS garments_still_out,
                    COALESCE(bool_or(shop_active AND garment_type = 'brova'), false) AS has_shop_brova,
                    COALESCE(bool_and(NOT shop_active OR shop_item_done), true) AS all_shop_items_done
                FROM (
                    SELECT
                        g2.piece_stage::text NOT IN ('completed', 'discarded') AS not_terminal,
                        g2.location::text = 'shop'
                            AND g2.piece_stage::text NOT IN ('completed', 'discarded')
                            AND COALESCE(g2.trip_number, 0) > 0 AS shop_active,
                        g2.garment_type::text AS garment_type,
                        g2.piece_stage::text AS piece_stage,
                        g2.location::text AS location,
                        g2.acceptance_status,
                        g2.feedback_status,
                        (g2.garment_type::text = 'final' AND COALESCE(g2.trip_number, 1) >= 2)
                            OR (g2.garment_type::text = 'brova' AND COALESCE(g2.trip_number, 1) >= 4) AS is_alteration,
                        (
                            g2.acceptance_status = TRUE
                            OR (
                                g2.garment_type::text = 'final'
                                AND g2.piece_stage::text = 'ready_for_pickup'
                                AND g2.feedback_status IS DISTINCT FROM 'needs_repair'
                                AND g2.feedback_status IS DISTINCT FROM 'needs_redo'
                            )
                        ) AS shop_item_done
                    FROM garments g2
                    WHERE g2.order_id = o.id
                ) gx
            ) g
        ) agg
        WHERE o.brand::text = p_brand
          AND o.checkout_status::text = 'confirmed'
          AND o.order_type::text = 'WORK'
          AND wo.order_phase::text = 'in_progress'
          AND (agg.has_shop_items OR agg.finals_in_transit)
    ),
    pre_stage AS (
        SELECT * FROM base
        WHERE showroom_label IS NOT NULL
          AND (
            v_search = ''
            OR LOWER(id::text) LIKE '%' || v_search || '%'
            OR COALESCE(invoice_number::text, '') LIKE '%' || v_search || '%'
          )
          AND (
            v_customer = ''
            OR LOWER(COALESCE(c_name, '')) LIKE '%' || v_customer || '%'
            OR LOWER(COALESCE(c_nick_name, '')) LIKE '%' || v_customer || '%'
            OR COALESCE(c_phone, '') LIKE '%' || v_customer || '%'
            OR LOWER(COALESCE(c_country_code, '') || ' ' || COALESCE(c_phone, '')) LIKE '%' || v_customer || '%'
          )
          AND (v_date_start IS NULL OR delivery_date >= v_date_start)
          AND (v_date_end IS NULL OR delivery_date < v_date_end)
          AND (NOT ('r1_done'     = ANY(v_reminders)) OR r1_date IS NOT NULL)
          AND (NOT ('r1_pending'  = ANY(v_reminders)) OR r1_date IS NULL)
          AND (NOT ('r2_done'     = ANY(v_reminders)) OR r2_date IS NOT NULL)
          AND (NOT ('r2_pending'  = ANY(v_reminders)) OR r2_date IS NULL)
          AND (NOT ('r3_done'     = ANY(v_reminders)) OR r3_date IS NOT NULL)
          AND (NOT ('r3_pending'  = ANY(v_reminders)) OR r3_date IS NULL)
          AND (NOT ('call_done'   = ANY(v_reminders)) OR (call_status IS NOT NULL OR call_reminder_date IS NOT NULL))
          AND (NOT ('escalated'   = ANY(v_reminders)) OR escalation_date IS NOT NULL)
    ),
    stage_filtered AS (
        SELECT * FROM pre_stage
        WHERE NULLIF(p_stage, '') IS NULL
           OR p_stage = 'all'
           OR showroom_label = p_stage
    ),
    ranked AS (
        SELECT
            sf.*,
            row_number() OVER (
                ORDER BY
                    CASE WHEN p_sort_by = 'deliveryDate_asc'  THEN delivery_date END ASC  NULLS LAST,
                    CASE WHEN p_sort_by = 'deliveryDate_desc' THEN delivery_date END DESC NULLS LAST,
                    CASE WHEN p_sort_by = 'balance_desc'      THEN (COALESCE(order_total, 0) - COALESCE(paid, 0)) END DESC NULLS LAST,
                    id DESC
            ) AS rn
        FROM stage_filtered sf
    ),
    page AS (
        SELECT * FROM ranked
        ORDER BY rn
        LIMIT v_page_size
        OFFSET v_offset
    ),
    page_rows AS (
        SELECT
            p.rn,
            jsonb_build_object(
                'id', p.id,
                'customer_id', p.customer_id,
                'order_date', p.order_date,
                'brand', p.brand,
                'checkout_status', p.checkout_status,
                'order_type', p.order_type,
                'payment_type', p.payment_type,
                'order_total', p.order_total,
                'paid', p.paid,
                'discount_value', p.discount_value,
                'delivery_charge', p.delivery_charge,
                'express_charge', p.express_charge,
                'soaking_charge', p.soaking_charge,
                'shelf_charge', p.shelf_charge,
                'invoice_number', p.invoice_number,
                'delivery_date', p.delivery_date,
                'home_delivery', p.home_delivery,
                'advance', p.advance,
                'fabric_charge', p.fabric_charge,
                'stitching_charge', p.stitching_charge,
                'style_charge', p.style_charge,
                'order_phase', p.order_phase,
                'linked_order_id', p.linked_order_id,
                'r1_date', p.r1_date, 'r1_notes', p.r1_notes,
                'r2_date', p.r2_date, 'r2_notes', p.r2_notes,
                'r3_date', p.r3_date, 'r3_notes', p.r3_notes,
                'call_reminder_date', p.call_reminder_date,
                'call_status', p.call_status,
                'call_notes', p.call_notes,
                'escalation_date', p.escalation_date,
                'escalation_notes', p.escalation_notes,
                'customer', p.customer_json,
                'showroom_label', p.showroom_label,
                'garments', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'id', g.id,
                        'garment_id', g.garment_id,
                        'piece_stage', g.piece_stage,
                        'garment_type', g.garment_type,
                        'location', g.location,
                        'acceptance_status', g.acceptance_status,
                        'feedback_status', g.feedback_status,
                        'trip_number', g.trip_number,
                        'color', g.color,
                        'style', g.style,
                        'delivery_date', g.delivery_date,
                        'fabric_source', g.fabric_source,
                        'fabric', CASE WHEN f.id IS NULL THEN NULL ELSE jsonb_build_object('name', f.name) END
                    ) ORDER BY g.garment_id NULLS LAST)
                    FROM garments g
                    LEFT JOIN fabrics f ON f.id = g.fabric_id
                    WHERE g.order_id = p.id
                ), '[]'::jsonb)
            ) AS row_json
        FROM page p
    )
    SELECT jsonb_build_object(
        'data',        COALESCE((SELECT jsonb_agg(row_json ORDER BY rn) FROM page_rows), '[]'::jsonb),
        'total_count', (SELECT COUNT(*) FROM stage_filtered),
        'stats', (
            SELECT jsonb_build_object(
                'total',           COUNT(*),
                'ready',           COUNT(*) FILTER (WHERE showroom_label = 'ready_for_pickup'),
                'brova_trial',     COUNT(*) FILTER (WHERE showroom_label = 'brova_trial'),
                'needs_action',    COUNT(*) FILTER (WHERE showroom_label = 'needs_action'),
                'partial_ready',   COUNT(*) FILTER (WHERE showroom_label = 'partial_ready'),
                'alteration_in',   COUNT(*) FILTER (WHERE showroom_label = 'alteration_in'),
                'awaiting_finals', COUNT(*) FILTER (WHERE showroom_label = 'awaiting_finals')
            )
            FROM pre_stage
        )
    )
    INTO v_result;

    RETURN v_result;
END;
$$;
