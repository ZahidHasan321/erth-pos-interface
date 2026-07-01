import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

const MEAS_ID = "3d4f4df5-1235-4640-ab78-ad517f82e9ed"; // IM0001824, shared by 2522-1..3

async function main() {
  console.log("=== BEFORE ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT measurement_id, armhole_front, collar_height, jabzour_width
    FROM measurements WHERE id = ${MEAS_ID}
  `), null, 2));

  const res = await db.execute(sql`
    UPDATE measurements SET
      armhole_front = COALESCE(armhole_front, 9.75),
      collar_height = COALESCE(collar_height, 2.25),
      jabzour_width = COALESCE(jabzour_width, 1.5)
    WHERE id = ${MEAS_ID}
  `);
  console.log("\nrows updated:", (res as { rowCount?: number }).rowCount);

  console.log("\n=== AFTER ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT measurement_id, armhole_front, collar_height, jabzour_width
    FROM measurements WHERE id = ${MEAS_ID}
  `), null, 2));

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
