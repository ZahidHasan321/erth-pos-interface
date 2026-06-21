-- 0032: brand-attributed fabric consumption (SPEC §1/§4).
-- Add a nullable `brand` column to the stock-movements ledger. Order-referenced
-- movements (consumption/return) are stamped with the consuming brand in
-- _log_stock_movement (see triggers.sql); non-order stock ops stay NULL. This is
-- what lets ERTH's fabric report break consumption down by consuming brand (the
-- single sanctioned cross-brand view). Idempotent; no data backfill (historical
-- rows stay NULL = pre-attribution).
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS brand brand;
