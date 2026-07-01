import "dotenv/config"; import * as fs from "fs"; import * as path from "path"; import { parse } from "csv-parse/sync";
import { db } from "../src/client"; import { sql } from "drizzle-orm";
const DIR="/mnt/339cc06e-972e-45cf-aed0-2b21bc4f4d69/dev/autolinium/erth/seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V10 (Copy)";
const load=(f:string):any[]=>parse(fs.readFileSync(path.join(DIR,f)),{columns:true,skip_empty_lines:true,relax_column_count:true});
const invInt=(s:any)=>{const n=parseInt((s??"").replace(/^0+/,""),10);return Number.isFinite(n)?n:null;};
(async()=>{
  const F=load("FATOURA.csv");
  const byInv=new Map<number,Set<string>>();
  for(const f of F){const i=invInt(f["FATOURA"]); if(i==null)continue; const k=`${(f["NAME CUSTOMER"]||"").trim().toUpperCase()}@${(f["PHONE CUSTOMER 📞"]||"").trim()}`; if(!byInv.has(i))byInv.set(i,new Set()); byInv.get(i)!.add(k);}
  const conflicts=[...byInv.entries()].filter(([,s])=>s.size>1);
  console.log("conflicting invoice numbers in FATOURA.csv:", conflicts.length);
  for(const [i,s] of conflicts.slice(0,8)) console.log(`  ${i}: ${[...s].join("  |  ")}`);
  const dupLive = await db.execute(sql`SELECT legacy_invoice_number, count(*) n FROM work_orders WHERE legacy_invoice_number IS NOT NULL GROUP BY legacy_invoice_number HAVING count(*)>1 ORDER BY n DESC LIMIT 8`);
  console.log("live legacy_invoice_number duplicates (top):", JSON.stringify(dupLive));
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
