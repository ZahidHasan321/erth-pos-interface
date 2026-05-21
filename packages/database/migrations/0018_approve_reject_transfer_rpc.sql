-- 0018_approve_reject_transfer_rpc
--
-- approve / reject transfer were the only transfer-lifecycle mutations still
-- done as raw PostgREST updates with NO status guard:
--   .update({status:'approved'}).eq('id', id)   -- no .eq('status','requested')
-- A stale drawer or double-click could re-approve an already-dispatched
-- transfer (resetting status 'dispatched' → 'approved' while stock was already
-- debited → re-dispatchable → DOUBLE stock decrement), or reject a transfer
-- whose stock had already moved. Approve was also a non-atomic per-item loop
-- plus a separate header update — a mid-loop drop left approved_qty partial.
--
-- These RPCs mirror dispatch_transfer: single transaction, status='requested'
-- guard, and idem_claim/idem_store so a lost-response retry is a safe no-op.
-- Function bodies are also in triggers.sql (canonical). db:migrate is unusable
-- in this project, so this is applied directly to the live DB.

CREATE OR REPLACE FUNCTION approve_transfer(
  p_transfer_id INT,
  p_items JSONB,  -- [{ id: number, approved_qty: number }]
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_transfer RECORD;
  v_item JSONB;
  v_result JSONB;
BEGIN
  IF NOT idem_claim(p_idempotency_key, 'approve_transfer') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  SELECT * INTO v_transfer FROM transfer_requests WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer request % not found', p_transfer_id;
  END IF;
  IF v_transfer.status != 'requested' THEN
    RAISE EXCEPTION 'Transfer % is not awaiting approval (current: %)', p_transfer_id, v_transfer.status;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF (v_item->>'approved_qty')::decimal < 0 THEN
      RAISE EXCEPTION 'Approved quantity cannot be negative (item %)', v_item->>'id';
    END IF;
    UPDATE transfer_request_items
    SET approved_qty = (v_item->>'approved_qty')::decimal
    WHERE id = (v_item->>'id')::int AND transfer_request_id = p_transfer_id;
  END LOOP;

  UPDATE transfer_requests
  SET status = 'approved', approved_at = NOW()
  WHERE id = p_transfer_id;

  v_result := jsonb_build_object('success', true, 'transfer_id', p_transfer_id);
  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reject_transfer(
  p_transfer_id INT,
  p_rejection_reason TEXT,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_transfer RECORD;
  v_result JSONB;
BEGIN
  IF NOT idem_claim(p_idempotency_key, 'reject_transfer') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  SELECT * INTO v_transfer FROM transfer_requests WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer request % not found', p_transfer_id;
  END IF;
  IF v_transfer.status != 'requested' THEN
    RAISE EXCEPTION 'Transfer % is not awaiting approval (current: %)', p_transfer_id, v_transfer.status;
  END IF;

  UPDATE transfer_requests
  SET status = 'rejected', rejection_reason = p_rejection_reason
  WHERE id = p_transfer_id;

  v_result := jsonb_build_object('success', true, 'transfer_id', p_transfer_id);
  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;
