import "dotenv/config"; import * as fs from "fs"; import * as path from "path"; import { parse } from "csv-parse/sync";
import { db } from "../src/client"; import { sql } from "drizzle-orm";
const DIR="/mnt/339cc06e-972e-45cf-aed0-2b21bc4f4d69/dev/autolinium/erth/seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V10 (Copy)";
const load=(f:string):any[]=>parse(fs.readFileSync(path.join(DIR,f)),{columns:true,skip_empty_lines:true,relax_column_count:true});
const invInt=(s:any)=>{const n=parseInt((s??"").replace(/^0+/,""),10);return Number.isFinite(n)?n:null;};
const d=(s:any)=>s?new Date(s).toISOString().slice(0,10):"";
const dayN=(s:any)=>s?Math.floor(new Date(s).getTime()/86400000):null;
const ph=(s:any)=>(s||"").trim();
const ACTIVE=new Set(["02 BR PRD","03 PENDING","04 FN WTG","05 FN PRD"]);
(async()=>{
  const fat=load("FATOURA.csv"); const byInv=new Map<number,any[]>();
  for(const f of fat){const i=invInt(f["FATOURA"]); if(i==null)continue; if(!byInv.has(i))byInv.set(i,[]); byInv.get(i)!.push(f);}
  // reused = invoice with >1 distinct person
  const reused=[...byInv.entries()].filter(([,a])=>new Set(a.map(r=>`${(r["NAME CUSTOMER"]||"").trim().toUpperCase()}@${ph(r["PHONE CUSTOMER 📞"])}`)).size>1);
  let lostSettled=0, skippedActive=0, bothPresent=0;
  const lostList:any[]=[];
  for(const [inv,rowsAll] of reused){
    // distinct people rows
    const people=[...new Map(rowsAll.map((r:any)=>[`${(r["NAME CUSTOMER"]||"").trim().toUpperCase()}@${ph(r["PHONE CUSTOMER 📞"])}`,r])).values()];
    const live=(await db.execute(sql`SELECT o.id,o.order_date,c.name,c.phone FROM orders o JOIN customers c ON c.id=o.customer_id JOIN work_orders w ON w.order_id=o.id WHERE w.legacy_invoice_number=${inv}`)) as any[];
    const liveDays=live.map(l=>dayN(l.order_date));
    for(const p of people){
      const pd=dayN(p["INVOICE DATE"]);
      const represented=liveDays.some(ld=>ld!=null&&pd!=null&&Math.abs(ld-pd)<=2);
      if(represented){ continue; }
      const phase=(p["PRODUCTION PHASE"]||"").toUpperCase();
      if(ACTIVE.has(phase)){ skippedActive++; }
      else { lostSettled++; lostList.push({inv, name:p["NAME CUSTOMER"], phone:ph(p["PHONE CUSTOMER 📞"]), date:d(p["INVOICE DATE"]), phase, total:p["TOT DUE"]}); }
    }
    if(live.length>=2) bothPresent++;
  }
  console.log({reused_invoices:reused.length, both_orders_present_in_system:bothPresent, second_order_LOST_settled:lostSettled, second_order_skipped_because_active:skippedActive});
  lostList.sort((a,b)=>(a.date<b.date?1:-1));
  console.log("\n=== LOST settled orders (most recent first) ===");
  for(const x of lostList.slice(0,15)) console.log(`  invoice ${x.inv} | ${x.name} (${x.phone}) | dated ${x.date} | phase ${x.phase} | total ${x.total}`);
  fs.writeFileSync(path.join(__dirname,"lost-orders.json"),JSON.stringify(lostList,null,2));
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
