import * as fs from "fs";
import { parse } from "csv-parse/sync";
const load = (f: string): any[] => parse(fs.readFileSync(f), { columns: true, skip_empty_lines: true, relax_column_count: true });
const V10 = load("/mnt/339cc06e-972e-45cf-aed0-2b21bc4f4d69/dev/autolinium/erth/seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V10 (Copy)/CUSTOMER.csv");
const V8 = load("/mnt/339cc06e-972e-45cf-aed0-2b21bc4f4d69/dev/autolinium/erth/seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V8/CUSTOMER.csv");

console.log("===== V10 COMMENT (all non-empty) =====");
for (const r of V10) { const c = (r["COMMENT"] || "").trim(); if (c) console.log(`${(r["PHONE"]||"").padEnd(10)} | ${(r["NAME"]||"").padEnd(28)} | ${c}`); }

console.log("\n===== V8 FAM MEMBER (all non-empty) =====");
for (const r of V8) { const c = (r["FAM MEMBER"] || "").trim(); if (c) console.log(`${(r["PHONE"]||"").padEnd(10)} | ${(r["NAME"]||"").padEnd(28)} | ${c}`); }
