import * as fs from "fs";
import { parse } from "csv-parse/sync";

const FILES = {
  V10: "/mnt/339cc06e-972e-45cf-aed0-2b21bc4f4d69/dev/autolinium/erth/seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V10 (Copy)/CUSTOMER.csv",
  V8: "/mnt/339cc06e-972e-45cf-aed0-2b21bc4f4d69/dev/autolinium/erth/seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V8/CUSTOMER.csv",
};
const RELWORDS = /\b(son|father|brother|wife|mother|uncle|cousin|husband|daughter|sister|dad|abu|abou|family|relativ|nephew|grand)\b/i;

for (const [tag, file] of Object.entries(FILES)) {
  const rows: any[] = parse(fs.readFileSync(file), { columns: true, skip_empty_lines: true, relax_column_count: true });
  const cols = Object.keys(rows[0]);
  console.log(`\n========== ${tag} (${rows.length} rows, ${cols.length} cols) ==========`);
  // For each column: how many filled, and how many values look like a relation word
  const stats = cols.map((c) => {
    let filled = 0, relish = 0;
    const samples: string[] = [];
    for (const r of rows) {
      const v = (r[c] ?? "").trim();
      if (!v) continue;
      filled++;
      if (RELWORDS.test(v)) { relish++; if (samples.length < 4) samples.push(v); }
    }
    return { col: c, filled, relish, samples };
  });
  // Columns whose values contain relation words
  console.log("\n--- columns with relation-word values ---");
  for (const s of stats.filter((s) => s.relish > 0).sort((a, b) => b.relish - a.relish))
    console.log(`  [${s.col}] filled=${s.filled} relish=${s.relish}  e.g. ${JSON.stringify(s.samples)}`);
}
