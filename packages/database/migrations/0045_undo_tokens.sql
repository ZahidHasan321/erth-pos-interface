-- Undo window for garment logistics actions (workshop + shop).
--
-- A handful of high-regret garment moves (dispatch to shop / to workshop,
-- receive at either side, schedule, park->scheduler, advance a stage) now offer
-- a short "Undo" window. The mechanism is a snapshot token, not a temporal
-- rollback:
--
--   1. The client captures a before-image of the garment columns it is about to
--      touch (pre-action SELECT), performs the action, then calls
--      record_undo_token(before_image). record_undo_token computes the guard
--      (after-image of the downstream-progress columns) SERVER-SIDE from the
--      just-mutated row, so timestamp formatting is consistent for the later
--      comparison.
--   2. perform_undo(token) restores the before-image ONLY IF (a) the token is
--      unconsumed, (b) the 60s window has not lapsed, and (c) every garment is
--      still exactly as the action left it on the guard columns (location,
--      piece_stage, in_production, start_time, completion_time). If the counter-
--      part received the garment, or production progressed, the guard mismatches
--      and the undo is refused — so undo can never corrupt state, even under a
--      race. The toast window is UX; correctness is the server gate.
--
-- The guard columns are precisely the ones that change when the OTHER side (or a
-- worker) consumes the action's result: a shop receiving a dispatch flips
-- location off transit_*, a worker starting/finishing flips piece_stage /
-- start_time / completion_time. feedback_status / production_plan changes are
-- part of the action itself (not downstream progress) so they are not guards.

-- ── dispatch_log: void undone dispatches (append-only preserved) ──────────────
-- A dispatch that is undone within the window never physically happened. Rather
-- than delete the audit row (breaks append-only), stamp undone_at and filter it
-- out of the Dispatch History views.
ALTER TABLE dispatch_log ADD COLUMN IF NOT EXISTS undone_at timestamptz;

-- ── undo_tokens ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS undo_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type   text NOT NULL,          -- dispatch_to_shop | dispatch_to_workshop | receive_at_workshop | receive_at_shop | schedule | send_to_scheduler | advance_stage
  entity_ids    uuid[] NOT NULL,        -- garment ids the action touched
  before_image  jsonb NOT NULL,         -- { "<garment_id>": { col: value, ... } } captured pre-action
  guard         jsonb NOT NULL,         -- { "<garment_id>": { location, piece_stage, in_production, start_time, completion_time } } post-action
  created_by    text,                   -- optional acting-user id (metadata only; gate is state-based)
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz
);
CREATE INDEX IF NOT EXISTS undo_tokens_created_at_idx ON undo_tokens (created_at);

ALTER TABLE undo_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "undo_tokens_select" ON undo_tokens;
CREATE POLICY "undo_tokens_select" ON undo_tokens FOR SELECT USING (is_active_user());
DROP POLICY IF EXISTS "undo_tokens_modify" ON undo_tokens;
CREATE POLICY "undo_tokens_modify" ON undo_tokens FOR ALL USING (is_active_user()) WITH CHECK (is_active_user());

-- Housekeeping: consumed/expired tokens are worthless after the window. Callable
-- from a cron or opportunistically; keeps the table tiny.
CREATE OR REPLACE FUNCTION purge_old_undo_tokens(p_keep_interval INTERVAL DEFAULT INTERVAL '1 day')
RETURNS INTEGER AS $$
DECLARE v_deleted INTEGER;
BEGIN
  DELETE FROM undo_tokens WHERE created_at < now() - p_keep_interval;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- ── record_undo_token ────────────────────────────────────────────────────────
