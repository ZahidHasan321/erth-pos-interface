import * as fs from "fs";
import { parse } from "csv-parse/sync";
const D = "/mnt/339cc06e-972e-45cf-aed0-2b21bc4f4d69/dev/autolinium/erth/seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V10 (Copy)";
const rows: any[] = parse(fs.readFileSync(D + "/CUSTOMER.csv"), { columns: true, skip_empty_lines: true, relax_column_count: true });
for (const r of rows) {
  if (r["PHONE"] === "99770275")
    console.log({ NAME: r["NAME"], AccountType: r["AccountType"], Relation: r["Relation"], COMMENT: r["COMMENT"], ID: r["ID"] });
}
const dist: Record<string, number> = {};
for (const r of rows) { const a = (r["AccountType"] || "(blank)").trim() || "(blank)"; dist[a] = (dist[a] || 0) + 1; }
console.log("AccountType distribution:", dist);
console.log("rows with Relation:", rows.filter((r) => (r["Relation"] || "").trim()).length);
