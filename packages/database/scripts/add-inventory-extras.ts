import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

/**
 * Adds `sku` and `default_supplier_id` to fabrics, shelf, accessories.
 *
 * - sku: text, nullable. Free-form code; uniqueness not enforced (some shops
 *   reuse SKUs across types or don't bother with them).
 * - default_supplier_id: integer FK to suppliers(id), nullable. ON DELETE SET NULL
 *   so archiving a supplier doesn't break the inventory row.
 *
 * Safe to re-run.
 */
async function main() {
  for (const tbl of ["fabrics", "shelf", "accessories"] as const) {
    await db.execute(sql.raw(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS sku text`));
    await db.execute(sql.raw(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS default_supplier_id integer`));

    // FK — add only if not already present
    const fkName = `${tbl}_default_supplier_fk`;
    await db.execute(sql.raw(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = '${fkName}'
        ) THEN
          ALTER TABLE ${tbl}
            ADD CONSTRAINT ${fkName}
            FOREIGN KEY (default_supplier_id)
            REFERENCES suppliers(id)
            ON DELETE SET NULL;
        END IF;
      END$$;
    `));
  }

  console.log("OK: sku, default_supplier_id present on fabrics, shelf, accessories.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
