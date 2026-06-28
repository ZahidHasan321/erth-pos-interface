import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

const MEAS_ID = "81876462-29ff-49d0-b68e-34d7aee566da"; // IM0001843, shared by 2509-1..5

async function main() {
  console.log("=== BEFORE ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT measurement_id, armhole_front, collar_height, jabzour_width
    FROM measurements WHERE id = ${MEAS_ID}
  `), null, 2));

  const res = await db.execute(sql`
    UPDATE measurements SET
      armhole_front = COALESCE(armhole_front, 11.25),
      collar_height = COALESCE(collar_height, 1.375),
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
