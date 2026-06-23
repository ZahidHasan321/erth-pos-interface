-- 0035: Shop department reads + resolves appointments across all brands.
--
-- The ERTH showroom shop holds the cross-brand appointments list and resolves
-- them (SPEC §5). The previous appointments policies scoped reads/updates to
-- can_access_brand(), which an ERTH-only shop user fails for SAKKBA/QASS rows.
-- Widen so shop-department users see and update every brand's appointments,
-- mirroring how the workshop department already sees all brands.
-- Idempotent: DROP POLICY IF EXISTS + CREATE POLICY.

DROP POLICY IF EXISTS "appointments_select" ON appointments;
CREATE POLICY "appointments_select" ON appointments FOR SELECT USING (
  is_active_user() AND (
    get_my_department() = 'shop' OR brand IS NULL OR can_access_brand(brand::text)
  )
);

DROP POLICY IF EXISTS "appointments_update" ON appointments;
CREATE POLICY "appointments_update" ON appointments FOR UPDATE USING (
  get_my_department() = 'shop'
  OR (
    (is_manager_or_above() OR assigned_to = get_my_user_id())
    AND (brand IS NULL OR can_access_brand(brand::text))
  )
);
