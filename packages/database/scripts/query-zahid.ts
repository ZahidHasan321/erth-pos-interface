import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");

async function main() {
  const preview = await db.execute(sql`
    SELECT id, garment_id, collar_type, collar_position, collar_thickness
    FROM garments
    WHERE collar_thickness IS NULL
    ORDER BY created_at DESC
  `);

  const rows = preview as unknown as Array<{
    id: string;
    garment_id: string;
    collar_type: string | null;
    collar_position: string | null;
    collar_thickness: string | null;
  }>;

  console.log(`Garments with NULL collar_thickness: ${rows.length}`);
  for (const r of rows) {
    console.log(
      `  ${r.garment_id} | type=${r.collar_type ?? "—"} | pos=${r.collar_position ?? "—"}`,
    );
  }

  if (!APPLY) {
    console.log(`\nDry run. Re-run with --apply to UPDATE ${rows.length} rows to collar_thickness='DOUBLE'.`);
    process.exit(0);
  }

  const result = await db.execute(sql`
    UPDATE garments
    SET collar_thickness = 'DOUBLE'
    WHERE collar_thickness IS NULL
  `);
  console.log(`\nUpdated rows. Result:`, (result as any).rowCount ?? result);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
