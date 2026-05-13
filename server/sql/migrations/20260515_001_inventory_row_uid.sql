-- ============================================================
-- 20260515_001 — Add row_uid to inventory and backfill
-- ------------------------------------------------------------
-- Introduces a canonical per-row UID that replaces SKU as the
-- tracking key for inventory updates and deletes.
--
-- Why: SKU is operational data (changes when a product is
-- renamed/migrated) and is NOT globally unique — multiple rows
-- can legitimately share the same SKU (e.g. different boxes,
-- batches, organizations). The repo previously used SKU as the
-- key, which made bulk imports fragile. row_uid is an opaque
-- UUID that never changes.
--
-- BigQuery has no AUTO/IDENTITY columns, so the application
-- generates row_uid client-side (Node randomUUID) on insert.
-- This migration only adds the column and backfills existing rows.
--
-- DO NOT RUN until:
--   1. Phase B and Phase C migrations have completed.
--   2. Application code that writes row_uid on insert is deployed
--      OR the deployment plan accepts that existing inserts will
--      keep writing NULL and a follow-up backfill will be needed.
--      (Recommended path: backup → deploy code → run this script.)
--
-- All steps are idempotent.
-- ============================================================

-- ── Step A ──────────────────────────────────────────────────
-- Backup the inventory table before structural change. row_uid
-- backfill below is deterministic via GENERATE_UUID, but having
-- a snapshot makes rollback trivial.
CREATE OR REPLACE TABLE `patman-inventory.patman_inventory.inventory_backup_20260515` AS
SELECT * FROM `patman-inventory.patman_inventory.inventory`;


-- ── Step B ──────────────────────────────────────────────────
-- Add the nullable row_uid column. We add it nullable first so
-- existing rows don't violate a NOT NULL constraint mid-migration.
ALTER TABLE `patman-inventory.patman_inventory.inventory`
ADD COLUMN IF NOT EXISTS row_uid STRING;


-- ── Step C ──────────────────────────────────────────────────
-- Backfill every existing row with a fresh UUID. BigQuery's
-- GENERATE_UUID() returns a different value per row, so no two
-- rows collide.
UPDATE `patman-inventory.patman_inventory.inventory`
SET row_uid = GENERATE_UUID()
WHERE row_uid IS NULL;


-- ── Step D ──────────────────────────────────────────────────
-- Tighten to NOT NULL now that every row has a value.
ALTER TABLE `patman-inventory.patman_inventory.inventory`
ALTER COLUMN row_uid SET NOT NULL;


-- ============================================================
-- Post-step verification.
-- ============================================================

-- Every row must have a row_uid.
-- Expected: 0 rows.
SELECT COUNT(*) AS rows_missing_uid
FROM `patman-inventory.patman_inventory.inventory`
WHERE row_uid IS NULL;

-- No two rows share a row_uid.
-- Expected: 0 rows.
SELECT row_uid, COUNT(*) AS n
FROM `patman-inventory.patman_inventory.inventory`
GROUP BY row_uid
HAVING n > 1;

-- Final canonical inventory shape.
-- Expected columns (in any order):
--   row_uid          STRING    NO   ← new
--   organization_id  STRING    NO
--   sku              STRING    NO
--   upc              STRING    NO
--   part_number      STRING    YES
--   box_number       STRING    YES
--   quantity         INT64     NO
--   date_added       STRING    YES
--   notes            STRING    YES
--   updated_at       TIMESTAMP YES
SELECT column_name, data_type, is_nullable
FROM `patman-inventory.patman_inventory.INFORMATION_SCHEMA.COLUMNS`
WHERE table_name = 'inventory'
ORDER BY ordinal_position;
