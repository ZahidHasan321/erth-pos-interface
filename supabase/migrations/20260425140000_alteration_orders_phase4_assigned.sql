-- Phase 4 — Production Tracker (assigned view): include ALTERATION orders.
--
-- Previously the workshop's Production Tracker (assigned/index.tsx) only
-- surfaced WORK orders. Alteration orders (order_type='ALTERATION', extension
-- row in alteration_orders) now flow through the same UI. Touched RPCs:
--
-- - assigned_order_agg view: adds has_alteration / alteration_count /
--   any_home_delivery (for alteration orders, home_delivery lives on garments).
-- - assigned_order_status_label: signature gains p_has_alteration so the label
--   cascade can return 'Alteration in production' as the workshop fallback for
--   alteration-only orders. Old signature is dropped and recreated.
-- - get_assigned_orders_page: INNER JOIN work_orders → LEFT JOIN, plus
--   LEFT JOIN alteration_orders. invoice_number / delivery_date /
--   home_delivery / order_phase coalesced across both extension tables.
--   Filter expanded to order_type IN ('WORK','ALTERATION'). New 'order_type',
--   'has_alteration', 'alteration_count' fields on each row.
-- - get_assigned_overview: same join + filter changes; order_type and
--   alteration counts surfaced where work-order assumptions previously lived.
--
-- Mirrors the Phase 3 showroom-RPC migration.

-- ── 1. assigned_order_agg view ───────────────────────────────────────────
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
    MIN(g.delivery_date)                                           AS earliest_garment_delivery,
    -- Alteration-order support: customer-brought garments use garment_type='alteration'.
    bool_or(g.garment_type::text = 'alteration')                   AS has_alteration,
    COUNT(*) FILTER (WHERE g.garment_type::text = 'alteration')    AS alteration_count,
    -- For alteration orders, alteration_orders has no order-level delivery date or
    -- home_delivery; both live on the garment rows (uniform across the order).
    bool_or(COALESCE(g.home_delivery, FALSE))                      AS any_home_delivery
FROM garments g
GROUP BY g.order_id;

-- ── 2. assigned_order_status_label (new signature) ───────────────────────
DROP FUNCTION IF EXISTS assigned_order_status_label(
    BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN
);

CREATE OR REPLACE FUNCTION assigned_order_status_label(
    p_all_at_shop BOOLEAN,
    p_has_workshop_garment BOOLEAN,
    p_all_workshop_ready BOOLEAN,
    p_has_transit_to_shop BOOLEAN,
    p_only_parked_at_workshop BOOLEAN,
    p_brovas_in_transit_to_shop BOOLEAN,
    p_finals_active_workshop BOOLEAN,
    p_brovas_all_at_shop BOOLEAN,
    p_has_any_brova BOOLEAN,
    p_any_brova_accepted BOOLEAN,
    p_finals_parked BOOLEAN,
    p_brovas_at_workshop BOOLEAN,
    p_has_alteration BOOLEAN
) RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_all_at_shop
            THEN 'At shop'
        WHEN p_has_workshop_garment AND p_all_workshop_ready
            THEN 'Ready for dispatch'
        WHEN p_has_transit_to_shop AND (NOT p_has_workshop_garment OR p_only_parked_at_workshop)
            THEN 'In transit to shop'
        WHEN p_brovas_in_transit_to_shop AND NOT p_finals_active_workshop
            THEN 'Brovas in transit'
        WHEN p_has_any_brova AND p_brovas_all_at_shop AND NOT p_finals_active_workshop AND p_finals_parked AND p_any_brova_accepted
            THEN 'Awaiting finals release'
        WHEN p_has_any_brova AND p_brovas_all_at_shop AND NOT p_finals_active_workshop AND p_finals_parked
            THEN 'Awaiting brova trial'
        WHEN p_has_any_brova AND p_brovas_all_at_shop AND NOT p_finals_active_workshop
            THEN 'At shop'
        WHEN p_finals_active_workshop
            THEN 'Finals in production'
        WHEN p_brovas_at_workshop
            THEN 'Brovas in production'
        WHEN p_has_alteration
            THEN 'Alteration in production'
        ELSE 'In production'
    END;
