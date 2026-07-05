-- 0051 — Supervisor role.
--
-- A workshop supervisor is a manager-rank office role that reschedules /
-- reassigns work but cannot advance production stages (terminals / QC) or
-- Receive & Start. The stage restriction is enforced at the UI via the
-- capability layer (CAPS.ADVANCE_STAGE / QC_SUBMIT / RECEIVE_AND_START); at the
-- DB level supervisor counts as manager-or-above so every other gate matches a
-- manager.
--
-- NOTE: `ALTER TYPE ... ADD VALUE` must be committed before the new value is
-- used, so the apply script runs these three statements in separate
-- transactions (see scripts/apply-0051-supervisor-role.ts). Re-runnable.

-- 1. Add the enum value.
ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'supervisor';

-- 2. Supervisor is manager-or-above for server-side gates.
CREATE OR REPLACE FUNCTION is_manager_or_above()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_active = true AND role IN ('super_admin', 'admin', 'manager', 'supervisor'));
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, extensions, pg_catalog;

-- 3. Promote the existing SHAH user from manager to supervisor.
UPDATE users SET role = 'supervisor' WHERE username = 'shah';
