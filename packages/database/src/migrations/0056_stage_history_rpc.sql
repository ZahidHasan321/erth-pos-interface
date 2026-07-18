-- 0056: server-side filtering for the terminal stage-history page.
--
-- The workshop history view used to fetch EVERY garment whose stage_timings /
-- trip_history was non-null and filter to the selected day in the browser.
-- PostgREST caps a response at 1000 rows, so once more than 1000 garments had
-- history the page silently returned only the oldest 1000 by id and recent
-- days came back empty.
--
-- This function does the day filter in SQL and returns SETOF garments, so the
-- client still embeds order/customer/fabric the same way it always did.
-- SECURITY INVOKER on purpose: garment RLS (brand isolation) must apply
-- exactly as it did for the direct table query.
--
-- Idempotent, safe to re-run.

DROP FUNCTION IF EXISTS get_stage_history_garments(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION get_stage_history_garments(
  p_stage TEXT,
  p_date  TEXT,          -- local (Kuwait) calendar day, 'YYYY-MM-DD'
  p_start TIMESTAMPTZ,   -- that day's start, as an absolute instant
  p_end   TIMESTAMPTZ    -- that day's end, as an absolute instant
)
RETURNS SETOF garments
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT g.*
  FROM garments g
  JOIN orders o ON o.id = g.order_id AND o.checkout_status = 'confirmed'
  WHERE
    CASE
      WHEN p_stage = 'soaking' THEN
        g.soaking_completed_at >= p_start AND g.soaking_completed_at <= p_end

      -- QC attempts store only the local calendar day they were recorded on,
      -- so they are matched by string equality, not by the instant range.
      WHEN p_stage = 'quality_check' THEN
        jsonb_typeof(g.trip_history) = 'array'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(g.trip_history) AS t
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(t -> 'qc_attempts') = 'array'
                 THEN t -> 'qc_attempts' ELSE '[]'::jsonb END
          ) AS a
          WHERE a ->> 'date' = p_date
        )

      ELSE
        jsonb_typeof(g.stage_timings -> p_stage) = 'array'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(g.stage_timings -> p_stage) AS e
          WHERE e ->> 'completed_at' IS NOT NULL
            AND (e ->> 'completed_at')::timestamptz >= p_start
            AND (e ->> 'completed_at')::timestamptz <= p_end
        )
    END
  ORDER BY g.id;
$$;

GRANT EXECUTE ON FUNCTION get_stage_history_garments(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, anon, service_role;
