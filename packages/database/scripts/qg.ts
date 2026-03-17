import "dotenv/config";
import { db } from "./src/client";
import { garments } from "./src/schema";
import { eq } from "drizzle-orm";
async function main() {
  const [g] = await db.select({
    collar_type: garments.collar_type,
    collar_thickness: garments.collar_thickness,
    front_pocket_type: garments.front_pocket_type,
    front_pocket_thickness: garments.front_pocket_thickness,
    jabzour_1: garments.jabzour_1,
    jabzour_thickness: garments.jabzour_thickness,
    cuffs_type: garments.cuffs_type,
    cuffs_thickness: garments.cuffs_thickness,
    pen_holder: garments.pen_holder,
    wallet_pocket: garments.wallet_pocket,
    small_tabaggi: garments.small_tabaggi,
    lines: garments.lines,
    soaking: garments.soaking,
  }).from(garments).where(eq(garments.id, "fdceba06-2dc4-4b82-b686-01ba3f0a9263"));
  console.log(JSON.stringify(g, null, 2));
  process.exit(0);
}
main();
