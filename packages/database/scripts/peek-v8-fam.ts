import * as fs from "fs";
import { parse } from "csv-parse/sync";
const D = "/mnt/339cc06e-972e-45cf-aed0-2b21bc4f4d69/dev/autolinium/erth/seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V8";
const rows: any[] = parse(fs.readFileSync(D + "/CUSTOMER.csv"), { columns: true, skip_empty_lines: true, relax_column_count: true });
const cols = Object.keys(rows[0]);
const find = (re: RegExp) => cols.filter((c) => re.test(c));
console.log("relation-ish cols:", find(/relation|fam|account|member/i));
const famCol = "FAM MEMBER", relCol = "Relation", accCol = "AccountType";
let famN = 0, relN = 0, accN = 0;
for (const r of rows) {
  if ((r[famCol] || "").trim()) famN++;
  if ((r[relCol] || "").trim()) relN++;
  if ((r[accCol] || "").trim()) accN++;
}
console.log({ total: rows.length, FAM_MEMBER_filled: famN, Relation_filled: relN, AccountType_filled: accN });
console.log("\n--- phone 99770275 in V8 ---");
for (const r of rows) if (r["PHONE"] === "99770275") console.log({ NAME: r["NAME"], FAM: r[famCol], Relation: r[relCol], Account: r[accCol] });
console.log("\n--- sample non-empty FAM MEMBER rows ---");
let n = 0;
for (const r of rows) { if ((r[famCol] || "").trim() && n < 12) { console.log({ NAME: r["NAME"], PHONE: r["PHONE"], FAM: r[famCol] }); n++; } }