$$;

-- ── 3. get_assigned_overview RPC ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_assigned_overview()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH base AS (
        SELECT
            o.id                           AS order_id,
            o.brand::text                  AS brand,
            o.order_type::text             AS order_type,
            COALESCE(wo.invoice_number, ao.invoice_number)         AS invoice_number,
            COALESCE(wo.delivery_date, agg.earliest_garment_delivery) AS delivery_date,
            COALESCE(wo.home_delivery, agg.any_home_delivery)      AS home_delivery,
            c.name                         AS customer_name,
            c.phone                        AS customer_phone,
            c.country_code                 AS customer_country_code,
            agg.garments_count,
            COALESCE(agg.any_express, false) AS any_express,
            agg.any_returns,
            agg.max_trip,
            agg.is_active,
            agg.has_workshop_garment,
            agg.all_workshop_ready,
            agg.shop_count,
            agg.transit_count,
            COALESCE(agg.has_alteration, false) AS has_alteration,
            CASE WHEN COALESCE(wo.delivery_date, agg.earliest_garment_delivery) IS NULL THEN NULL
                 ELSE CEIL(EXTRACT(EPOCH FROM (COALESCE(wo.delivery_date, agg.earliest_garment_delivery) - NOW())) / 86400.0)::INT
            END AS days_to_delivery
        FROM orders o
        LEFT JOIN work_orders wo ON wo.order_id = o.id
        LEFT JOIN alteration_orders ao ON ao.order_id = o.id
        LEFT JOIN customers c ON c.id = o.customer_id
        LEFT JOIN assigned_order_agg agg ON agg.order_id = o.id
        WHERE o.checkout_status::text = 'confirmed'
          AND o.order_type::text IN ('WORK', 'ALTERATION')
          AND COALESCE(wo.order_phase::text, ao.order_phase::text) = 'in_progress'
    ),
    classified AS (
        SELECT
            b.*,
            (b.days_to_delivery IS NOT NULL AND b.days_to_delivery < 0)                AS is_overdue,
            (b.days_to_delivery IS NOT NULL AND b.days_to_delivery BETWEEN 0 AND 2)    AS is_due_soon,
            (b.has_workshop_garment AND b.all_workshop_ready)                          AS is_ready
        FROM base b
    ),
    stats AS (
        SELECT
            COUNT(*) FILTER (WHERE is_overdue)                         AS overdue_count,
            COUNT(*) FILTER (WHERE is_due_soon)                        AS due_soon_count,
            COUNT(*) FILTER (WHERE is_active)                          AS active_count,
            COUNT(*) FILTER (WHERE is_ready)                           AS ready_count,
            COUNT(*) FILTER (WHERE any_returns)                        AS returns_count,
            COUNT(*)                                                   AS total_count,
            COALESCE(SUM(shop_count), 0)::INT                          AS at_shop_count,
            COALESCE(SUM(transit_count), 0)::INT                       AS in_transit_count
        FROM classified
    ),
    sorted AS (
        SELECT c.*,
            row_number() OVER (
                ORDER BY
                    (is_overdue)::int DESC,
                    (any_express)::int DESC,
                    COALESCE(days_to_delivery, 999) ASC,
                    order_id ASC
            ) AS urgency_rn
        FROM classified c
    ),
    quick_list_overdue AS (
        SELECT s.urgency_rn, jsonb_build_object(
            'order_id',       s.order_id,
            'customer_name',  s.customer_name,
            'brand',          s.brand,
            'express',        s.any_express,
            'delivery_date',  s.delivery_date,
            'days_to_delivery', s.days_to_delivery,
            'garments_count', s.garments_count,
            'max_trip',       s.max_trip,
            'brova_count',    COALESCE((SELECT COUNT(*) FROM garments gg WHERE gg.order_id = s.order_id AND gg.garment_type::text = 'brova'), 0),
            'final_count',    COALESCE((SELECT COUNT(*) FROM garments gg WHERE gg.order_id = s.order_id AND gg.garment_type::text = 'final'), 0)
        ) AS row_json
        FROM sorted s
        WHERE s.is_overdue
        ORDER BY s.urgency_rn
        LIMIT 5
    ),
    quick_list_due_soon AS (
        SELECT s.urgency_rn, jsonb_build_object(
            'order_id',       s.order_id,
            'customer_name',  s.customer_name,
            'brand',          s.brand,
            'express',        s.any_express,
            'delivery_date',  s.delivery_date,
            'days_to_delivery', s.days_to_delivery,
            'garments_count', s.garments_count,
            'max_trip',       s.max_trip,
            'brova_count',    COALESCE((SELECT COUNT(*) FROM garments gg WHERE gg.order_id = s.order_id AND gg.garment_type::text = 'brova'), 0),
            'final_count',    COALESCE((SELECT COUNT(*) FROM garments gg WHERE gg.order_id = s.order_id AND gg.garment_type::text = 'final'), 0)
        ) AS row_json
        FROM sorted s
        WHERE s.is_due_soon
        ORDER BY s.urgency_rn
        LIMIT 5
    ),
    quick_list_ready AS (
        SELECT s.urgency_rn, jsonb_build_object(
            'order_id',       s.order_id,
            'customer_name',  s.customer_name,
            'brand',          s.brand,
            'express',        s.any_express,
            'delivery_date',  s.delivery_date,
            'days_to_delivery', s.days_to_delivery,
            'garments_count', s.garments_count,
            'max_trip',       s.max_trip,
            'brova_count',    COALESCE((SELECT COUNT(*) FROM garments gg WHERE gg.order_id = s.order_id AND gg.garment_type::text = 'brova'), 0),
            'final_count',    COALESCE((SELECT COUNT(*) FROM garments gg WHERE gg.order_id = s.order_id AND gg.garment_type::text = 'final'), 0)
        ) AS row_json
        FROM sorted s
        WHERE s.is_ready
        ORDER BY s.urgency_rn
        LIMIT 5
    ),
    quick_list_returns AS (
        SELECT s.urgency_rn, jsonb_build_object(
            'order_id',       s.order_id,
            'customer_name',  s.customer_name,
            'brand',          s.brand,
            'express',        s.any_express,
            'delivery_date',  s.delivery_date,
            'days_to_delivery', s.days_to_delivery,
            'garments_count', s.garments_count,
            'max_trip',       s.max_trip,
            'brova_count',    COALESCE((SELECT COUNT(*) FROM garments gg WHERE gg.order_id = s.order_id AND gg.garment_type::text = 'brova'), 0),
            'final_count',    COALESCE((SELECT COUNT(*) FROM garments gg WHERE gg.order_id = s.order_id AND gg.garment_type::text = 'final'), 0)
        ) AS row_json
        FROM sorted s
        WHERE s.any_returns
        ORDER BY s.urgency_rn
        LIMIT 5
    ),
    pipeline_garments AS (
        SELECT jsonb_agg(row_json ORDER BY rn) AS garments
        FROM (
            SELECT
                row_number() OVER (ORDER BY g.order_id, g.garment_id) AS rn,
                jsonb_build_object(
                    'id',              g.id,
                    'order_id',        g.order_id,
                    'garment_id',      g.garment_id,
                    'garment_type',    g.garment_type,
                    'piece_stage',     g.piece_stage,
                    'location',        g.location,
                    'trip_number',     g.trip_number,
                    'express',         g.express,
                    'customer_name',   cc.name,
                    'style_name',      COALESCE(st.name, g.style),
                    'production_plan', g.production_plan,
                    'worker_history',  g.worker_history
                ) AS row_json
            FROM garments g
            INNER JOIN orders o2 ON o2.id = g.order_id AND o2.checkout_status::text = 'confirmed'
              AND o2.order_type::text IN ('WORK', 'ALTERATION')
            LEFT JOIN work_orders wo2 ON wo2.order_id = o2.id
            LEFT JOIN alteration_orders ao2 ON ao2.order_id = o2.id
            LEFT JOIN customers cc ON cc.id = o2.customer_id
            LEFT JOIN styles st ON st.id = g.style_id
            WHERE COALESCE(wo2.order_phase::text, ao2.order_phase::text) = 'in_progress'
              AND g.location::text = 'workshop'
              AND g.piece_stage::text IN ('soaking','cutting','post_cutting','sewing','finishing','ironing','quality_check','ready_for_dispatch','waiting_cut')
        ) s
    )
    SELECT jsonb_build_object(
        'stats', jsonb_build_object(
            'overdue',    (SELECT overdue_count    FROM stats),
            'due_soon',   (SELECT due_soon_count   FROM stats),
            'active',     (SELECT active_count     FROM stats),
            'ready',      (SELECT ready_count      FROM stats),
            'returns',    (SELECT returns_count    FROM stats),
            'total',      (SELECT total_count      FROM stats),
            'at_shop',    (SELECT at_shop_count    FROM stats),
            'in_transit', (SELECT in_transit_count FROM stats)
        ),
        'quick_lists', jsonb_build_object(
            'overdue',  COALESCE((SELECT jsonb_agg(row_json ORDER BY urgency_rn) FROM quick_list_overdue),  '[]'::jsonb),
            'due_soon', COALESCE((SELECT jsonb_agg(row_json ORDER BY urgency_rn) FROM quick_list_due_soon), '[]'::jsonb),
            'ready',    COALESCE((SELECT jsonb_agg(row_json ORDER BY urgency_rn) FROM quick_list_ready),    '[]'::jsonb),
            'returns',  COALESCE((SELECT jsonb_agg(row_json ORDER BY urgency_rn) FROM quick_list_returns),  '[]'::jsonb)
        ),
        'pipeline_garments', COALESCE((SELECT garments FROM pipeline_garments), '[]'::jsonb)
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

-- ── 4. get_assigned_orders_page RPC ──────────────────────────────────────
CREATE OR REPLACE FUNCTION get_assigned_orders_page(
    p_tab TEXT DEFAULT 'all',
    p_chips TEXT[] DEFAULT NULL,
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_result JSONB;
    v_page_size INT := GREATEST(COALESCE(p_page_size, 20), 1);
    v_offset INT := GREATEST(COALESCE(p_page, 1) - 1, 0) * v_page_size;
    v_chips TEXT[] := COALESCE(p_chips, ARRAY[]::TEXT[]);
    v_chip_express BOOLEAN := 'express'  = ANY(v_chips);
    v_chip_delivery BOOLEAN := 'delivery' = ANY(v_chips);
    v_chip_soaking BOOLEAN  := 'soaking'  = ANY(v_chips);
BEGIN
    WITH base AS (
        SELECT
            o.id                             AS order_id,
            o.brand::text                    AS brand,
            o.order_type::text               AS order_type,
            COALESCE(wo.invoice_number, ao.invoice_number)         AS invoice_number,
            COALESCE(wo.delivery_date, agg.earliest_garment_delivery) AS delivery_date,
            COALESCE(wo.home_delivery, agg.any_home_delivery)      AS home_delivery,
            c.name                           AS customer_name,
            c.phone                          AS customer_phone,
            c.country_code                   AS customer_country_code,
            agg.garments_count,
            COALESCE(agg.brova_count, 0) AS brova_count,
            COALESCE(agg.final_count, 0) AS final_count,
            COALESCE(agg.alteration_count, 0) AS alteration_count,
            agg.earliest_garment_delivery,
            COALESCE(agg.any_express, false) AS any_express,
            COALESCE(agg.any_soaking, false) AS any_soaking,
            agg.any_returns,
            agg.max_trip,
            agg.is_active,
            agg.has_workshop_garment,
            agg.all_workshop_ready,
            agg.all_at_shop,
            agg.has_transit_to_shop,
            agg.only_parked_at_workshop,
            agg.brovas_in_transit_to_shop,
            agg.finals_active_workshop,
            agg.brovas_all_at_shop_or_absent,
            agg.has_any_brova,
            agg.any_brova_accepted,
            agg.finals_parked,
            agg.brovas_at_workshop,
            COALESCE(agg.has_alteration, false) AS has_alteration,
            CASE WHEN COALESCE(wo.delivery_date, agg.earliest_garment_delivery) IS NULL THEN NULL
                 ELSE CEIL(EXTRACT(EPOCH FROM (COALESCE(wo.delivery_date, agg.earliest_garment_delivery) - NOW())) / 86400.0)::INT
            END AS days_to_delivery
        FROM orders o
        LEFT JOIN work_orders wo ON wo.order_id = o.id
        LEFT JOIN alteration_orders ao ON ao.order_id = o.id
        LEFT JOIN customers c ON c.id = o.customer_id
        LEFT JOIN assigned_order_agg agg ON agg.order_id = o.id
        WHERE o.checkout_status::text = 'confirmed'
          AND o.order_type::text IN ('WORK', 'ALTERATION')
          AND COALESCE(wo.order_phase::text, ao.order_phase::text) = 'in_progress'
    ),
    classified AS (
        SELECT
            b.*,
            (b.days_to_delivery IS NOT NULL AND b.days_to_delivery < 0)              AS is_overdue,
            (b.days_to_delivery IS NOT NULL AND b.days_to_delivery BETWEEN 0 AND 2)  AS is_due_soon,
            (b.has_workshop_garment AND b.all_workshop_ready)                        AS is_ready
        FROM base b
    ),
    tab_filtered AS (
        SELECT * FROM classified
        WHERE CASE
            WHEN p_tab = 'production' THEN is_active
            WHEN p_tab = 'ready'      THEN is_ready
            WHEN p_tab = 'attention'  THEN (is_overdue OR is_due_soon OR any_returns)
            WHEN p_tab = 'all'        THEN TRUE
            ELSE TRUE
        END
    ),
    chip_counts AS (
        SELECT
            COUNT(*) FILTER (WHERE any_express)     AS express_count,
            COUNT(*) FILTER (WHERE home_delivery)   AS delivery_count,
            COUNT(*) FILTER (WHERE any_soaking)     AS soaking_count
        FROM tab_filtered
    ),
    chip_filtered AS (
        SELECT * FROM tab_filtered
        WHERE (NOT v_chip_express  OR any_express)
          AND (NOT v_chip_delivery OR home_delivery)
          AND (NOT v_chip_soaking  OR any_soaking)
    ),
    ranked AS (
        SELECT cf.*,
            row_number() OVER (
                ORDER BY
                    (is_overdue)::int DESC,
                    (any_express)::int DESC,
                    COALESCE(days_to_delivery, 999) ASC,
                    order_id ASC
            ) AS rn
        FROM chip_filtered cf
    ),
    page AS (
        SELECT * FROM ranked
        ORDER BY rn
        LIMIT v_page_size
        OFFSET v_offset
    ),
    page_garment_summaries AS (
        SELECT
            g.order_id,
            jsonb_agg(jsonb_build_object(
                'type',     g.garment_type::text,
                'stage',    g.piece_stage::text,
                'loc',      g.location::text,
                'fb',       g.feedback_status::text,
                'acc',      g.acceptance_status,
                'trip',     COALESCE(g.trip_number, 1),
                'gid',      g.garment_id,
                'in_prod',  COALESCE(g.in_production, false),
                'has_plan', g.production_plan IS NOT NULL,
                'started',  g.start_time IS NOT NULL,
                'express',  COALESCE(g.express, false),
                'del',      g.delivery_date,
                'qc_fail',  COALESCE((
                    SELECT bool_or((qca->>'result') = 'fail')
                    FROM jsonb_array_elements(g.trip_history) AS th
                    CROSS JOIN LATERAL jsonb_array_elements(
                        CASE WHEN th ? 'qc_attempts' THEN th->'qc_attempts' ELSE '[]'::jsonb END
                    ) AS qca
                    WHERE (th->>'trip')::int = COALESCE(g.trip_number, 1)
                ), false)
            ) ORDER BY
                CASE g.garment_type::text
                    WHEN 'brova' THEN 0
                    WHEN 'final' THEN 1
                    WHEN 'alteration' THEN 2
                    ELSE 3
                END,
                g.garment_id NULLS LAST
            ) AS summaries
        FROM garments g
        WHERE g.order_id IN (SELECT order_id FROM page)
        GROUP BY g.order_id
    ),
    page_rows AS (
        SELECT
            p.rn,
            jsonb_build_object(
                'order_id',        p.order_id,
                'order_type',      p.order_type,
                'invoice_number',  p.invoice_number,
                'customer_name',   p.customer_name,
                'customer_mobile', NULLIF(TRIM(BOTH FROM COALESCE(p.customer_country_code, '') || ' ' || COALESCE(p.customer_phone, '')), ''),
                'brands',          CASE WHEN p.brand IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(p.brand) END,
                'express',         p.any_express,
                'soaking',         p.any_soaking,
                'has_returns',     COALESCE(p.any_returns, false),
                'home_delivery',   p.home_delivery,
                'delivery_date',   p.delivery_date,
                'max_trip',        p.max_trip,
                'status_label',    assigned_order_status_label(
                    COALESCE(p.all_at_shop, false),
                    COALESCE(p.has_workshop_garment, false),
                    COALESCE(p.all_workshop_ready, false),
                    COALESCE(p.has_transit_to_shop, false),
                    COALESCE(p.only_parked_at_workshop, false),
                    COALESCE(p.brovas_in_transit_to_shop, false),
                    COALESCE(p.finals_active_workshop, false),
                    COALESCE(p.has_any_brova AND p.brovas_all_at_shop_or_absent, false),
                    COALESCE(p.has_any_brova, false),
                    COALESCE(p.any_brova_accepted, false),
                    COALESCE(p.finals_parked, false),
                    COALESCE(p.brovas_at_workshop, false),
                    COALESCE(p.has_alteration, false)
                ),
                'has_brova',         COALESCE(p.has_any_brova, false),
                'has_alteration',    COALESCE(p.has_alteration, false),
                'brova_count',       p.brova_count,
                'final_count',       p.final_count,
                'alteration_count',  p.alteration_count,
                'garments_count',    COALESCE(p.garments_count, 0),
                'earliest_garment_delivery', p.earliest_garment_delivery,
                'garment_summaries', COALESCE(pgs.summaries, '[]'::jsonb)
            ) AS row_json
        FROM page p
        LEFT JOIN page_garment_summaries pgs ON pgs.order_id = p.order_id
    )
    SELECT jsonb_build_object(
        'data',        COALESCE((SELECT jsonb_agg(row_json ORDER BY rn) FROM page_rows), '[]'::jsonb),
        'total_count', (SELECT COUNT(*) FROM chip_filtered),
        'chip_counts', jsonb_build_object(
            'express',  (SELECT express_count  FROM chip_counts),
            'delivery', (SELECT delivery_count FROM chip_counts),
            'soaking',  (SELECT soaking_count  FROM chip_counts)
        )
    )
    INTO v_result;

    RETURN v_result;
END;
$$;
