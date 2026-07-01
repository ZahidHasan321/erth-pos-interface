import "dotenv/config"; import * as fs from "fs"; import * as path from "path"; import { parse } from "csv-parse/sync";
import { db } from "../src/client"; import { sql } from "drizzle-orm";
const DIR="/mnt/339cc06e-972e-45cf-aed0-2b21bc4f4d69/dev/autolinium/erth/seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V10 (Copy)";
const load=(f:string):any[]=>parse(fs.readFileSync(path.join(DIR,f)),{columns:true,skip_empty_lines:true,relax_column_count:true});
const invInt=(s:any)=>{const n=parseInt((s??"").replace(/^0+/,""),10);return Number.isFinite(n)?n:null;};
const norm=(s:any)=>(s??"").trim().toUpperCase().replace(/\s+/g," ");
const day=(s:any)=>s?Math.floor(new Date(s).getTime()/86400000):null;
const d=(s:any)=>s?new Date(s).toISOString().slice(0,10):"";
(async()=>{
  const flags=JSON.parse(fs.readFileSync(path.join(__dirname,"fix-flags.json"),"utf8")).filter((f:any)=>f.reason==="invoice-claimed-by-multiple-customers");
  const fat=load("FATOURA.csv"); const byInv=new Map<number,any[]>();
  for(const f of fat){const i=invInt(f["FATOURA"]); if(i==null)continue; if(!byInv.has(i))byInv.set(i,[]); byInv.get(i)!.push(f);}
  for(const fl of flags){
    const live=(await db.execute(sql`SELECT c.name,c.phone,o.order_date FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=${fl.order_id}`)) as any[];
    const od=day(live[0]?.order_date); const claims=byInv.get(fl.inv)||[];
    let best:any=null,bestDiff=1e9; for(const c of claims){const cd=day(c["INVOICE DATE"]); if(cd==null)continue; const diff=Math.abs(cd-(od??0)); if(diff<bestDiff){bestDiff=diff;best=c;}}
    if(!best) continue;
    const already = norm(best["NAME CUSTOMER"])===norm(live[0]?.name) && (best["PHONE CUSTOMER 📞"]||"").trim()===(live[0]?.phone||"");
    if(already) continue;
    console.log(`\nOrder #${fl.order_id}  (invoice ${fl.inv}, order dated ${d(live[0]?.order_date)})`);
    console.log(`   NOW (wrong) : ${live[0]?.name} (${live[0]?.phone})`);
    console.log(`   SHOULD BE   : ${best["NAME CUSTOMER"]} (${(best["PHONE CUSTOMER 📞"]||"").trim()})  - invoice dated ${d(best["INVOICE DATE"])}`);
  }
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
