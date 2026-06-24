import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config();

const client = postgres(process.env.DATABASE_URL!);

// Sync styles.name to the renamed POS display labels (commit e015ada):
//   CUF_DOUBLE_GUMSHA: Double Gumsha -> French Cuff
//   JAB_SHAAB:         Shaab         -> Zipper
// All brands; idempotent (only rows whose name still differs are touched).
const RENAMES: { code: string; name: string }[] = [
  { code: "CUF_DOUBLE_GUMSHA", name: "French Cuff" },
  { code: "JAB_SHAAB", name: "Zipper" },
];

async function main() {
  for (const { code, name } of RENAMES) {
    const updated = await client`
      UPDATE styles SET name = ${name}
      WHERE code = ${code} AND name IS DISTINCT FROM ${name}
      RETURNING id, code, name, brand
    `;
    console.log(`${code} -> "${name}": ${updated.length} row(s) updated`);
    console.table(updated);
  }
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