-- Called by the client immediately AFTER a successful undoable action, with the
-- before-image it captured pre-action. Computes the guard (after-image) from the
-- current rows. Returns the token id for the toast's Undo button.
CREATE OR REPLACE FUNCTION record_undo_token(
  p_action_type   text,
  p_entity_ids    uuid[],
  p_before_image  jsonb,
  p_window_seconds integer DEFAULT 60,
  p_created_by    text DEFAULT NULL,
  p_expected_location text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_guard jsonb;
  v_id uuid;
BEGIN
  IF p_entity_ids IS NULL OR array_length(p_entity_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'record_undo_token: no entity ids provided';
  END IF;

  -- Arm-time safety (closes the non-atomic-capture race for location actions):
  -- record_undo_token is a SEPARATE round-trip from the action, so if the
  -- counterpart already consumed the garment in the gap (e.g. the shop received
  -- a just-dispatched garment), the current location no longer matches what the
  -- action left. Don't arm the token in that case — returning NULL means "no
  -- Undo offered", never a token that could restore over newer state. Combined
  -- with the guard re-check in perform_undo, both sub-windows are covered.
  IF p_expected_location IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM garments g
        WHERE g.id = ANY(p_entity_ids) AND g.location::text <> p_expected_location
     ) THEN
    RETURN NULL;
  END IF;

  -- Guard = the full post-action fingerprint of every column undo restores, so
  -- ANY intervening change (counterpart move OR an in-place spec/plan edit that
  -- touches none of the movement columns) closes the window at perform_undo.
  SELECT jsonb_object_agg(g.id::text, jsonb_build_object(
    'location',           g.location::text,
    'piece_stage',        g.piece_stage::text,
    'in_production',      g.in_production,
    'start_time',         to_jsonb(g.start_time),
    'completion_time',    to_jsonb(g.completion_time),
    'feedback_status',    g.feedback_status,
    'acceptance_status',  g.acceptance_status,
    'trip_number',        g.trip_number,
    'assigned_date',      to_jsonb(g.assigned_date),
    'production_plan',    g.production_plan,
    'qc_rework_stages',   to_jsonb(g.qc_rework_stages),
    'shop_received_date', to_jsonb(g.shop_received_date)
  ))
  INTO v_guard
  FROM garments g
  WHERE g.id = ANY(p_entity_ids);

  INSERT INTO undo_tokens (action_type, entity_ids, before_image, guard, created_by, expires_at)
  VALUES (
    p_action_type,
    p_entity_ids,
    p_before_image,
    COALESCE(v_guard, '{}'::jsonb),
    p_created_by,
    now() + make_interval(secs => GREATEST(p_window_seconds, 1))
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ── perform_undo ─────────────────────────────────────────────────────────────
-- Restore the before-image for every garment in the token, gated on the token
-- being live and every garment still matching its guard. All-or-nothing: if any
-- garment moved on, nothing is restored.
CREATE OR REPLACE FUNCTION perform_undo(p_token_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_token undo_tokens;
  v_id uuid;
  v_before jsonb;
  v_guard jsonb;
  v_restored integer := 0;
  v_order integer;
BEGIN
  SELECT * INTO v_token FROM undo_tokens WHERE id = p_token_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'perform_undo: undo token not found (it may have already expired and been purged)';
  END IF;
  IF v_token.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'perform_undo: this action was already undone';
  END IF;
  IF now() > v_token.expires_at THEN
    RAISE EXCEPTION 'perform_undo: the undo window has expired';
  END IF;

  -- Gate: every garment must still match the FULL post-action fingerprint. Any
  -- change since — a counterpart move OR an in-place spec/plan/date edit that
  -- never touched a movement column — closes the window and the undo is refused.
  FOREACH v_id IN ARRAY v_token.entity_ids LOOP
    v_guard := v_token.guard -> v_id::text;
    PERFORM 1 FROM garments g
     WHERE g.id = v_id
       AND g.location::text            IS NOT DISTINCT FROM (v_guard->>'location')
       AND g.piece_stage::text         IS NOT DISTINCT FROM (v_guard->>'piece_stage')
       AND g.in_production             IS NOT DISTINCT FROM (v_guard->>'in_production')::boolean
       AND g.feedback_status           IS NOT DISTINCT FROM (v_guard->>'feedback_status')
       AND g.acceptance_status         IS NOT DISTINCT FROM (v_guard->>'acceptance_status')::boolean
       AND g.trip_number               IS NOT DISTINCT FROM (v_guard->>'trip_number')::integer
       -- NULL-able values: guard stores jsonb 'null' but to_jsonb(NULL) is SQL
       -- NULL, so coalesce both sides to jsonb 'null' before comparing.
       AND COALESCE(to_jsonb(g.start_time), 'null'::jsonb)         IS NOT DISTINCT FROM COALESCE(v_guard->'start_time', 'null'::jsonb)
       AND COALESCE(to_jsonb(g.completion_time), 'null'::jsonb)    IS NOT DISTINCT FROM COALESCE(v_guard->'completion_time', 'null'::jsonb)
       AND COALESCE(to_jsonb(g.assigned_date), 'null'::jsonb)      IS NOT DISTINCT FROM COALESCE(v_guard->'assigned_date', 'null'::jsonb)
       AND COALESCE(g.production_plan, 'null'::jsonb)              IS NOT DISTINCT FROM COALESCE(v_guard->'production_plan', 'null'::jsonb)
       AND COALESCE(to_jsonb(g.qc_rework_stages), 'null'::jsonb)   IS NOT DISTINCT FROM COALESCE(v_guard->'qc_rework_stages', 'null'::jsonb)
       AND COALESCE(to_jsonb(g.shop_received_date), 'null'::jsonb) IS NOT DISTINCT FROM COALESCE(v_guard->'shop_received_date', 'null'::jsonb);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'perform_undo: garment % has already moved on (received by the other side, production progressed, or edited since) - cannot undo', v_id;
    END IF;
  END LOOP;

  -- Suppress the garment location-change notification for the restore: reverting
  -- a receive flips location back into transit_* and must NOT re-fire a
  -- "dispatched" toast to the other side. Transaction-local.
  PERFORM set_config('app.undo_in_progress', 'on', true);

  -- Restore before-image (fixed column set = union of everything the undoable
  -- actions touch). JSON null is normalised to SQL NULL for the jsonb columns.
  FOREACH v_id IN ARRAY v_token.entity_ids LOOP
    v_before := v_token.before_image -> v_id::text;
    -- Defensive: a token must carry a before-image for every entity id. If one
    -- is missing (should be impossible — the guard above matched all ids), skip
    -- rather than blank the row to NULLs.
    IF v_before IS NULL THEN
      CONTINUE;
    END IF;
    UPDATE garments SET
      location         = (v_before->>'location')::location,
      piece_stage      = (v_before->>'piece_stage')::piece_stage,
      in_production     = COALESCE((v_before->>'in_production')::boolean, false),
      feedback_status   = v_before->>'feedback_status',
      acceptance_status = (v_before->>'acceptance_status')::boolean,
      trip_number       = (v_before->>'trip_number')::integer,
      assigned_date     = (v_before->>'assigned_date')::date,
      start_time        = (v_before->>'start_time')::timestamptz,
      completion_time   = (v_before->>'completion_time')::timestamptz,
      shop_received_date = (v_before->>'shop_received_date')::timestamptz,
      production_plan   = NULLIF(v_before->'production_plan', 'null'::jsonb),
      worker_history    = NULLIF(v_before->'worker_history', 'null'::jsonb),
      trip_history      = NULLIF(v_before->'trip_history', 'null'::jsonb),
      stage_timings     = NULLIF(v_before->'stage_timings', 'null'::jsonb),
      qc_rework_stages  = CASE
                            WHEN v_before->'qc_rework_stages' IS NULL
                              OR jsonb_typeof(v_before->'qc_rework_stages') = 'null'
                            THEN NULL
                            ELSE ARRAY(SELECT jsonb_array_elements_text(v_before->'qc_rework_stages'))
                          END
    WHERE id = v_id;
    v_restored := v_restored + 1;
  END LOOP;

  -- Void the dispatch audit rows this action created (append-only preserved).
  -- Dispatch undo: void the audit rows this dispatch created (append-only
  -- preserved) AND retract the "dispatched" notification it fired, so the other
  -- side isn't left told about a dispatch that no longer happened (audit #7).
  IF v_token.action_type IN ('dispatch_to_shop', 'dispatch_to_workshop') THEN
    UPDATE dispatch_log
       SET undone_at = now()
     WHERE garment_id = ANY(v_token.entity_ids)
       AND undone_at IS NULL
       AND dispatched_at >= v_token.created_at - INTERVAL '5 seconds';

    UPDATE notifications
       SET expires_at = now()   -- retract (get_my_notifications filters expires_at > now())
     WHERE type::text = CASE v_token.action_type
                          WHEN 'dispatch_to_shop' THEN 'garment_dispatched_to_shop'
                          ELSE 'garment_dispatched_to_workshop' END
       AND metadata->>'garment_id' IN (SELECT unnest(v_token.entity_ids)::text)
       AND expires_at > now()
       AND created_at >= v_token.created_at - INTERVAL '5 seconds';
  END IF;

  -- First shop->workshop dispatch undo: dispatch_order flips order_phase to
  -- 'in_progress' unconditionally and nothing flips it back, so an order whose
  -- only dispatch was just undone would read 'in_progress' while sitting
  -- un-dispatched in the queue (audit #2). Reset to 'new' ONLY when no garment
  -- of the order remains dispatched (all trip_number = 0) — a RETURN-trip undo
  -- leaves trip_number >= 1, so that order legitimately stays in_progress.
  IF v_token.action_type = 'dispatch_to_workshop' THEN
    FOR v_order IN SELECT DISTINCT order_id FROM garments WHERE id = ANY(v_token.entity_ids) LOOP
      IF NOT EXISTS (SELECT 1 FROM garments WHERE order_id = v_order AND trip_number > 0) THEN
        UPDATE work_orders       SET order_phase = 'new' WHERE order_id = v_order AND order_phase = 'in_progress';
        UPDATE alteration_orders SET order_phase = 'new' WHERE order_id = v_order AND order_phase = 'in_progress';
      END IF;
    END LOOP;
  END IF;

  UPDATE undo_tokens SET consumed_at = now() WHERE id = p_token_id;

  RETURN jsonb_build_object('undone', true, 'restored_count', v_restored, 'action_type', v_token.action_type);
END;
$$ LANGUAGE plpgsql;
