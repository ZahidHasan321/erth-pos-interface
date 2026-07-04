-- 0046 — Reversing a brova acceptance re-parks (or blocks on) its released finals.
-- SPEC §2.5 "Reversing an acceptance re-parks — or blocks on — the released finals".
--
-- Editing a brova's feedback from an accepting verdict (Accept / Accept-with-Fix)
-- back to a rejecting one (Reject-Repair / Reject-Redo) flips acceptance_status to
-- false. A brova acceptance is what releases the order's parked finals, so the
-- reversal must not strand finals released under a now-rejected brova. These two
-- functions reconcile the finals server-side, atomically, so a concurrent workshop
-- release cannot slip a final past the check.
--
-- CREATE OR REPLACE — safe to re-apply. Mirrors packages/database/src/triggers.sql.

CREATE OR REPLACE FUNCTION repark_finals_for_rejected_brova(p_brova_id UUID)
RETURNS UUID[] AS $$
DECLARE
  v_order_id INT;
  v_other_accepts BOOLEAN;
  v_blocked TEXT[] := ARRAY[]::TEXT[];
  v_reparked UUID[] := ARRAY[]::UUID[];
  v_final RECORD;
BEGIN
  SELECT order_id INTO v_order_id FROM garments WHERE id = p_brova_id;
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'repark_finals_for_rejected_brova: brova % not found', p_brova_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM garments
     WHERE order_id = v_order_id
       AND garment_type = 'brova'
       AND id <> p_brova_id
       AND (acceptance_status = true OR piece_stage = 'completed')
  ) INTO v_other_accepts;

  IF v_other_accepts THEN
    RETURN v_reparked;
  END IF;

  FOR v_final IN
    SELECT id, garment_id, piece_stage, production_plan
      FROM garments
     WHERE order_id = v_order_id
       AND garment_type = 'final'
       AND piece_stage <> 'discarded'
     FOR UPDATE
  LOOP
    IF v_final.piece_stage = 'waiting_for_acceptance' THEN
      CONTINUE;
    ELSIF v_final.piece_stage = 'waiting_cut' AND v_final.production_plan IS NULL THEN
      v_reparked := v_reparked || v_final.id;
    ELSE
      v_blocked := v_blocked || COALESCE(v_final.garment_id, v_final.id::text);
    END IF;
  END LOOP;

  IF array_length(v_blocked, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot reject this brova: final(s) % are already scheduled or in production at the workshop. Reverse them at the workshop before rejecting this brova.',
      array_to_string(v_blocked, ', ');
  END IF;

  IF array_length(v_reparked, 1) IS NOT NULL THEN
    UPDATE garments
       SET piece_stage = 'waiting_for_acceptance',
           in_production = false,
           production_plan = NULL,
           assigned_date = NULL
     WHERE id = ANY(v_reparked);
  END IF;

  RETURN v_reparked;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reject_brova_repark_finals(
  p_brova_id UUID,
  p_apply_brova BOOLEAN DEFAULT true,
  p_feedback_status TEXT DEFAULT 'needs_repair'
)
RETURNS JSONB AS $$
DECLARE
  v_reparked UUID[];
BEGIN
  v_reparked := repark_finals_for_rejected_brova(p_brova_id);

  IF p_apply_brova THEN
    UPDATE garments
       SET piece_stage = 'brova_trialed',
           acceptance_status = false,
           feedback_status = p_feedback_status
     WHERE id = p_brova_id
       AND garment_type = 'brova';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'reject_brova_repark_finals: brova % not found', p_brova_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('reparked_ids', to_jsonb(v_reparked));
END;
$$ LANGUAGE plpgsql;
