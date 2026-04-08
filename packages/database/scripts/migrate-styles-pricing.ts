/**
 * Migrates the styles table to the new pricing structure:
 * 1. Populates `code` from `image_url` for all existing rows
 * 2. Sets `component` based on the code prefix
 * 3. Inserts thickness pricing entries for all brands
 *
 * Run: pnpm --filter @repo/database tsx scripts/migrate-styles-pricing.ts
 */
import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config();

const client = postgres(process.env.DATABASE_URL!);

const BRANDS = ["ERTH", "SAKKBA", "QASS"] as const;

/** Maps existing image_url codes to their component category */
const COMPONENT_MAP: Record<string, string> = {
  STY_KUWAITI: "base",
  STY_DESIGNER: "base",
  STY_LINE: "lines",
  COL_QALLABI: "collar_type",
  COL_DOWN_COLLAR: "collar_type",
  COL_JAPANESE: "collar_type",
  COL_STRAIT_COLLAR: "collar_type",
  COL_ARAVI_ZARRAR: "collar_button",
  "COL_ZARRAR__TABBAGI": "collar_button",
  COL_TABBAGI: "collar_button",
  COL_SMALL_TABBAGI: "collar_accessory",
  JAB_BAIN_MURABBA: "jabzour_type",
  JAB_BAIN_MUSALLAS: "jabzour_type",
  JAB_MAGFI_MURABBA: "jabzour_type",
  JAB_MAGFI_MUSALLAS: "jabzour_type",
  JAB_SHAAB: "jabzour_type",
  FRO_MUDAWWAR_MAGFI_FRONT_POCKET: "pocket_type",
  FRO_MURABBA_FRONT_POCKET: "pocket_type",
  FRO_MUSALLAS_FRONT_POCKET: "pocket_type",
  FRO_MUDAWWAR_FRONT_POCKET: "pocket_type",
  SID_MUDAWWAR_SIDE_POCKET: "side_pocket_type",
  CUF_DOUBLE_GUMSHA: "cuffs_type",
  CUF_MURABBA_KABAK: "cuffs_type",
  CUF_MUSALLAS_KABBAK: "cuffs_type",
  CUF_MUDAWAR_KABBAK: "cuffs_type",
  CUF_NO_CUFF: "cuffs_type",
};

/**
 * New thickness pricing entries.
 * Set rate_per_item to 0.000 to make a component's hashwa free by default —
 * admin can update via the prices admin panel.
 */
const THICKNESS_ENTRIES: Array<{
  name: string;
  type: string;
  code: string;
  component: string;
  rate_per_item: string;
}> = [
  // Jabzour thickness — 1 KWD surcharge if any hashwa selected
  { name: "Jabzour - Single Hashwa", type: "jabzour_thickness", code: "JAB_THICKNESS_SINGLE",    component: "jabzour_thickness", rate_per_item: "1.000" },
  { name: "Jabzour - Double Hashwa", type: "jabzour_thickness", code: "JAB_THICKNESS_DOUBLE",    component: "jabzour_thickness", rate_per_item: "1.000" },
  { name: "Jabzour - Triple Hashwa", type: "jabzour_thickness", code: "JAB_THICKNESS_TRIPLE",    component: "jabzour_thickness", rate_per_item: "1.000" },
  { name: "Jabzour - No Hashwa",     type: "jabzour_thickness", code: "JAB_THICKNESS_NO_HASHWA", component: "jabzour_thickness", rate_per_item: "0.000" },

  // Front pocket thickness — free by default
  { name: "Pocket - Single Hashwa", type: "pocket_thickness", code: "FRO_THICKNESS_SINGLE",    component: "pocket_thickness", rate_per_item: "0.000" },
  { name: "Pocket - Double Hashwa", type: "pocket_thickness", code: "FRO_THICKNESS_DOUBLE",    component: "pocket_thickness", rate_per_item: "0.000" },
  { name: "Pocket - Triple Hashwa", type: "pocket_thickness", code: "FRO_THICKNESS_TRIPLE",    component: "pocket_thickness", rate_per_item: "0.000" },
  { name: "Pocket - No Hashwa",     type: "pocket_thickness", code: "FRO_THICKNESS_NO_HASHWA", component: "pocket_thickness", rate_per_item: "0.000" },

  // Cuffs thickness — free by default
  { name: "Cuffs - Single Hashwa", type: "cuffs_thickness", code: "CUF_THICKNESS_SINGLE",    component: "cuffs_thickness", rate_per_item: "0.000" },
  { name: "Cuffs - Double Hashwa", type: "cuffs_thickness", code: "CUF_THICKNESS_DOUBLE",    component: "cuffs_thickness", rate_per_item: "0.000" },
  { name: "Cuffs - Triple Hashwa", type: "cuffs_thickness", code: "CUF_THICKNESS_TRIPLE",    component: "cuffs_thickness", rate_per_item: "0.000" },
  { name: "Cuffs - No Hashwa",     type: "cuffs_thickness", code: "CUF_THICKNESS_NO_HASHWA", component: "cuffs_thickness", rate_per_item: "0.000" },
];

async function main() {
  console.log("Migrating styles table to new pricing structure...\n");

  // Step 1: Populate `code` from `image_url` and set `component` for existing rows
  console.log("Step 1: Backfilling code and component for existing rows...");
  let backfilled = 0;
  for (const [imageUrl, component] of Object.entries(COMPONENT_MAP)) {
    const result = await client.unsafe(`
      UPDATE styles
      SET code = $1, component = $2
      WHERE image_url = $1 AND (code IS NULL OR component IS NULL)
    `, [imageUrl, component]);
    backfilled += result.count;
  }
  console.log(`  ${backfilled} rows backfilled`);

  // Step 2: Insert thickness entries for each brand
  console.log("\nStep 2: Inserting thickness pricing entries...");
  let inserted = 0;
  for (const brand of BRANDS) {
    for (const entry of THICKNESS_ENTRIES) {
      const result = await client.unsafe(`
        INSERT INTO styles (name, type, code, component, rate_per_item, brand)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (name, type, brand) DO UPDATE
          SET code = EXCLUDED.code,
              component = EXCLUDED.component
      `, [entry.name, entry.type, entry.code, entry.component, entry.rate_per_item, brand]);
      inserted += result.count;
    }
  }
  console.log(`  ${inserted} thickness rows inserted/updated`);

  console.log("\nDone!");
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
