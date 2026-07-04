import postgres from "postgres";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const client = postgres(process.env.DATABASE_URL!);

// The RPCs in 0043 reuse these objects from triggers.sql. They must already
// exist in the target DB (apply triggers first). We check up front so a missing
// dependency fails loudly instead of leaving half-created functions.
const REQUIRED = [
  { kind: "function", name: "is_admin" },
  { kind: "function", name: "assigned_order_status_label" },
  { kind: "function", name: "get_consumption_by_brand" },
  { kind: "view/table", name: "assigned_order_agg" },
];

async function preflight() {
  const missing: string[] = [];
  for (const dep of REQUIRED) {
    const rows =
      dep.kind === "view/table"
        ? await client`SELECT to_regclass(${"public." + dep.name}) AS obj`
        : await client`SELECT 1 AS obj FROM pg_proc WHERE proname = ${dep.name} LIMIT 1`;
    const present = dep.kind === "view/table" ? rows[0]?.obj != null : rows.length > 0;
    if (!present) missing.push(`${dep.kind} ${dep.name}`);
  }
  if (missing.length) {
    throw new Error(
      `Missing dependencies in target DB (apply triggers first): ${missing.join(", ")}`,
    );
  }
}

// Applied in order: 0043 defines the first wave, 0044 adds the garment browser,
// inventory, and people RPCs. Both are idempotent CREATE OR REPLACE.
const MIGRATIONS = [
  "0043_admin_dashboard_rpcs.sql",
  "0044_admin_dashboard_more.sql",
];

async function main() {
  console.log("Checking dependencies...");
  await preflight();

  for (const file of MIGRATIONS) {
    const sql = fs.readFileSync(path.join(__dirname, "../migrations", file), "utf-8");
    console.log(`Applying ${file}...`);
    await client.unsafe(sql);
  }
  console.log("Admin dashboard RPCs applied successfully!");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
