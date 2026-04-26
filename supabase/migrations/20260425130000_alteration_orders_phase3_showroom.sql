-- Phase 3 — Showroom RPC: include ALTERATION orders.
--
-- Previously the showroom page only surfaced WORK orders. Alteration orders
-- (order_type='ALTERATION', extension row in alteration_orders) now flow
-- through the same showroom UI. The RPC is rewritten to:
--
-- - LEFT JOIN both work_orders and alteration_orders (so neither is required).
-- - COALESCE invoice_number / order_phase across the two extension tables.
-- - Derive delivery_date / home_delivery for alteration orders from their
--   garments (alteration_orders has no order-level delivery; per-garment dates
--   live on garments.delivery_date and garments.home_delivery).
-- - Treat returning alteration garments (alteration + trip>=2) as eligible
--   for the alteration_in label.
-- - Treat alteration garments at piece_stage='ready_for_pickup' as a
--   "shop_item_done" condition (parity with finals).
--
-- Filter expanded: order_type IN ('WORK','ALTERATION'); order_phase filter
-- coalesces across the two tables.

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
            COALESCE(wo.invoice_number, ao.invoice_number) AS invoice_number,
            COALESCE(wo.delivery_date, alt_meta.delivery_date) AS delivery_date,
            COALESCE(wo.home_delivery, alt_meta.home_delivery) AS home_delivery,
            wo.advance,
            wo.fabric_charge,
            wo.stitching_charge,
            wo.style_charge,
            COALESCE(wo.order_phase::text, ao.order_phase::text) AS order_phase,
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
        LEFT JOIN work_orders wo ON wo.order_id = o.id
        LEFT JOIN alteration_orders ao ON ao.order_id = o.id
        LEFT JOIN customers c ON c.id = o.customer_id
        LEFT JOIN LATERAL (
            SELECT
                MIN(g.delivery_date) AS delivery_date,
                bool_or(COALESCE(g.home_delivery, FALSE)) AS home_delivery
            FROM garments g
            WHERE g.order_id = o.id
        ) alt_meta ON o.order_type::text = 'ALTERATION'
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
                        not_completed AND garment_type = 'final' AND location <> 'shop'
                    ), false) AS finals_still_out,
                    COALESCE(bool_or(
                        not_completed AND garment_type = 'final' AND location = 'transit_to_shop'
                    ), false) AS finals_in_transit,
                    COALESCE(bool_or(not_completed AND location <> 'shop'), false) AS garments_still_out,
                    COALESCE(bool_or(shop_active AND garment_type = 'brova'), false) AS has_shop_brova,
                    COALESCE(bool_and(NOT shop_active OR shop_item_done), true) AS all_shop_items_done
                FROM (
                    SELECT
                        g2.piece_stage::text <> 'completed' AS not_completed,
                        g2.location::text = 'shop'
                            AND g2.piece_stage::text <> 'completed'
                            AND COALESCE(g2.trip_number, 0) > 0 AS shop_active,
                        g2.garment_type::text AS garment_type,
                        g2.piece_stage::text AS piece_stage,
                        g2.location::text AS location,
                        g2.acceptance_status,
                        g2.feedback_status,
                        (g2.garment_type::text = 'final' AND COALESCE(g2.trip_number, 1) >= 2)
                            OR (g2.garment_type::text = 'brova' AND COALESCE(g2.trip_number, 1) >= 4)
                            OR (g2.garment_type::text = 'alteration' AND COALESCE(g2.trip_number, 1) >= 2) AS is_alteration,
                        (
                            g2.acceptance_status = TRUE
                            OR (
                                g2.garment_type::text IN ('final', 'alteration')
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
          AND o.order_type::text IN ('WORK', 'ALTERATION')
          AND COALESCE(wo.order_phase::text, ao.order_phase::text) = 'in_progress'
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
