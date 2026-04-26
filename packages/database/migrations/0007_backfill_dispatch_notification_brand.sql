-- Migration: backfill brand on dispatch notifications.
--
-- The notify_garment_location_change() trigger previously inserted
-- garment_dispatched_to_shop / garment_dispatched_to_workshop notifications
-- without the brand column populated. The notification RPCs filter by brand
-- (`p_brand IS NULL OR n.brand = p_brand::brand`), and the apps always pass
-- a non-null brand, so every NULL-brand row was silently filtered out — the
-- bell never showed dispatch events.
--
-- Trigger is fixed in triggers.sql (now sets brand from the parent order).
-- This migration backfills the existing rows so the in-memory backlog (rows
-- still inside the 7-day expiry window) becomes visible to the right brand.

UPDATE notifications n
SET brand = o.brand
FROM orders o
WHERE n.brand IS NULL
  AND n.type IN ('garment_dispatched_to_shop', 'garment_dispatched_to_workshop')
  AND (n.metadata->>'order_id')::int = o.id;
