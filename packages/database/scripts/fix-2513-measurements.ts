import "dotenv/config";
import { db } from "../src/client";
import { sql } from "drizzle-orm";

const MEAS_ID = "2c5bd384-6f56-43eb-9190-bc77c6bd8e5a"; // 1862-1, shared by 2513-1/2/3

async function main() {
  console.log("=== BEFORE ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT measurement_id, collar_height, side_pocket_distance, side_pocket_opening
    FROM measurements WHERE id = ${MEAS_ID}
  `), null, 2));

  await db.execute(sql`
    UPDATE measurements SET
      collar_height = 1.5,
      side_pocket_distance = 6.75,
      side_pocket_opening = 7.5
    WHERE id = ${MEAS_ID}
  `);

  console.log("=== AFTER ===");
  console.log(JSON.stringify(await db.execute(sql`
    SELECT measurement_id, collar_height, side_pocket_distance, side_pocket_opening
    FROM measurements WHERE id = ${MEAS_ID}
  `), null, 2));

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
