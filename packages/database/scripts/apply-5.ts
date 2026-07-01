import "dotenv/config"; import * as fs from "fs"; import * as path from "path"; import { parse } from "csv-parse/sync";
import { db } from "../src/client"; import { sql } from "drizzle-orm";
const DIR="/mnt/339cc06e-972e-45cf-aed0-2b21bc4f4d69/dev/autolinium/erth/seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V10 (Copy)";
const load=(f:string):any[]=>parse(fs.readFileSync(path.join(DIR,f)),{columns:true,skip_empty_lines:true,relax_column_count:true});
const invInt=(s:any)=>{const n=parseInt((s??"").replace(/^0+/,""),10);return Number.isFinite(n)?n:null;};
const norm=(s:any)=>(s??"").trim().toUpperCase().replace(/\s+/g," ");
const dayN=(s:any)=>s?Math.floor(new Date(s).getTime()/86400000):null;
const ph=(s:any)=>(s||"").trim();
const APPLY=process.argv.includes("--apply");
const TARGETS=[480,418,864,1376,1492];
(async()=>{
  const fat=load("FATOURA.csv"); const byInv=new Map<number,any[]>();
  for(const f of fat){const i=invInt(f["FATOURA"]); if(i==null)continue; if(!byInv.has(i))byInv.set(i,[]); byInv.get(i)!.push(f);}
  for(const oid of TARGETS){
    const o=(await db.execute(sql`SELECT o.id,o.customer_id,c.name cur,o.order_date,w.legacy_invoice_number inv FROM orders o JOIN customers c ON c.id=o.customer_id JOIN work_orders w ON w.order_id=o.id WHERE o.id=${oid}`)) as any[];
    const inv=Number(o[0].inv); const od=dayN(o[0].order_date);
    const claims=byInv.get(inv)||[]; let best:any=null,bd=1e9;
    for(const c of claims){const cd=dayN(c["INVOICE DATE"]); if(cd==null)continue; const diff=Math.abs(cd-(od??0)); if(diff<bd){bd=diff;best=c;}}
    const tname=best["NAME CUSTOMER"], tphone=ph(best["PHONE CUSTOMER 📞"]);
    const tc=(await db.execute(sql`SELECT id,name FROM customers WHERE phone=${tphone} AND upper(name)=${norm(tname)} LIMIT 1`)) as any[];
    if(!tc.length){ console.log(`order ${oid}: TARGET NOT FOUND (${tname}@${tphone}) - SKIP`); continue; }
    console.log(`order ${oid}: ${o[0].cur}(${o[0].customer_id}) -> ${tc[0].name}(${tc[0].id})`);
    if(APPLY) await db.execute(sql`UPDATE orders SET customer_id=${tc[0].id} WHERE id=${oid}`);
  }
  console.log(APPLY?"APPLIED":"dry-run (pass --apply)");
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
