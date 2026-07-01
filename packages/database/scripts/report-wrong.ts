import "dotenv/config"; import * as fs from "fs"; import * as path from "path"; import { parse } from "csv-parse/sync";
import { db } from "../src/client"; import { sql } from "drizzle-orm";
const DIR="/mnt/339cc06e-972e-45cf-aed0-2b21bc4f4d69/dev/autolinium/erth/seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V10 (Copy)";
const load=(f:string):any[]=>parse(fs.readFileSync(path.join(DIR,f)),{columns:true,skip_empty_lines:true,relax_column_count:true});
const invInt=(s:any)=>{const n=parseInt((s??"").replace(/^0+/,""),10);return Number.isFinite(n)?n:null;};
const d=(s:any)=>s?new Date(s).toISOString().slice(0,10):"";
(async()=>{
  const flags=JSON.parse(fs.readFileSync(path.join(__dirname,"fix-flags.json"),"utf8"));
  const odd=flags.filter((f:any)=>f.reason==="no-fatoura-owner");
  console.log("=== orders whose invoice has NO customer recorded in Airtable ===");
  for(const fl of odd){
    const live=(await db.execute(sql`SELECT c.name,c.phone,o.order_date,o.order_total FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=${fl.order_id}`)) as any[];
    console.log(`  Order #${fl.order_id} (invoice ${fl.inv ?? "?"}) - now under ${live[0]?.name} (${live[0]?.phone}), dated ${d(live[0]?.order_date)}, total ${live[0]?.order_total}`);
  }
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
