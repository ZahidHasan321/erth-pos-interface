import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

async function main() {
  // Exact stored precision for the 3 measurement rows flagged as possible fixes
  const exact = await db.execute(sql`
    SELECT g.garment_id, m.collar_width::text AS collar_width, m.length_front::text AS length_front
    FROM garments g JOIN measurements m ON m.id = g.measurement_id
    WHERE g.garment_id IN ('2511-1','2515-1','2515-2')
    ORDER BY g.garment_id
  `);
  console.log("=== exact stored values ==="); console.log(JSON.stringify(exact, null, 2));

  // Column scale
  const scale = await db.execute(sql`
    SELECT column_name, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_name='measurements' AND column_name IN ('collar_width','length_front','top_pocket_width')
  `);
  console.log("=== numeric scale ==="); console.log(JSON.stringify(scale, null, 2));

  // Distribution of shoulder_slope across ALL measurements
  const dist = await db.execute(sql`
    SELECT COALESCE(shoulder_slope::text,'(null)') AS val, count(*)::int AS n
    FROM measurements GROUP BY 1 ORDER BY 2 DESC
  `);
  console.log("=== shoulder_slope distribution (all measurements) ==="); console.log(JSON.stringify(dist, null, 2));

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
