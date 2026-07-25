/**
 * Give the local seeded garment a realistic measurement + full style set, so
 * the terminal overlay actually renders something worth looking at.
 * LOCAL DB ONLY (127.0.0.1:54322, disposable per CLAUDE.md 0a).
 */
import postgres from "postgres";

const sql = postgres("postgresql://postgres:postgres@127.0.0.1:54322/postgres");

const [g] = await sql<{ id: string; measurement_id: string | null }[]>`
  SELECT id, measurement_id FROM garments ORDER BY order_id, garment_id LIMIT 1
`;
if (!g) throw new Error("no seeded garment - run pnpm e2e:setup");

// Values are plausible dishdasha figures; the point is that every cell the
// overlay can draw has something in it, including the optional ones.
const M = {
  collar_width: 16, collar_height: 2, shoulder: 18, chest_upper: 20,
  chest_full: 42, chest_front: 21, chest_back: 21, sleeve_length: 24,
  sleeve_width: 7, elbow: 12, armhole_front: 10,
  top_pocket_length: 6, top_pocket_width: 5, top_pocket_distance: 8,
  side_pocket_length: 7, side_pocket_width: 6, side_pocket_distance: 14,
  side_pocket_opening: 7, waist_front: 20, waist_back: 20, waist_full: 40,
  length_front: 56, length_back: 57, bottom: 24,
  jabzour_width: 1.5, jabzour_length: 9, second_button_distance: 4,
  basma_length: 3, basma_width: 2, sleeve_hemming: 4, bottom_hemming: 4,
  pen_pocket_length: 5, pen_pocket_width: 2,
  degree: 0, shoulder_slope: "normal", collar_position: "up",
};

let measurementId = g.measurement_id;
if (!measurementId) {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO measurements ${sql({
      customer_id: 1,
      measurement_date: "2026-07-01",
      type: "Body",
      reference: "TERMINAL-FIXTURE",
      ...M,
    })} RETURNING id
  `;
  measurementId = row!.id;
  console.log("created measurement", measurementId);
} else {
  await sql`UPDATE measurements SET ${sql(M)} WHERE id = ${measurementId}`;
  console.log("updated measurement", measurementId);
}

await sql`
  UPDATE garments SET
    measurement_id = ${measurementId},
    style = 'kuwaiti', lines = 1,
    collar_type = 'COL_DOWN_COLLAR', collar_button = 'COL_TABBAGI', collar_thickness = 'DOUBLE',
    cuffs_type = 'CUF_MURABBA_KABAK', cuffs_thickness = 'DOUBLE',
    front_pocket_type = 'FRO_MURABBA_FRONT_POCKET', front_pocket_thickness = 'SINGLE',
    jabzour_1 = 'ZIPPER', jabzour_thickness = 'SINGLE',
    wallet_pocket = true, pen_holder = true, mobile_pocket = false,
    small_tabaggi = false,
    notes = 'Customer prefers a slightly loose cuff.'
  WHERE id = ${g.id}
`;
console.log("garment", g.id, "fixtured");

await sql.end();
