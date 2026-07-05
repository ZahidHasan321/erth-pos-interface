-- ════════════════════════════════════════════════════════════════════════════
-- 0052 — Admin Team: unified roster + performance-garment passthrough
-- ════════════════════════════════════════════════════════════════════════════
-- Reshapes the admin Team surface into ONE roster of people (shop + workshop)
-- with Location/Role filters, plus a passthrough that lets the admin dashboard
-- reuse the workshop's client-side performance compute (@repo/database) instead
-- of re-implementing it in SQL.
--
-- Same idiom as 0043–0047: SECURITY DEFINER + is_admin()-gated, cross-brand,
-- read-only, idempotent CREATE OR REPLACE. Supersedes admin_workshop_roster /
-- admin_staff_roster as the Team list source (those stay for back-compat).
--
--   admin_team_roster(p_location, p_role) — one row per PERSON:
--     • terminal workers  → grouped from `resources` (by linked user, else by
--       resource_name). classification='terminal', detail = worker performance.
--     • shop users         → classification='shop', detail = order-taking.
--     • workshop office / admins → classification='office', detail = profile only.
--   admin_performance_garments(p_from) — the same garment projection the workshop
--     reads directly (factory-wide, no brand scope — production is one factory).

-- ════════════════════════════════════════════════════════════════════════════
-- 1. admin_team_roster — the unified people list.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_team_roster(
  p_location TEXT DEFAULT NULL,  -- 'shop' | 'workshop' | NULL (all)
  p_role     TEXT DEFAULT NULL   -- a users.role, a production stage, 'terminal', or NULL (all)
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

  WITH
  -- Terminal people: every resource row, grouped into one person. Key on the
  -- linked login when present, else on the resource_name (a standalone floor
  -- worker with no account). A multi-stage worker folds into one row with an
  -- array of stages/units + a resources[] payload the detail page routes from.
  term AS (
    SELECT
      COALESCE(r.user_id::text, 'name:' || r.resource_name)   AS person_key,
      MAX(r.user_id::text)                                     AS user_id,
      COALESCE(MAX(u.name), MAX(r.resource_name))              AS name,
      (array_agg(r.id ORDER BY r.id))[1]                       AS primary_resource_id,
      COALESCE(array_agg(DISTINCT r.brand::text) FILTER (WHERE r.brand IS NOT NULL), '{}') AS brands,
      COALESCE(array_agg(DISTINCT r.responsibility) FILTER (WHERE r.responsibility IS NOT NULL), '{}') AS stages,
      COALESCE(array_agg(DISTINCT un.name) FILTER (WHERE un.name IS NOT NULL), '{}') AS units,
      jsonb_agg(jsonb_build_object(
        'id', r.id, 'stage', r.responsibility, 'unit', un.name,
        'unit_id', r.unit_id, 'daily_target', r.daily_target,
        'rating', r.rating, 'resource_type', r.resource_type
      ) ORDER BY r.responsibility) AS resources,
      bool_and(COALESCE(u.is_active, TRUE))                    AS is_active,
      bool_or(r.user_id IS NOT NULL)                           AS has_login,
      MAX(u.phone)                                             AS phone,
      MAX(u.email)                                             AS email,
      MAX(u.employee_id)                                       AS employee_id,
      MAX(us.last_active_at)                                   AS last_active_at
    FROM resources r
    LEFT JOIN units un ON un.id = r.unit_id
    LEFT JOIN users u  ON u.id = r.user_id
    LEFT JOIN user_sessions us ON us.user_id = r.user_id
    GROUP BY COALESCE(r.user_id::text, 'name:' || r.resource_name)
  ),
  -- Non-terminal people: users with no resource row (office / shop / admins).
  office AS (
    SELECT
      u.id::text                       AS person_key,
      u.id::text                       AS user_id,
      u.name                           AS name,
      NULL::uuid                       AS primary_resource_id,
      COALESCE(u.brands, '{}')         AS brands,
      u.role::text                     AS role,
      u.department::text               AS department,
      u.is_active,
      u.phone, u.email, u.employee_id,
      u.hire_date, u.nationality,
      to_jsonb(u.job_functions)        AS job_functions,
      us.last_active_at
    FROM users u
    LEFT JOIN user_sessions us ON us.user_id = u.id
    WHERE NOT EXISTS (SELECT 1 FROM resources r WHERE r.user_id = u.id)
  ),
  -- Unify both into one shape.
  people AS (
    SELECT
      t.person_key, t.user_id, t.name,
      'terminal'::text                 AS classification,
      'workshop'::text                 AS location,
      NULL::text                       AS role,        -- terminal: label from stages
      'workshop'::text                 AS department,
      t.primary_resource_id,
      to_jsonb(t.brands)               AS brands,
      to_jsonb(t.stages)               AS stages,
      to_jsonb(t.units)                AS units,
      t.resources,
      t.stages                         AS role_stages, -- for role filter (any stage)
      t.is_active, t.has_login,
      t.phone, t.email, t.employee_id,
      NULL::date                       AS hire_date,
      NULL::text                       AS nationality,
      '[]'::jsonb                      AS job_functions,
      t.last_active_at
    FROM term t
    UNION ALL
    SELECT
      o.person_key, o.user_id, o.name,
      CASE WHEN o.department = 'shop' THEN 'shop' ELSE 'office' END AS classification,
      o.department                     AS location,
      o.role,
      o.department,
      NULL::uuid                       AS primary_resource_id,
      to_jsonb(o.brands)               AS brands,
      '[]'::jsonb                      AS stages,
      '[]'::jsonb                      AS units,
      '[]'::jsonb                      AS resources,
      '{}'::text[]                     AS role_stages,
      o.is_active, TRUE                AS has_login,
      o.phone, o.email, o.employee_id,
      o.hire_date, o.nationality,
      o.job_functions,
      o.last_active_at
    FROM office o
  ),
  filtered AS (
    SELECT * FROM people p
    WHERE (p_location IS NULL OR p.location = p_location)
      AND (
        p_role IS NULL
        OR (p.classification = 'terminal' AND (p_role = 'terminal' OR p_role = ANY(p.role_stages)))
        OR (p.classification <> 'terminal' AND p.role = p_role)
      )
  )
  SELECT jsonb_build_object(
    'data', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'person_key', person_key, 'user_id', user_id, 'name', name,
        'classification', classification, 'location', location,
        'role', role, 'department', department,
        'primary_resource_id', primary_resource_id,
        'brands', brands, 'stages', stages, 'units', units, 'resources', resources,
        'is_active', is_active, 'has_login', has_login,
        'phone', phone, 'email', email, 'employee_id', employee_id,
        'hire_date', hire_date, 'nationality', nationality,
        'job_functions', job_functions, 'last_active_at', last_active_at
      ) ORDER BY is_active DESC, classification, name)
      FROM filtered
    ), '[]'::jsonb),
    -- Facet counts over the UNFILTERED population so the UI can build filters.
    'facets', jsonb_build_object(
      'total',    (SELECT COUNT(*) FROM people),
      'location', (SELECT COALESCE(jsonb_object_agg(location, ct), '{}'::jsonb)
                   FROM (SELECT COALESCE(location, 'other') AS location, COUNT(*) ct FROM people GROUP BY 1) x),
      'role',     (SELECT COALESCE(jsonb_object_agg(rk, ct), '{}'::jsonb)
                   FROM (
                     SELECT COALESCE(role, 'terminal') AS rk, COUNT(*) ct
                     FROM people WHERE classification <> 'terminal' AND role IS NOT NULL
                     GROUP BY role
                     UNION ALL
                     SELECT 'terminal', COUNT(*) FROM people WHERE classification = 'terminal'
                   ) y),
      'stage',    (SELECT COALESCE(jsonb_object_agg(stage, ct), '{}'::jsonb)
                   FROM (SELECT unnest(role_stages) AS stage, COUNT(*) ct
                         FROM people WHERE classification = 'terminal' GROUP BY 1) z)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. admin_performance_garments — passthrough for the shared KPI compute.
--    Same projection + lower bound as the workshop's getPerformanceGarmentsInRange
--    (garments active since p_from). Factory-wide: production is one factory, not
--    brand-split, so there is no brand filter. SECURITY DEFINER sidesteps the
--    per-brand garments_select RLS the admin role can't satisfy.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION admin_performance_garments(p_from TIMESTAMPTZ)
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
    'id', g.id,
    'production_plan', g.production_plan,
    'completion_time', g.completion_time,
    'piece_stage', g.piece_stage,
    'trip_number', g.trip_number,
    'trip_history', g.trip_history,
    'stage_timings', g.stage_timings,
    'delivery_date', g.delivery_date,
    'feedback_status', g.feedback_status,
    'express', g.express
  ) ORDER BY g.completion_time DESC), '[]'::jsonb)
  INTO v_result
  FROM garments g
  WHERE g.completion_time >= p_from;

  RETURN v_result;
END;
$$;

-- ── Grants (the in-function is_admin() gate is the real check) ───────────────
GRANT EXECUTE ON FUNCTION admin_team_roster(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_performance_garments(TIMESTAMPTZ) TO authenticated;
