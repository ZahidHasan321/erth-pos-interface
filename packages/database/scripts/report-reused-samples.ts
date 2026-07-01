import "dotenv/config"; import * as fs from "fs"; import * as path from "path"; import { parse } from "csv-parse/sync";
import { db } from "../src/client"; import { sql } from "drizzle-orm";
const DIR="/mnt/339cc06e-972e-45cf-aed0-2b21bc4f4d69/dev/autolinium/erth/seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V10 (Copy)";
const load=(f:string):any[]=>parse(fs.readFileSync(path.join(DIR,f)),{columns:true,skip_empty_lines:true,relax_column_count:true});
const invInt=(s:any)=>{const n=parseInt((s??"").replace(/^0+/,""),10);return Number.isFinite(n)?n:null;};
const d=(s:any)=>s?new Date(s).toISOString().slice(0,10):"";
const ph=(s:any)=>(s||"").trim();
(async()=>{
  const fat=load("FATOURA.csv"); const byInv=new Map<number,any[]>();
  for(const f of fat){const i=invInt(f["FATOURA"]); if(i==null)continue; if(!byInv.has(i))byInv.set(i,[]); byInv.get(i)!.push(f);}
  const reused=[...byInv.entries()].filter(([,a])=>{const ppl=new Set(a.map(r=>`${(r["NAME CUSTOMER"]||"").trim().toUpperCase()}@${ph(r["PHONE CUSTOMER 📞"])}`)); return ppl.size>1;});
  // split: same-phone reuse (risky) vs different-phone reuse (safe)
  const samePhone=reused.filter(([,a])=>new Set(a.map(r=>ph(r["PHONE CUSTOMER 📞"]))).size===1);
  const diffPhone=reused.filter(([,a])=>new Set(a.map(r=>ph(r["PHONE CUSTOMER 📞"]))).size>1);
  console.log(`reused invoice numbers total: ${reused.length}  | same-phone(family): ${samePhone.length}  | different-phone(unrelated): ${diffPhone.length}\n`);
  const show=async(label:string, list:any[], k:number)=>{
    console.log(`========== ${label} ==========`);
    for(const [inv,a] of list.slice(0,k)){
      const ppl=[...new Map(a.map((r:any)=>[`${(r["NAME CUSTOMER"]||"").trim().toUpperCase()}@${ph(r["PHONE CUSTOMER 📞"])}`,r])).values()];
      const live=(await db.execute(sql`SELECT o.id,c.name,c.phone,o.order_date FROM orders o JOIN customers c ON c.id=o.customer_id JOIN work_orders w ON w.order_id=o.id WHERE w.legacy_invoice_number=${inv}`)) as any[];
      console.log(`\nInvoice ${inv} was used by ${ppl.length} different people:`);
      for(const r of ppl) console.log(`   - ${r["NAME CUSTOMER"]} (${ph(r["PHONE CUSTOMER 📞"])})  invoice dated ${d(r["INVOICE DATE"])}`);
      console.log(`   Our system: order #${live[0]?.id} dated ${d(live[0]?.order_date)} -> currently under ${live[0]?.name} (${live[0]?.phone})`);
    }
    console.log("");
  };
  await show("SAME PHONE (family) — these are the risky ones", samePhone, 4);
  await show("DIFFERENT PHONE (unrelated) — auto-resolved correctly", diffPhone, 3);
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
